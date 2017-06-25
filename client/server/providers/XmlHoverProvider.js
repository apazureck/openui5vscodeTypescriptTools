"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const xmltypes_1 = require("../xmltypes");
class XmlHoverProvider extends xmltypes_1.XmlBaseHandler {
    constructor(schemastorage, documents, connection, schemastorePath, loglevel) {
        super(schemastorage, connection, loglevel);
        this.documents = documents;
        this.schemastorePath = schemastorePath;
        this.schemastorage = schemastorage.schemas;
    }
    getHoverInformation(handler) {
        return __awaiter(this, void 0, void 0, function* () {
            const doc = this.documents.get(handler.textDocument.uri);
            const txt = doc.getText();
            const pos = doc.offsetAt(handler.position);
            this.getUsedNamespaces(txt);
            const foundCursor = this.textGetElementAtCursorPos(txt, pos);
            // todo: Maybe bind to this necessary
            this.logDebug((() => {
                let ret = "Used Namespaces: ";
                for (const ns in this.usedNamespaces) {
                    if (ns) {
                        ret += ns + " = " + this.usedNamespaces[ns] + " | ";
                    }
                }
                return ret.substring(0, ret.length - 3);
            }));
            // If current position is in an element, but not in a parameter: <Tag text="Hello" |src="123"...
            if (foundCursor.isInElement && !foundCursor.isOnAttributeName) {
                this.logDebug("Found cursor location to be in element");
                return new Promise((resolve, reject) => {
                    resolve(this.getElementDescription(foundCursor, doc));
                });
            }
            else if (foundCursor.isOnAttributeName) {
                return new Promise((resolve, reject) => {
                    resolve(this.getHoverItemForAttribute(foundCursor, doc));
                });
            }
        });
    }
    getElementDescription(cursor, doc) {
        this.logDebug("Processing Tagstring: " + cursor.tagName);
        const namespace = this.usedNamespaces[cursor.tagNamespace];
        this.logDebug("Using Namespace: " + namespace);
        const schema = this.schemastorage[namespace];
        this.logDebug("Using Schema: " + schema.targetNamespace);
        const element = this.findElement(cursor.tagName, schema);
        if (element) {
            // Check if this simple type has an enumeration on it
            return {
                contents: element.annotation ? element.annotation[0].documentation : "",
                range: {
                    end: doc.positionAt(cursor.endindex),
                    start: doc.positionAt(cursor.startindex),
                },
            };
        }
        return undefined;
    }
    getHoverItemForAttribute(cursor, doc) {
        this.logDebug("Processing Tagstring: " + cursor.tagName);
        const namespace = this.usedNamespaces[cursor.tagNamespace];
        this.logDebug("Using Namespace: " + namespace);
        const schema = this.schemastorage[namespace];
        this.logDebug("Using Schema: " + schema.targetNamespace);
        const element = this.findElement(cursor.tagName, schema);
        this.logDebug(() => "Found element: " + element.$.name);
        const elementType = this.getTypeOf(element);
        this.logDebug(() => "Found Element type: " + elementType.$.name);
        const types = this.getBaseTypes(elementType, []);
        if (types && types.length > 0)
            elementType.basetype = types[0];
        const matchingAttribute = elementType.attribute.find((value, index, obj) => value.$.name === cursor.attribute.name);
        if (matchingAttribute) {
            // Check if this simple type has an enumeration on it
            return {
                contents: matchingAttribute.annotation ? matchingAttribute.annotation[0].documentation : "",
                range: {
                    end: doc.positionAt(cursor.startindex + cursor.attribute.endpos),
                    start: doc.positionAt(cursor.startindex + cursor.attribute.startpos),
                },
            };
        }
        return undefined;
    }
}
exports.XmlHoverProvider = XmlHoverProvider;
//# sourceMappingURL=XmlHoverProvider.js.map