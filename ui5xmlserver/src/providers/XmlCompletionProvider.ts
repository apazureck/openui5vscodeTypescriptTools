import { TextDocumentPositionParams, CompletionItem, TextDocuments, IConnection, CompletionItemKind } from 'vscode-languageserver'
import { ComplexTypeEx, ElementEx, FoundCursor, StorageSchema, XmlBaseHandler, XmlStorage } from '../xmltypes';
import { LogLevel } from '../Log';
import * as fs from 'fs';
import * as path from 'path';
import * as xml from 'xml2js';

export class XmlCompletionHandler extends XmlBaseHandler {
	constructor(schemastorage: XmlStorage, private documents: TextDocuments, connection: IConnection, private schemastorePath: string, loglevel: LogLevel) {
		super(schemastorage, connection, loglevel);
		this.schemastorage = schemastorage.schemas
	}

	async getCompletionSuggestions(handler: TextDocumentPositionParams): Promise<CompletionItem[]> {

		let doc = this.documents.get(handler.textDocument.uri);
		let txt = doc.getText();
		let pos = doc.offsetAt(handler.position);

		this.getUsedNamespaces(txt);
		let foundCursor = this.textGetElementAtCursorPos(txt, pos);

		// todo: Maybe bind to this necessary
		this.logDebug((() => {
			let ret: string = "Used Namespaces: "
			for (let ns in this.usedNamespaces)
				ret += ns + " = " + this.usedNamespaces[ns] + " | ";
			return ret.substring(0, ret.length - 3);
		}));

		// If current position is in an element, but not in a parameter: <Tag text="Hello" |src="123"...
		if (foundCursor.isInElement && !foundCursor.isInAttribute) {
			this.logDebug("Found cursor location to be in element");

			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.getElementsInTag(foundCursor));
			});

		} else if (!foundCursor.isInElement) {
			this.logDebug("Cursor location is in an element body.");

			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.getElementsInBody(foundCursor));
			});
		}
	}

	getElementsInAttribute(cursor: FoundCursor): CompletionItem[] {
		return undefined;
	}

	private getElementsInTag(cursor: FoundCursor): CompletionItem[] {
		this.logDebug("Processing Tagstring: " + cursor.tagName);
		let namespace = this.usedNamespaces[cursor.tagNamespace];
		this.logDebug("Using Namespace: " + namespace)
		let schema = this.schemastorage[namespace];
		this.logDebug("Using Schema: " + schema.targetNamespace);
		let element = this.findElement(cursor.tagName, schema);
		this.logDebug(() => "Found element: " + element.$.name);
		let elementType = this.getTypeOfElement(element);
		this.logDebug(() => "Found Element type: " + elementType.$.name);
		let types = this.getBaseTypes(elementType, []);
		if (types && types.length > 0)
			elementType.basetype = types[0];

		let attributes = this.getAttributes(elementType);

		this.logDebug(() => "Found " + attributes.length + " Attributes");
		let ret: CompletionItem[] = [];
		for (let attribute of attributes) {
			if (!(cursor.attributes.findIndex(x => x.name === attribute.$.name) > 0))
				ret.push(this.getCompletionItemForAttribute(attribute, schema));
		}
		return ret;
	}

	private getCompletionItemForAttribute(attribute: Attribute, schema: StorageSchema): CompletionItem {
		let ce: CompletionItem = {
			label: attribute.$.name,
			kind: CompletionItemKind.Property,
			insertText: " " + attribute.$.name + "=\"$0\" ",
			insertTextFormat: 2
		}
		try {
			ce.detail = attribute.__owner ? "from " + attribute.__owner.$.name : undefined;
		} catch (error) {

		}
		try {
			ce.documentation = attribute.annotation[0].documentation[0]
		} catch (error) {

		}
		return ce;
	}

	private getElementsInBody(cursor: FoundCursor): CompletionItem[] {
		let foundElements: { namespace: string, elements: Element[], ciKind?: CompletionItemKind }[] = [];
		let baseElements: Element[] = [];

		// copy path to leave original intact
		let path = cursor.path;
		let part: string;
		let downpath: string[] = [];
		let element: ElementEx;

		// Try to find current element in schema
		element = this.findElement(this.getElementName(cursor.fullName), this.getSchema(cursor.fullName));

		// If not found and there is a path try to crawl down the path to get fitting elements
		if (!element && cursor.path.length > 0) {
			downpath.push(cursor.fullName);
			// go down the path to get the first parent element in the owning schema
			while (part = path.pop()) {
				element = this.findElement(part, this.getSchema(part))
				if (element) {
					break;
				} else {
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
			element = this.getElementFromReference(element.$.ref, element.ownerschema);
		}

		// Get the type (if there)
		let elements = this.getRightSubElements(element, downpath);

		let derivedelements: { namespace: string, elements: Element[] }[] = [];

		let ownelements: Element[] = [];

		for (let e of elements)
			// Get Type if type is given as attribute, which indicates it may be used by others.
			if (e.$ && e.$.type) {
				derivedelements = derivedelements.concat(this.getDerivedElements(e, element.ownerschema));
				// Get Elements if type is a reference
			} else if (e.$ && e.$.ref) {
				e = this.getElementFromReference(e.$.ref, element.ownerschema);
				if (e && e.$ && e.$.type)
					derivedelements = derivedelements.concat(this.getDerivedElements(e, element.ownerschema));
			} else {
				ownelements.push(e);
			}

		// Append additional elements
		for (let ns in this.usedNamespaces) {
			if (this.usedNamespaces[ns] === element.ownerschema.targetNamespace) {
				foundElements.push({ namespace: ns, elements: ownelements, ciKind: CompletionItemKind.Property });
				break;
			}
		}

		foundElements = foundElements.concat(derivedelements);
		let ret: CompletionItem[] = [];
		for (let item of foundElements) {
			for (let entry of item.elements)
				try {
					let citem = CompletionItem.create(entry.$.name);
					let nsprefix = item.namespace.length > 0 ? item.namespace + ":" : "";
					citem.insertText = "<" + nsprefix + entry.$.name + ">$0</" + nsprefix + entry.$.name + ">";
					citem.insertTextFormat = 2;
					citem.kind = item.ciKind || CompletionItemKind.Class;
					if (item.namespace.length > 0)
						citem.detail = "Namespace: " + item.namespace;
					try {
						citem.documentation = entry.annotation[0].documentation[0];
					} catch (error) {

					}
					ret.push(citem);
				} catch (error) {
					this.connection.console.error("Item error: " + error.toString());
				}
		}

		return ret;
	}
}