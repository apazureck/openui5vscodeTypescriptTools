import { CompletionItem, CompletionItemKind, IConnection, TextDocument, TextDocumentPositionParams, TextDocuments } from "vscode-languageserver";
import { LogLevel } from "../Log";
import { IComplexTypeEx, IElementEx, IFoundCursor, IStorageSchema, XmlBaseHandler, XmlStorage } from "../xmltypes";

export class XmlCompletionHandler extends XmlBaseHandler {

	constructor(schemastorage: XmlStorage, private document: TextDocument, connection: IConnection, private schemastorePath: string, loglevel: LogLevel) {
		super(schemastorage, connection, loglevel);
		this.schemastorage = schemastorage.schemas;
	}

	public async getCompletionSuggestions(handler: TextDocumentPositionParams): Promise<CompletionItem[]> {

		const txt = this.document.getText();
		const pos = this.document.offsetAt(handler.position);

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

		// If current position is in an element, but not in a parameter: <Tag text="Hello" |src="123"...
		if (foundCursor.isOnElementHeader && !foundCursor.isInAttribute) {
			this.logDebug("Found cursor location to be in element");

			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.getElementsInTagHeader(foundCursor));
			});

		} else if (!foundCursor.isOnElementHeader) {
			this.logDebug("Cursor location is in an element body.");

			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.getElementsInBody(foundCursor));
			});
		} else if (foundCursor.isInAttribute) {
			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.getCompletionItemsForAttribute(foundCursor));
			});
		}
	}

	getCompletionItemsForAttribute(cursor: IFoundCursor): CompletionItem[] {
		this.logDebug("Processing Tagstring: " + cursor.tagName);
		let namespace = this.usedNamespaces[cursor.tagNamespace];
		this.logDebug("Using Namespace: " + namespace);
		let schema = this.schemastorage[namespace];
		this.logDebug("Using Schema: " + schema.targetNamespace);
		const element = this.findElement(cursor.tagName, schema);
		this.logDebug(() => "Found element: " + element.$.name);
		const elementType = this.getTypeOf(element) as IComplexTypeEx;
		this.logDebug(() => "Found Element type: " + elementType.$.name);
		const types = this.getBaseTypes(elementType, []);
		if (types && types.length > 0)
			elementType.basetype = types[0];

		const matchingAttributeType = elementType.attribute.find((value, index, obj) => value.$.name === cursor.attribute.name);
		if (matchingAttributeType) {
			// Check if this simple type has an enumeration on it
			const attributetype = this.getTypeOf(matchingAttributeType) as SimpleType;
			if (attributetype.restriction && attributetype.restriction[0].enumeration) {

				return attributetype.restriction[0].enumeration.map<CompletionItem>((value, index, array) => {
					return {
						label: value.$.value,
						documentation: value.annotation ? (value.annotation[0].documentation ? this.markdownText(value.annotation[0].documentation[0]) : "") : "",
						kind: CompletionItemKind.Enum
					};
				});
			}
		}
		return undefined;
	}

	private getElementsInTagHeader(cursor: IFoundCursor): CompletionItem[] {
		this.logDebug("Processing Tagstring: " + cursor.tagName);
		let namespace = this.usedNamespaces[cursor.tagNamespace];
		this.logDebug("Using Namespace: " + namespace);
		let schema = this.schemastorage[namespace];
		this.logDebug("Using Schema: " + schema.targetNamespace);
		let element = this.findElement(cursor.tagName, schema);
		this.logDebug(() => "Found element: " + element.$.name);
		let elementType = this.getTypeOf(element) as IComplexTypeEx;
		this.logDebug(() => "Found Element type: " + elementType.$.name);
		let types = this.getBaseTypes(elementType, []);
		if (types && types.length > 0)
			elementType.basetype = types[0];

		let attributes = this.getAttributes(elementType);

		this.logDebug(() => "Found " + attributes.length + " Attributes");
		let ret: CompletionItem[] = [];
		for (const attribute of attributes) {
			if (!(cursor.attributes.findIndex(x => x.name === attribute.$.name) > 0))
				ret.push(this.getCompletionItemForSingleAttribute(attribute, schema));
		}
		return ret;
	}

	private getCompletionItemForSingleAttribute(attribute: Attribute, schema: IStorageSchema): CompletionItem {
		const ce: CompletionItem = {
			label: attribute.$.name,
			kind: CompletionItemKind.Property,
			insertText: " " + attribute.$.name + "=\"$0\" ",
			insertTextFormat: 2
		};
		try {
			ce.detail = attribute.owner ? "from " + attribute.owner.$.name : undefined;
		} catch (error) {

		}
		try {
			ce.documentation = this.markdownText(attribute.annotation[0].documentation[0]);
		} catch (error) {

		}
		return ce;
	}

	private getElementsInBody(cursor: IFoundCursor): CompletionItem[] {
		let foundElements: { namespace: string, elements: Element[], ciKind?: CompletionItemKind }[] = [];
		let baseElements: Element[] = [];

		// copy path to leave original intact
		let path = cursor.path;
		let part: string;
		let downpath: string[] = [];
		let element: IElementEx;

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
			element = this.getElementFromReference(element.$.ref, element.schema);
		}

		// Get the type (if there)
		let elements = this.getRightSubElements(element, downpath);

		let derivedelements: { namespace: string, elements: Element[] }[] = [];

		let ownelements: Element[] = [];

		for (let e of elements)
			// Get Type if type is given as attribute, which indicates it may be used by others.
			if (e.$ && e.$.type) {
				derivedelements = derivedelements.concat(this.getDerivedElements(e, element.schema));
				// Get Elements if type is a reference
			} else if (e.$ && e.$.ref) {
				e = this.getElementFromReference(e.$.ref, element.schema);
				if (e && e.$ && e.$.type)
					derivedelements = derivedelements.concat(this.getDerivedElements(e, element.schema));
			} else {
				ownelements.push(e);
			}

		// Append additional elements
		for (const ns in this.usedNamespaces) {
			if (this.usedNamespaces[ns] === element.schema.targetNamespace) {
				foundElements.push({ namespace: ns, elements: ownelements, ciKind: CompletionItemKind.Property });
				break;
			}
		}

		foundElements = foundElements.concat(derivedelements);
		let ret: CompletionItem[] = [];
		for (let item of foundElements) {
			for (const entry of item.elements)
				try {
					const citem = CompletionItem.create(entry.$.name);
					const nsprefix = item.namespace.length > 0 ? item.namespace + ":" : "";
					citem.insertText = "<" + nsprefix + entry.$.name + ">$0</" + nsprefix + entry.$.name + ">";
					citem.insertTextFormat = 2;
					citem.kind = item.ciKind || CompletionItemKind.Class;
					if (item.namespace.length > 0)
						citem.detail = "Namespace: " + item.namespace;
					try {
						citem.documentation = this.markdownText(entry.annotation[0].documentation[0]);
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