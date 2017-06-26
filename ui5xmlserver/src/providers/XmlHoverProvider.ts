import { CompletionItemKind, Hover, IConnection, MarkedString, Range, TextDocument, TextDocumentPositionParams, TextDocuments } from "vscode-languageserver";
import { LogLevel } from "../Log";
import { getPositionFromIndex } from "../server";
import { IComplexTypeEx, IElementEx, IFoundCursor, IStorageSchema, XmlBaseHandler, XmlStorage } from "../xmltypes";

export class XmlHoverProvider extends XmlBaseHandler {

    constructor(schemastorage: XmlStorage, private documents: TextDocuments, connection: IConnection, private schemastorePath: string, loglevel: LogLevel) {
        super(schemastorage, connection, loglevel);
        this.schemastorage = schemastorage.schemas;
    }

    public async getHoverInformation(handler: TextDocumentPositionParams): Promise<Hover> {

        const doc = this.documents.get(handler.textDocument.uri);
        const txt = doc.getText();
        const pos = doc.offsetAt(handler.position);

        this.getUsedNamespaces(txt);
        const foundCursor = this.textGetElementAtCursorPos(txt, pos);

        // todo: Maybe bind to this necessary
        this.logDebug((() => {
            let ret: string = "Used Namespaces: ";
            for (const ns in this.usedNamespaces) {
                if (ns) {
                    ret += ns + " = " + this.usedNamespaces[ns] + " | ";
                }
            }
            return ret.substring(0, ret.length - 3);
        }));

        if (foundCursor.isOnElementHeader) {
            if (foundCursor.isOnAttributeName) {
                this.logDebug("Found cursor location to be on attribute");
                return new Promise<Hover>((resolve, reject) => {
                    resolve(this.getHoverItemForAttribute(foundCursor, doc));
                });
            } else {
                this.logDebug("Found cursor location to be in element");
                return new Promise<Hover>((resolve, reject) => {
                    resolve(this.getElementDescription(foundCursor, doc));
                });
            }
        }
    }

    private getElementDescription(cursor: IFoundCursor, doc: TextDocument): Hover {
        this.logDebug("Processing Tagstring: " + cursor.tagName);
        const namespace = this.usedNamespaces[cursor.tagNamespace];
        this.logDebug("Using Namespace: " + namespace);
        const schema = this.schemastorage[namespace];
        this.logDebug("Using Schema: " + schema.targetNamespace);
        const element = this.findElement(cursor.tagName, schema);
        if (element) {
            // Check if this simple type has an enumeration on it
            const header = { language: "xml", value: "<" + cursor.elementHeader + ">"} as MarkedString;
            return {
                contents: [header , MarkedString.fromPlainText(element.annotation ? element.annotation[0].documentation[0] : "")],
                range: {
                    end: doc.positionAt(cursor.endindex),
                    start: doc.positionAt(cursor.startindex),
                },
            };

        }
        return undefined;
    }

    private getHoverItemForAttribute(cursor: IFoundCursor, doc: TextDocument): Hover {
        this.logDebug("Processing Tagstring: " + cursor.tagName);
        const namespace = this.usedNamespaces[cursor.tagNamespace];
        this.logDebug("Using Namespace: " + namespace);
        const schema = this.schemastorage[namespace];
        this.logDebug("Using Schema: " + schema.targetNamespace);
        const element = this.findElement(cursor.tagName, schema);
        this.logDebug(() => "Found element: " + element.$.name);
        const elementType = this.getTypeOf(element) as IComplexTypeEx;
        this.logDebug(() => "Found Element type: " + elementType.$.name);
        const types = this.getBaseTypes(elementType, []);
        if (types && types.length > 0)
            elementType.basetype = types[0];

        const matchingAttribute = elementType.attribute.find((value, index, obj) => value.$.name === cursor.attribute.name);
        if (matchingAttribute) {
            // Check if this simple type has an enumeration on it
            const header = {language: "xml", value: "<" + cursor.fullName + " ... " + cursor.attribute.name + '="' + cursor.attribute.value + '"' + (cursor.isSelfClosingTag ? " ... />" : " ... >")};
            return {
                contents: [header, MarkedString.fromPlainText(matchingAttribute.annotation ? matchingAttribute.annotation[0].documentation[0] : "")],
                range: {
                    end: doc.positionAt(cursor.startindex + cursor.attribute.endpos),
                    start: doc.positionAt(cursor.startindex + cursor.attribute.startpos),
                },
            };

        }
        return undefined;
    }
}
