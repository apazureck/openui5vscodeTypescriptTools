"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const vscode_languageserver_1 = require('vscode-languageserver');
const Log_1 = require('../Log');
const fs = require('fs');
const path = require('path');
const xml = require('xml2js');
class XmlCompletionHandler extends Log_1.Log {
    constructor(schemastorage, documents, connection, schemastorePath, loglevel) {
        super(connection, loglevel);
        this.schemastorage = schemastorage;
        this.documents = documents;
        this.schemastorePath = schemastorePath;
    }
    getCompletionSuggestions(handler) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.schemastorage)
                yield this.createSchemas();
            let doc = this.documents.get(handler.textDocument.uri);
            let txt = doc.getText();
            let pos = doc.offsetAt(handler.position);
            let start, end;
            let isInElement = true;
            let isInParamValue = false;
            // Catch border Problem i always equals the element right of the cursor.
            if (txt[pos] === ">")
                pos--;
            else if (txt[pos] === "<")
                pos++;
            let quote;
            let quotesfoundct = 0;
            // Crawl backwards to find out where the cursor location is. In a parameter quote part or inside an element body.
            for (start = pos; start >= 0; start--) {
                switch (txt[start]) {
                    case '<':
                        if (!quote)
                            break;
                    case "=":
                        // if = occurs maybe search is a parameter value
                        if (quotesfoundct == 1)
                            for (let checkpos = pos; checkpos < txt.length; checkpos++) {
                                switch (txt[checkpos]) {
                                    case quote:
                                        isInParamValue = true;
                                        break;
                                    case "<":
                                    case ">":
                                    case "/":
                                        break;
                                    default:
                                        continue;
                                }
                                break;
                            }
                        if (isInParamValue)
                            break;
                        else
                            continue;
                    case '>':
                        if (!quote)
                            isInElement = false;
                        break;
                    case quote:
                        quote = undefined;
                        continue;
                    case "'":
                    case '"':
                        quotesfoundct++;
                        if (!quote)
                            quote = txt[start];
                        continue;
                    default:
                        continue;
                }
                if (txt[start] === '<') {
                    break;
                }
                else if (txt[start] === '>')
                    isInElement = false;
                break;
            }
            this.logDebug(() => "Found start tag at index " + start + " '" + txt.substring(start, pos) + "'");
            let endtag = '<';
            if (isInElement)
                endtag = '>';
            this.getUsedNamespaces(txt);
            // todo: Maybe bind to this necessary
            this.logDebug((() => {
                let ret = "Used Namespaces: ";
                for (let ns in this.usedNamespaces)
                    ret += ns + " = " + this.usedNamespaces[ns] + " | ";
                return ret.substring(0, ret.length - 3);
            }));
            // If current position is in an element, but not in a parameter: <Tag text="Hello" |src="123"...
            if (isInElement && !isInParamValue) {
                quote = undefined;
                for (end = pos; end < txt.length; end++) {
                    switch (txt[end]) {
                        case quote:
                            quote = undefined;
                            continue;
                        case "'":
                        case '"':
                            if (!quote)
                                quote = txt[end];
                            continue;
                        case endtag:
                            break;
                    }
                    break;
                }
                this.logDebug("Found cursor location to be in element");
                return new Promise((resolve, reject) => {
                    resolve(this.processInTag(txt.substring(start, end + 1)));
                });
            }
            else if (!isInElement) {
                this.logDebug("Cursor location is in an element body.");
                let parent = this.getParentElement(txt, start, []);
                let tag = parent.element.$.name.match(/(\w*?):?(\w*)$/);
                let schema = this.schemastorage[this.usedNamespaces[tag[1]]];
                let type = this.getType(parent.element.$.type, schema);
                let elements = this.getElements(type, parent.path, schema);
                return new Promise((resolve, reject) => {
                    resolve(this.processAllowedElements(parent.element, elements, schema));
                });
            }
        });
    }
    processAllowedElements(parent, elements, schema) {
        let foundElements = [];
        let baseElements = [];
        // First get all element references, if referenced.
        for (let element of elements) {
            try {
                let useschema = schema;
                if (element.$ && element.$.ref) {
                    let res = this.getElementFromReference(element.$.ref, useschema);
                    element = res.element;
                    useschema = res.ownerSchema;
                    if (!element) {
                        continue;
                    }
                }
                baseElements.push(element);
                foundElements = foundElements.concat(this.getDerivedElements(element, useschema));
            }
            catch (error) {
                this.connection.console.error("Error getting element: " + error.toString());
            }
        }
        // Append additional elements
        for (let ns in this.usedNamespaces) {
            if (this.usedNamespaces[ns] === schema.targetNamespace) {
                foundElements.push({ namespace: ns, elements: baseElements });
                break;
            }
        }
        let ret = [];
        for (let item of foundElements) {
            for (let entry of item.elements)
                try {
                    let citem = vscode_languageserver_1.CompletionItem.create(entry.$.name);
                    let nsprefix = item.namespace.length > 0 ? item.namespace + ":" : "";
                    citem.insertText = "<" + nsprefix + entry.$.name + ">$0</" + nsprefix + entry.$.name + ">";
                    citem.insertTextFormat = 2;
                    citem.kind = vscode_languageserver_1.CompletionItemKind.Class;
                    if (item.namespace.length > 0)
                        citem.detail = "Namespace: " + item.namespace;
                    try {
                        citem.documentation = entry.annotation[0].documentation[0];
                    }
                    catch (error) {
                    }
                    ret.push(citem);
                }
                catch (error) {
                    this.connection.console.error("Item error: " + error.toString());
                }
        }
        return ret;
    }
    getDerivedElements(element, owningSchema) {
        var type = this.getType(element.$.type, owningSchema);
        // Find all schemas using the owningSchema (and so maybe the element)
        let schemasUsingNamespace = [];
        for (let targetns in this.schemastorage) {
            if (targetns === owningSchema.targetNamespace)
                continue;
            let curschema = this.schemastorage[targetns];
            for (let namespace in curschema.referencedNamespaces)
                // check if xsd file is referenced in current schema.
                if (curschema.referencedNamespaces[namespace] === owningSchema.targetNamespace) {
                    for (let nsa in this.usedNamespaces)
                        // check if namespace is also used in current xml file
                        if (this.usedNamespaces[nsa] === curschema.targetNamespace) {
                            schemasUsingNamespace.push({ nsabbrevation: nsa, schema: curschema });
                            break;
                        }
                }
        }
        let foundElements = [];
        for (let schema of schemasUsingNamespace) {
            try {
                let newentry = { namespace: schema.nsabbrevation, elements: [] };
                for (let e of schema.schema.schema.element) {
                    if (!e.$ || !e.$.type)
                        continue;
                    try {
                        let basetypes = this.getBaseTypes(this.getType(e.$.type, schema.schema), schema.schema);
                        let i = basetypes.findIndex(x => { try {
                            return x.$.name === type.$.name;
                        }
                        catch (error) {
                            return false;
                        } });
                        if (i > -1)
                            newentry.elements.push(e);
                    }
                    catch (error) {
                        console.warn("Inner Error when finding basetype: " + error.toString());
                    }
                }
                foundElements.push(newentry);
            }
            catch (error) {
                console.warn("Outer Error when finding basetype: " + error.toString());
            }
        }
        return foundElements;
    }
    getBaseTypes(type, schema, path) {
        if (!path)
            path = [];
        try {
            let newtypename = type.complexContent[0].extension[0].$.base;
            let newtype = this.getType(newtypename, schema);
            path.push(newtype);
            this.getBaseTypes(newtype, schema, path);
        }
        catch (error) {
        }
        return path;
    }
    getElementFromReference(elementref, schema) {
        // Split namespace and 
        let nsregex = elementref.match(/(\w*?):?(\w+?)$/);
        if (schema.referencedNamespaces[nsregex[1]] !== schema.targetNamespace)
            schema = this.schemastorage[schema.referencedNamespaces[nsregex[1]]];
        return { element: this.findElement(nsregex[2], schema), ownerSchema: schema };
    }
    getElements(type, path, schema) {
        // Get the sequence from the type
        let curElement;
        // is derived type
        if (type.complexContent) {
            curElement = type.complexContent[0].extension[0];
            // Resolve path -> Crawl down the sequences (which contain the xml elements)
            let curPath;
            while (curPath = path.pop())
                curElement = curElement.sequence[0].element.find(x => x.$.name === curPath);
        }
        let elements = this.getElementsFromSequenceAndChoice(curElement, schema);
        // Get choice // TODO: Maybe this is not the only way
        return elements;
    }
    getElementsFromSequenceAndChoice(element, schema) {
        let res = [];
        // If element contains a complexType
        if (element.complexType)
            element = element.complexType[0];
        if (element.sequence) {
            let sequence = element.sequence[0];
            if (sequence.choice) {
                let choice = sequence.choice[0];
                if (choice.element)
                    res = res.concat(choice.element);
            }
            if (sequence.element)
                res = res.concat(sequence.element);
        }
        return res;
    }
    getParentElement(txt, start, path) {
        this.log();
        this.logDebug("Getting parent element");
        // reverse search string
        let searchstring = txt.substring(0, start).split("").reverse().join("");
        let elregex = /.*?[>|<]/g;
        let m;
        let level = 0;
        let comment = false;
        let startofbaseelement;
        let foundstring = "";
        let quote;
        let regx = /(>(?!--|.*>)[\s\S]*?<)/g;
        let rpos = 0;
        let p = [];
        let lm = regx.exec(txt);
        while (m = regx.exec(txt)) {
            if (m.index > start) {
                let i = 0;
            }
            let part = txt.substring(lm.index, m.index);
            let inner = txt.substring(lm.index + lm[0].length, m.index);
            lm = m;
            this.logDebug("Found potential element '" + inner + "'");
            // 1: slash at start, if closing tag
            // 2: namespace
            // 3: name
            // 4: whole name with namespace
            // 5: space or stringend, if empty opening tag
            // 6: arguments, if There
            // 7: / at the end if self closing element
            let tag = inner.match(/^(\/?)(\w*?):?(\w+?)(\s|.$)(.*?)(\/?)$/);
            if (comment || !tag) {
                if (inner.startsWith("!--")) {
                    comment = true;
                    this.logDebug("Found comment");
                }
                if (inner.endsWith("--")) {
                    comment = false;
                    this.logDebug("Comment ended");
                }
            }
            else if (tag[1] === "/") {
                p.pop();
                this.logDebug(() => "Found closing tag. New Stack: " + p.join(" > "));
            }
            else if (tag[6]) {
                this.logDebug("Found self closing element '" + tag[2] + "'");
            }
            else {
                if (tag[4].match(/\w/))
                    p.push(tag[3] + tag[4]);
                else
                    p.push(tag[3]);
                this.logDebug("Found opening tag '" + tag[2] + "'. New Stack: " + p.join(" > "));
            }
        }
        while (m = elregex.exec(searchstring)) {
            this.logDebug(() => "New Search string: '" + m[0].split('').reverse().join('') + "'");
            if (!comment) {
                if (m[0].startsWith("--")) {
                    this.logDebug(" '--' found: Starting Comment");
                    comment = true;
                }
                else if (m[0].endsWith("/<")) {
                    this.logDebug("'</' found at the start: New Level: " + (++level));
                }
                else if (m[0].startsWith("/")) {
                    this.logDebug("'/>' found at the end: New Level: " + (++level));
                }
                else if (m[0].endsWith("<")) {
                    if (level <= 0) {
                        startofbaseelement = m.index;
                        // Add Whitespace to make regex more simple
                        let foundelement = txt.substring(start - startofbaseelement - m[0].length, start) + " ";
                        this.logDebug("Found Element '" + foundelement + "', trying to get name and namespace");
                        let x = foundelement.match(/<(\w*?):?(\w+?)(\s|\/|>)/);
                        let schema = this.schemastorage[this.usedNamespaces[x[1]]];
                        this.logDebug("Found Schema for namespace abbrevation: " + schema.targetNamespace);
                        let element = this.findElement(x[2].trim(), schema);
                        this.logDebug(() => "Found element " + element.$.name);
                        if (!element) {
                            path.push(x[2].trim());
                            this.logDebug(() => "No Element found. Crawling up to next element via path: " + path.join("/"));
                            return this.getParentElement(txt, start - startofbaseelement - m[0].length - 1, path);
                        }
                        else
                            return { element: element, path: path };
                    }
                    else {
                        this.logDebug("'<' found at the end: New Level: " + --level);
                    }
                }
            }
            if (m[0].endsWith("--!<")) {
                this.logDebug("Found end of comment.");
                comment = false;
            }
        }
    }
    processInTag(tagstring) {
        this.logDebug("Processing Tagstring: " + tagstring);
        let tagmatch = tagstring.match(/^<(\w*?):?(\w*?)[\s\/]/);
        let tag = { name: tagmatch[2], namespace: tagmatch[1] };
        let namespace = this.usedNamespaces[tag.namespace];
        this.logDebug("Using Namespace: " + namespace);
        let schema = this.schemastorage[namespace];
        this.logDebug("Using Schema: " + schema.targetNamespace);
        let element = this.findElement(tag.name, schema);
        this.logDebug(() => "Found element: " + element.$.name);
        let elementType = this.getType(element.$.type, schema);
        this.logDebug(() => "Found Element type: " + elementType.$.name);
        let attributes = this.getAttributes(elementType, schema);
        this.logDebug(() => "Found " + attributes.length + " Attributes");
        let ret = [];
        for (let attribute of attributes) {
            ret.push(this.getCompletionItemFromAttribute(attribute, schema));
        }
        return ret;
    }
    getCompletionItemFromAttribute(attribute, schema) {
        let ce = {
            label: attribute.$.name,
            kind: vscode_languageserver_1.CompletionItemKind.Property,
            insertText: " " + attribute.$.name + "=\"$0\" ",
            insertTextFormat: 2
        };
        try {
            ce.detail = attribute.__owner ? "from " + attribute.__owner.$.name : undefined;
        }
        catch (error) {
        }
        try {
            ce.documentation = attribute.annotation[0].documentation[0];
        }
        catch (error) {
        }
        return ce;
    }
    getAttributes(type, schema) {
        if (type.basetype) {
            for (let att of type.complexContent[0].extension[0].attribute)
                att.__owner = type;
            return this.getAttributes(type.basetype, type.schema).concat(type.complexContent[0].extension[0].attribute);
        }
        else {
            for (let att of type.attribute)
                att.__owner = type;
            return type.attribute;
        }
    }
    getType(typename, schema) {
        let aType = typename.split(":");
        let tn, namespace;
        if (aType.length > 1) {
            namespace = aType[0];
            tn = aType[1];
        }
        else {
            tn = typename;
        }
        let complexTypes = schema.schema.complexType;
        if (namespace) {
            if (schema.referencedNamespaces[namespace] !== schema.targetNamespace) {
                let newschema = this.schemastorage[schema.referencedNamespaces[namespace]];
                return this.getType(typename, newschema);
            }
        }
        let complextype;
        for (complextype of complexTypes) {
            if (!complextype.$)
                continue;
            if (!complextype.$.name)
                continue;
            if (complextype.$.name === tn) {
                // If complextype has complex content it is derived.
                if (complextype.complexContent) {
                    let basetypename = complextype.complexContent[0].extension[0].$.base;
                    let basetype = this.getType(basetypename, schema);
                    complextype.basetype = basetype;
                }
                complextype.schema = schema;
                return complextype;
            }
        }
    }
    findElement(name, schema) {
        // Iterate over all
        for (let element of schema.schema.element) {
            if (!element.$)
                continue;
            if (!element.$.name)
                continue;
            if (element.$.name !== name)
                continue;
            if (!element.$.type)
                continue;
            return element;
        }
    }
    /**
     * gets the used namespaces in the input string. The used namespaces are stored in the usedNamespaces property.
     *
     * @param {string} input Input xml string to get the namespaces from
     *
     * @memberOf XmlCompletionHandler
     */
    getUsedNamespaces(input) {
        let xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g;
        let match;
        this.usedNamespaces = {};
        while (match = xmlnsregex.exec(input))
            this.usedNamespaces[match[1]] = match[2];
    }
    createSchemas() {
        return __awaiter(this, void 0, void 0, function* () {
            this.schemastorage = {};
            this.connection.console.info("Creating Schema storage.");
            for (let file of fs.readdirSync(this.schemastorePath)) {
                try {
                    let xmltext = fs.readFileSync(path.join(this.schemastorePath, file)).toString();
                    yield new Promise((resolve, reject) => {
                        xml.parseString(xmltext, { normalize: true }, (err, res) => {
                            if (err)
                                return reject(err);
                            let tns = xmltext.match(/targetNamespace\s*?=\s*?["'](.*?)["']/);
                            if (tns) {
                                let nsregex = /xmlns:(.*?)\s*?=\s*?["'](.*?)["']/g;
                                let ns;
                                let schemanamespace;
                                let namespaces = {};
                                while (ns = nsregex.exec(xmltext)) {
                                    if (ns[2] === "http://www.w3.org/2001/XMLSchema")
                                        schemanamespace = ns[1];
                                    else
                                        namespaces[ns[1]] = ns[2];
                                }
                                this.connection.console.info("Found a valid schema. Renaming namespace abbrevation '" + schemanamespace + " to empty abbrevation to make it more readable for programmers.");
                                if (namespaces[""]) {
                                    this.connection.console.error("There is an empty namespace. It will be missinterpreted, as for lazynessreasons of the author the xsd namespace will be removed from all elements.");
                                }
                                var start = schemanamespace + ":";
                                res = substitute(res, (key, value) => {
                                    if (key.startsWith(start)) {
                                        return key.split(":")[1];
                                    }
                                    return key;
                                });
                                this.connection.console.info("Converted schema " + schemanamespace);
                                if (schemanamespace)
                                    this.schemastorage[tns[1]] = { schemanamespace: schemanamespace, schema: res.schema, referencedNamespaces: namespaces, targetNamespace: tns[1] };
                                else
                                    return reject("No Schema namespace defined, make sure your schema is compared against 'http://www.w3.org/2001/XMLSchema'");
                                return resolve();
                            }
                            else
                                return reject({ message: "No Target Namespace found in schema '" + file + "'" });
                        });
                    });
                }
                catch (error) {
                    return this.connection.console.warn("Could not open Schema '" + file + "': " + JSON.stringify(error));
                }
            }
        });
    }
}
exports.XmlCompletionHandler = XmlCompletionHandler;
/**
 * Replaces the key. Return old key if key should not be renamed.
 *
 * @param {*} o
 * @param {(key: string, value: any, parent: {}) => string} func
 */
function substitute(o, func) {
    let build = {};
    for (let i in o) {
        let newkey = func.apply(this, [i, o[i], o]);
        let newobject = o[i];
        if (o[i] !== null && typeof (o[i]) == "object") {
            if (o[i] instanceof Array) {
                newobject = [];
                for (let entry of o[i])
                    newobject.push(substitute({ [i]: entry }, func)[newkey]);
            }
            else
                newobject = substitute(o[i], func);
        }
        build[newkey] = newobject;
    }
    return build;
}
//# sourceMappingURL=XmlCompletionProvider.js.map