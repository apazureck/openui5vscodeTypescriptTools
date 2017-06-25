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
const xmltypes_1 = require('../xmltypes');
class XmlCompletionHandler extends xmltypes_1.XmlBaseHandler {
    constructor(schemastorage, document, connection, schemastorePath, loglevel) {
        super(schemastorage, connection, loglevel);
        this.document = document;
        this.schemastorePath = schemastorePath;
        this.schemastorage = schemastorage.schemas;
    }
    getCompletionSuggestions(handler) {
        return __awaiter(this, void 0, void 0, function* () {
            const txt = this.document.getText();
            const pos = this.document.offsetAt(handler.position);
            this.getUsedNamespaces(txt);
            const foundCursor = this.textGetElementAtCursorPos(txt, pos);
            // todo: Maybe bind to this necessary
            this.logDebug((() => {
                let ret = "Used Namespaces: ";
                for (let ns in this.usedNamespaces)
                    ret += ns + " = " + this.usedNamespaces[ns] + " | ";
                return ret.substring(0, ret.length - 3);
            }));
            // If current position is in an element, but not in a parameter: <Tag text="Hello" |src="123"...
            if (foundCursor.isInElement && !foundCursor.isInAttribute) {
                this.logDebug("Found cursor location to be in element");
                return new Promise((resolve, reject) => {
                    resolve(this.getElementsInTagHeader(foundCursor));
                });
            }
            else if (!foundCursor.isInElement) {
                this.logDebug("Cursor location is in an element body.");
                return new Promise((resolve, reject) => {
                    resolve(this.getElementsInBody(foundCursor));
                });
            }
            else if (foundCursor.isInAttribute) {
                return new Promise((resolve, reject) => {
                    resolve(this.getCompletionItemsForAttribute(foundCursor));
                });
            }
        });
    }
    getCompletionItemsForAttribute(cursor) {
        this.logDebug("Processing Tagstring: " + cursor.tagName);
        let namespace = this.usedNamespaces[cursor.tagNamespace];
        this.logDebug("Using Namespace: " + namespace);
        let schema = this.schemastorage[namespace];
        this.logDebug("Using Schema: " + schema.targetNamespace);
        const element = this.findElement(cursor.tagName, schema);
        this.logDebug(() => "Found element: " + element.$.name);
        const elementType = this.getTypeOf(element);
        this.logDebug(() => "Found Element type: " + elementType.$.name);
        const types = this.getBaseTypes(elementType, []);
        if (types && types.length > 0)
            elementType.basetype = types[0];
        const matchingAttributeType = elementType.attribute.find((value, index, obj) => value.$.name === cursor.attribute.name);
        if (matchingAttributeType) {
            // Check if this simple type has an enumeration on it
            const attributetype = this.getTypeOf(matchingAttributeType);
            if (attributetype.restriction && attributetype.restriction[0].enumeration) {
                return attributetype.restriction[0].enumeration.map((value, index, array) => {
                    return {
                        label: value.$.value,
                        documentation: value.annotation ? (value.annotation[0].documentation ? this.markdownText(value.annotation[0].documentation[0]) : "") : "",
                        kind: vscode_languageserver_1.CompletionItemKind.Enum
                    };
                });
            }
        }
        return undefined;
    }
    getElementsInTagHeader(cursor) {
        this.logDebug("Processing Tagstring: " + cursor.tagName);
        let namespace = this.usedNamespaces[cursor.tagNamespace];
        this.logDebug("Using Namespace: " + namespace);
        let schema = this.schemastorage[namespace];
        this.logDebug("Using Schema: " + schema.targetNamespace);
        let element = this.findElement(cursor.tagName, schema);
        this.logDebug(() => "Found element: " + element.$.name);
        let elementType = this.getTypeOf(element);
        this.logDebug(() => "Found Element type: " + elementType.$.name);
        let types = this.getBaseTypes(elementType, []);
        if (types && types.length > 0)
            elementType.basetype = types[0];
        let attributes = this.getAttributes(elementType);
        this.logDebug(() => "Found " + attributes.length + " Attributes");
        let ret = [];
        for (const attribute of attributes) {
            if (!(cursor.attributes.findIndex(x => x.name === attribute.$.name) > 0))
                ret.push(this.getCompletionItemForSingleAttribute(attribute, schema));
        }
        return ret;
    }
    getCompletionItemForSingleAttribute(attribute, schema) {
        const ce = {
            label: attribute.$.name,
            kind: vscode_languageserver_1.CompletionItemKind.Property,
            insertText: " " + attribute.$.name + "=\"$0\" ",
            insertTextFormat: 2
        };
        try {
            ce.detail = attribute.owner ? "from " + attribute.owner.$.name : undefined;
        }
        catch (error) {
        }
        try {
            ce.documentation = this.markdownText(attribute.annotation[0].documentation[0]);
        }
        catch (error) {
        }
        return ce;
    }
    getElementsInBody(cursor) {
        let foundElements = [];
        let baseElements = [];
        // copy path to leave original intact
        let path = cursor.path;
        let part;
        let downpath = [];
        let element;
        // Try to find current element in schema
        element = this.findElement(this.getElementName(cursor.fullName), this.getSchema(cursor.fullName));
        // If not found and there is a path try to crawl down the path to get fitting elements
        if (!element && cursor.path.length > 0) {
            downpath.push(cursor.fullName);
            // go down the path to get the first parent element in the owning schema
            while (part = path.pop()) {
                element = this.findElement(this.getElementName(part), this.getSchema(part));
                if (element) {
                    break;
                }
                else {
                    downpath.push(part);
                }
            }
        }
        if (!element) {
            this.logInfo("Element not found.");
            return;
        }
        // Find out if element is referenced first
        if (element.$ && element.$.ref) {
            element = this.getElementFromReference(element.$.ref, element.schema);
        }
        // Get the type (if there)
        let elements = this.getRightSubElements(element, downpath);
        let derivedelements = [];
        let ownelements = [];
        for (let e of elements)
            // Get Type if type is given as attribute, which indicates it may be used by others.
            if (e.$ && e.$.type) {
                derivedelements = derivedelements.concat(this.getDerivedElements(e, element.schema));
            }
            else if (e.$ && e.$.ref) {
                e = this.getElementFromReference(e.$.ref, element.schema);
                if (e && e.$ && e.$.type)
                    derivedelements = derivedelements.concat(this.getDerivedElements(e, element.schema));
            }
            else {
                ownelements.push(e);
            }
        // Append additional elements
        for (const ns in this.usedNamespaces) {
            if (this.usedNamespaces[ns] === element.schema.targetNamespace) {
                foundElements.push({ namespace: ns, elements: ownelements, ciKind: vscode_languageserver_1.CompletionItemKind.Property });
                break;
            }
        }
        foundElements = foundElements.concat(derivedelements);
        let ret = [];
        for (let item of foundElements) {
            for (const entry of item.elements)
                try {
                    const citem = vscode_languageserver_1.CompletionItem.create(entry.$.name);
                    const nsprefix = item.namespace.length > 0 ? item.namespace + ":" : "";
                    citem.insertText = "<" + nsprefix + entry.$.name + ">$0</" + nsprefix + entry.$.name + ">";
                    citem.insertTextFormat = 2;
                    citem.kind = item.ciKind || vscode_languageserver_1.CompletionItemKind.Class;
                    if (item.namespace.length > 0)
                        citem.detail = "Namespace: " + item.namespace;
                    try {
                        citem.documentation = this.markdownText(entry.annotation[0].documentation[0]);
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
}
exports.XmlCompletionHandler = XmlCompletionHandler;
//# sourceMappingURL=XmlCompletionProvider.js.map