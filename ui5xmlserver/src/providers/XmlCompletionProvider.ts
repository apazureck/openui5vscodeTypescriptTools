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
				resolve(this.processInTag(foundCursor));
			});

		} else if (!foundCursor.isInElement) {
			this.logDebug("Cursor location is in an element body.");

			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.processAllowedElements(foundCursor));
			});
		}
	}

	private processAllowedElements(cursor: FoundCursor): CompletionItem[] {
		let foundElements: { namespace: string, elements: Element[] }[] = [];
		let baseElements: Element[] = [];

		// copy path to leave original intact
		let path = cursor.path;
		let part: string;
		let downpath: string[] = [];
		let element: ElementEx;

		// go down the path to get the first parent element in the owning schema
		while (part = path.pop()) {
			element = this.findElement(part, this.getSchema(part))
			if (element) {
				break;
			} else {
				downpath.push(part);
			}
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
				derivedelements = derivedelements.concat(this.getDerivedElements(e, this.getSchema(e.$.name)))
				// Get Elements if type is a reference
			} else if (e.$ && e.$.ref) {
				e = this.getElementFromReference(e.$.ref, this.getSchema(e.$.ref))
				if (e && e.$ && e.$.type)
					derivedelements = derivedelements.concat(this.getDerivedElements(e, this.getSchema(e.$.name)));
			} else {
				ownelements.push(e);
			}

		// Append additional elements
		for (let ns in this.usedNamespaces) {
			if (this.usedNamespaces[ns] === element.ownerschema.targetNamespace) {
				foundElements.push({ namespace: ns, elements: ownelements });
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
					citem.kind = CompletionItemKind.Class;
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

	private getRightSubElements(element: ElementEx, downpath: string[]): Element[] {
		let type = this.getTypeOfElement(element);

		// Distinguish between sequences and choices, etc. to display only elements that can be placed here.
		let elements = this.getAllElementsInComplexType(type);
		if (downpath.length > 0) {
			let part: string;
			if (part = downpath.pop()) {
				let child = elements.find(x => {
					try {
						return x.$.name === part;
					} catch (error) {
						false;
					}
				});
				if (child) {
					return this.getRightSubElements(child, downpath)
				}
			}
		}
		return elements;
	}

	/**
	 * Gets the (complex) type of a given element (with schema)
	 * 
	 * @private
	 * @param {ElementEx} element Element to get the type from
	 * @returns {ComplexTypeEx} The Complex type of the elment
	 * 
	 * @memberOf XmlCompletionHandler
	 */
	private getTypeOfElement(element: ElementEx): ComplexTypeEx {
		try {
			// Check if complex Type is directly on element
			if (element.complexType) {
				let t: ComplexTypeEx = element.complexType[0] as ComplexTypeEx;
				t.schema = element.ownerschema;
				return t;
				// Check if type is referenced by the element via type="<tname>"
			} else if (element.$ && element.$.type) {
				return this.findTypeByName(element.$.type, element.ownerschema);
			} else {
				// Check for simple type?
				return null;
			}
		} catch (error) {
			return undefined
		}
	}

	private getAllElementsInComplexType(type: ComplexTypeEx): Element[] {
		let alltypes = [type]
		alltypes = alltypes.concat(this.getBaseTypes(type));

		let elements: Element[] = [];
		for (let t of alltypes) {
			// Check if type is inheriting other type
			if (t.complexContent && t.complexContent[0].extension) {
				let st = t.complexContent[0].extension[0];
				elements = elements.concat(this.getElementsOfComplexType(st));
			} else {
				try {
					elements = elements.concat(this.getElementsOfComplexType(t))
				} catch (error) {
					this.logDebug(() => "Could not get elements of type " + t.$.name);
				}
			}
		}
		return elements;
	}

	private getElementsOfComplexType(type: ComplexType): Element[] {
		let elements: Element[] = [];
		if (type.element)
			elements = elements.concat(type.element);
		if (type.sequence) {
			if (type.sequence[0].element)
				elements = elements.concat(type.sequence[0].element);
			if (type.sequence[0].choice && type.sequence[0].choice[0].element)
				elements = elements.concat(type.sequence[0].choice[0].element);
		}
		return elements;
	}
	private getDerivedElements(element: Element, schema: StorageSchema): { namespace: string, elements: Element[] }[] {
		var type = this.findTypeByName(element.$.type, schema);
		schema = type.schema
		// Find all schemas using the owningSchema (and so maybe the element)
		let schemasUsingNamespace: { nsabbrevation: string, schema: StorageSchema }[] = [];
		for (let targetns in this.schemastorage) {
			if (targetns === schema.targetNamespace)
				continue;
			let curschema = this.schemastorage[targetns];
			for (let namespace in curschema.referencedNamespaces)
				// check if xsd file is referenced in current schema.
				if (curschema.referencedNamespaces[namespace] === type.schema.targetNamespace) {
					for (let nsa in this.usedNamespaces)
						// check if namespace is also used in current xml file
						if (this.usedNamespaces[nsa] === curschema.targetNamespace) {
							schemasUsingNamespace.push({ nsabbrevation: nsa, schema: curschema });
							break;
						}
				}
		}

		let foundElements: { namespace: string, elements: Element[] }[] = [];
		for (let schema of schemasUsingNamespace) {
			try {
				let newentry: { namespace: string, elements: Element[] } = { namespace: schema.nsabbrevation, elements: [] }
				for (let e of schema.schema.schema.element) {
					if (!e.$ || !e.$.type)
						continue;
					try {
						let basetypes = this.getBaseTypes(this.findTypeByName(e.$.type, schema.schema));
						let i = basetypes.findIndex(x => { try { return x.$.name === type.$.name; } catch (error) { return false; } });
						if (i > -1)
							newentry.elements.push(e);
					} catch (error) {
						console.warn("Inner Error when finding basetype: " + error.toString())
					}
				}
				foundElements.push(newentry);
			} catch (error) {
				console.warn("Outer Error when finding basetype: " + error.toString())
			}
		}

		return foundElements;
	}

	private getBaseTypes(type: ComplexTypeEx, path?: ComplexTypeEx[]): ComplexTypeEx[] {
		if (!path)
			path = [];

		try {
			let newtypename = type.complexContent[0].extension[0].$.base
			let newtype = this.findTypeByName(newtypename, type.schema);
			path.push(newtype);
			this.getBaseTypes(newtype, path);
		} catch (error) {
		}
		return path;
	}

	private getElementFromReference(elementref: string, schema: StorageSchema): ElementEx {
		// Split namespace and 
		let nsregex = elementref.match(/(\w*?):?(\w+?)$/);
		if (schema.referencedNamespaces[nsregex[1]] !== schema.targetNamespace)
			schema = this.schemastorage[schema.referencedNamespaces[nsregex[1]]];

		return this.findElement(nsregex[2], schema);
	}

	private getElements(type: ComplexTypeEx, path: string[], schema: StorageSchema): Element[] {
		// Get the sequence from the type
		let curElement: Element;
		// is derived type
		if (type.complexContent) {
			curElement = type.complexContent[0].extension[0];

			// Resolve path -> Crawl down the sequences (which contain the xml elements)
			let curPath;
			while (curPath = path.pop())
				curElement = (curElement.sequence[0].element as Element[]).find(x => x.$.name === curPath);
		}

		let elements = this.getElementsFromSequenceAndChoice(curElement, schema);

		// Get choice // TODO: Maybe this is not the only way
		return elements;
	}

	private getElementsFromSequenceAndChoice(element: Element, schema: StorageSchema): Element[] {
		let res: Element[] = [];
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

	private processInTag(cursor: FoundCursor): CompletionItem[] {
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
		if(types && types.length > 0)
			elementType.basetype = types[0];
			
		let attributes = this.getAttributes(elementType);

		this.logDebug(() => "Found " + attributes.length + " Attributes");
		let ret: CompletionItem[] = [];
		for (let attribute of attributes) {
			if (!(cursor.attributes.findIndex(x => x.name === attribute.$.name) > 0))
				ret.push(this.getCompletionItemFromAttribute(attribute, schema));
		}
		return ret;
	}

	private getCompletionItemFromAttribute(attribute: Attribute, schema: StorageSchema): CompletionItem {
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

	private findTypeByName(typename: string, schema: StorageSchema): ComplexTypeEx {
		let aType = typename.split(":");
		let tn, namespace: string;
		if (aType.length > 1) {
			namespace = aType[0];
			tn = aType[1];
		} else {
			tn = typename;
		}
		let complexTypes = schema.schema.complexType;
		if (namespace) {
			if (schema.referencedNamespaces[namespace] !== schema.targetNamespace) {
				let newschema = this.schemastorage[schema.referencedNamespaces[namespace]];
				if (!newschema) {
					throw new Error("No schema found for namespace abbrevation '" + namespace + "' in schema '" + schema.targetNamespace + "'.");
				}
				return this.findTypeByName(typename, newschema);
			}
		}
		let complextype: ComplexTypeEx;
		for (complextype of complexTypes as ComplexTypeEx[]) {
			if (!complextype.$)
				continue;
			if (!complextype.$.name)
				continue;

			if (complextype.$.name === tn) {
				// If complextype has complex content it is derived.
				if (complextype.complexContent) {
					let basetypename = complextype.complexContent[0].extension[0].$.base as string;
					let basetype = this.findTypeByName(basetypename, schema);
					complextype.basetype = basetype;
				}
				complextype.schema = schema;
				return complextype;
			}
		}
	}

	private findElement(name: string, schema: StorageSchema): ElementEx {
		// Iterate over all
		for (let element of schema.schema.element) {
			if (!element.$)
				continue;
			if (!element.$.name)
				continue;
			if (element.$.name !== name)
				continue;

			(<ElementEx>element).ownerschema = schema;
			return element;
		}
	}
}