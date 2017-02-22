import { TextDocumentPositionParams, CompletionItem, TextDocuments, IConnection, CompletionItemKind } from 'vscode-languageserver'
import { Storage, StorageSchema, XmlStorage, ComplexTypeEx, ElementEx } from '../../typings/types'
import { Log, LogLevel } from '../Log';
import * as fs from 'fs'
import * as path from 'path'
import * as xml from 'xml2js'

interface FoundAttribute {
	name: string,
	value?: string
	startpos: number,
	endpos: number
}

export interface FoundCursor {
	absoluteCursorPosition: number
	relativeCursorPosition: number
	isInElement: boolean
	elementcontent: string
	path: string[]
	tagName: string
	tagNamespace: string

	fullName: string
	isClosingTag: boolean
	isSelfClosingTag: boolean
	isInAttribute: boolean
	/**
	 * Name of the attribute, if cursor is in attribute
	 * 
	 * @type {string}
	 * @memberOf FoundCursor
	 */
	attributeName?: FoundAttribute

	attributes?: FoundAttribute[]
}

export class XmlCompletionHandler extends Log {
	constructor(public schemastorage: XmlStorage, private documents: TextDocuments, connection: IConnection, private schemastorePath: string, loglevel: LogLevel) {
		super(connection, loglevel);
	}
	private usedNamespaces: { [abbrevation: string]: string };
	async getCompletionSuggestions(handler: TextDocumentPositionParams): Promise<CompletionItem[]> {
		if (!this.schemastorage)
			await this.createSchemas();

		let doc = this.documents.get(handler.textDocument.uri);
		let txt = doc.getText();
		let pos = doc.offsetAt(handler.position);

		this.getUsedNamespaces(txt);
		let foundCursor = this.getElementAtCursorPos(txt, pos);

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


	/**
	 * Gets the schema from an element, which can come in form of '<namespace:name ... ' or '<name ...   '
	 * 
	 * @param {string} fullElementName 
	 * @returns 
	 * 
	 * @memberOf XmlCompletionHandler
	 */
	getSchema(fullElementName: string) {
		return this.schemastorage[this.usedNamespaces[fullElementName.match(/(\w*?):?\w+/)[1]]]
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

		let type: ComplexTypeEx;
		// Find out if element got a type reference
		if (element.$ && element.$.type) {
			this.logDebug("Element " + element.$.name + " has a type reference.");
			type = this.getType(element.$.type, element.ownerschema);

			// Check if element has a complex type declaration inside
		} else if (element.complexType[0]) {
			this.logDebug("Element " + element.$.name + " has a complex type inside.");
			let ctype = element.complexType[0] as ComplexTypeEx;
			ctype.schema = element.ownerschema;
		} else {
			this.logDebug("Element must be of simple type. Code Completion not supported for simple types.");
			return [];
		}

		// Distinguish between sequences and choices, etc. to display only elements that can be placed here.
		let elements = this.getAllElementsInComplexType(type);
		let derivedelements: { namespace: string, elements: Element[] } [] = [];

		let ownelements: Element[] = [];

		for(let e of elements)
		// Get Type if type is given as attribute, which indicates it may be used by others.
			if(e.$ && e.$.type) {
				derivedelements = derivedelements.concat(this.getDerivedElements(e, this.getSchema(e.$.name)))
				// Get Elements if type is a reference
			} else if(e.$ && e.$.ref) {
				e = this.getElementFromReference(e.$.ref, this.getSchema(e.$.ref))
				if(e && e.$ && e.$.type)
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

	private getAllElementsInComplexType(type: ComplexTypeEx): Element[] {
		let alltypes = [type]
		alltypes = alltypes.concat(this.getBaseTypes(type));

		let elements: Element[] = [];
		for(let t of alltypes) {
			if(t.complexContent && t.complexContent[0].extension) {
				if(t.complexContent[0].extension[0].element)
					elements = elements.concat(t.complexContent[0].extension[0].element);
				if(t.complexContent[0].extension[0].sequence && t.complexContent[0].extension[0].sequence[0].element) {
					elements = elements.concat(t.complexContent[0].extension[0].sequence[0].element);
					if(t.complexContent[0].extension[0].sequence[0].choice && t.complexContent[0].extension[0].sequence[0].choice[0].element)
						elements = elements.concat(t.complexContent[0].extension[0].sequence[0].choice[0].element);
				}
			}
		}
		return elements;
	}

	private getDerivedElements(element: Element, schema: StorageSchema): { namespace: string, elements: Element[] }[] {
		var type = this.getType(element.$.type, schema);
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
						let basetypes = this.getBaseTypes(this.getType(e.$.type, schema.schema));
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
			let newtype = this.getType(newtypename, type.schema);
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

	private getElementAtCursorPos(txt: string, start: number): FoundCursor {
		let regx = /(>(?!--|.*>)[\s\S]*?<)/g;
		let p: string[] = [];
		let comment = false;
		let m: RegExpMatchArray;
		let lm: RegExpMatchArray = regx.exec(txt);
		while (m = regx.exec(txt)) {
			if (m.index > start) {
				break;
			}
			let part = txt.substring(lm.index, m.index);
			let inner = txt.substring(lm.index + lm[0].length, m.index)
			lm = m;
			this.logDebug("Found potential element '" + inner + "'")
			// 1: slash at start, if closing tag
			// 2: namespace
			// 3: name
			// 4: space or stringend, if empty opening tag
			// 5: arguments, if There
			// 6: / at the end if self closing element
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
			// todo: Handle potential open and closing tags when in attribute values
			// Case closing tag
			else if (tag[1] === "/") {
				p.pop();
				this.logDebug(() => "Found closing tag. New Stack: " + p.join(" > "))
			} else if (tag[6]) {
				this.logDebug("Found self closing element '" + tag[2] + "'")
			} else {
				let fulltag = (tag[2].match(/\w+/) ? tag[2] + ":" : "") + tag[3];
				if (tag[4].match(/\w/))
					p.push(fulltag + tag[4]);
				else
					p.push(fulltag);
				this.logDebug(() => "Found opening tag '" + tag[2] + "'. New Stack: " + p.join(" > "))
			}
		}

		// If cursor is in element is inbetween elements the index of start is smaller than the found index of lm and the length of the part: tag'> .... stuff .... <'
		// Otherwise the cursor is in the following element
		let ec = txt.substring(lm.index + lm[0].length, m.index);
		let tag = (ec + " ").match(/^\s*?(\/?)\s*?(\w*?):?(\w+?)(\s|\/)/);
		let foundcursor: FoundCursor = {
			absoluteCursorPosition: start,
			relativeCursorPosition: start - lm.index - lm[0].length,
			isInElement: start >= lm.index + lm[0].length,
			elementcontent: ec,
			isClosingTag: tag[1] !== '',
			isSelfClosingTag: ec.endsWith("/"),
			tagName: tag[3],
			tagNamespace: tag[2],
			fullName: tag[2] ? tag[2] + ":" + tag[3] : tag[2],
			path: p,
			isInAttribute: false
		}

		if (foundcursor.isInElement) {
			let quote: string = undefined
			let attributename = "";
			let attributes: FoundAttribute[] = [];
			let isinattributename: boolean = false;
			let amatch: RegExpMatchArray

			// 1: attributename
			// 2: opening quote
			let attributeregex = /\s*?(\w+?)\s*?=\s*?(["'])?/g;
			attributeregex.lastIndex = foundcursor.fullName.length;

			while (amatch = attributeregex.exec(ec)) {
				for (let i = amatch.index + amatch[0].length; i < ec.length; i++) {
					if (foundcursor.relativeCursorPosition === i)
						foundcursor.isInAttribute = true;
					if (ec[i] === amatch[2]) {
						attributes.push({
							startpos: amatch.index,
							endpos: i,
							name: amatch[1],
							value: ec.substring(amatch.index + amatch[0].length, i)
						});
						attributeregex.lastIndex = i + 1;
						break;
					}
				}
			}
			foundcursor.attributes = attributes;
		}

		return foundcursor;
	}

	private processInTag(cursor: FoundCursor): CompletionItem[] {
		this.logDebug("Processing Tagstring: " + cursor.tagName);
		let namespace = this.usedNamespaces[cursor.tagNamespace];
		this.logDebug("Using Namespace: " + namespace)
		let schema = this.schemastorage[namespace];
		this.logDebug("Using Schema: " + schema.targetNamespace);
		let element = this.findElement(cursor.tagName, schema);
		this.logDebug(() => "Found element: " + element.$.name);
		let elementType = this.getType(element.$.type, schema);
		this.logDebug(() => "Found Element type: " + elementType.$.name);
		let attributes = this.getAttributes(elementType, schema);
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

	private getAttributes(type: ComplexTypeEx, schema: StorageSchema): Attribute[] {
		if (type.basetype) {
			for (let att of type.complexContent[0].extension[0].attribute as Attribute[])
				att.__owner = type;
			return this.getAttributes(type.basetype, type.schema).concat(type.complexContent[0].extension[0].attribute);
		}
		else {
			for (let att of type.attribute)
				att.__owner = type;
			return type.attribute;
		}
	}

	private getType(typename: string, schema: StorageSchema): ComplexTypeEx {
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
				return this.getType(typename, newschema);
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
					let basetype = this.getType(basetypename, schema);
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
			if (!element.$.type)
				continue;

			(<ElementEx>element).ownerschema = schema;
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
	private getUsedNamespaces(input: string): void {
		let xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g
		let match: RegExpMatchArray;
		this.usedNamespaces = {};
		while (match = xmlnsregex.exec(input))
			this.usedNamespaces[match[1]] = match[2];
	}

	async createSchemas(): Promise<void> {
		this.schemastorage = {};
		this.connection.console.info("Creating Schema storage.")
		for (let file of fs.readdirSync(this.schemastorePath)) {
			try {
				let xmltext = fs.readFileSync(path.join(this.schemastorePath, file)).toString();
				await new Promise<void>((resolve, reject) => {
					xml.parseString(xmltext, { normalize: true }, (err, res) => {
						if (err)
							return reject(err);
						let tns = xmltext.match(/targetNamespace\s*?=\s*?["'](.*?)["']/);
						if (tns) {
							let nsregex = /xmlns:(.*?)\s*?=\s*?["'](.*?)["']/g;
							let ns: RegExpMatchArray;
							let schemanamespace: string;
							let namespaces = {}
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

							var start = schemanamespace + ":"
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
								return reject("No Schema namespace defined, make sure your schema is compared against 'http://www.w3.org/2001/XMLSchema'")
							return resolve();
						}
						else
							return reject({ message: "No Target Namespace found in schema '" + file + "'" });
					});
				});
			} catch (error) {
				return this.connection.console.warn("Could not open Schema '" + file + "': " + JSON.stringify(error));
			}
		}
	}
}

/**
 * Replaces the key. Return old key if key should not be renamed.
 * 
 * @param {*} o 
 * @param {(key: string, value: any, parent: {}) => string} func 
 */
function substitute(o: any, func: (key: string, value: any) => string): {} {
	let build = {};
	for (let i in o) {
		let newkey = func.apply(this, [i, o[i], o]);
		let newobject = o[i];
		if (o[i] !== null && typeof (o[i]) == "object") {
			if (o[i] instanceof Array) {
				newobject = [];
				for (let entry of o[i])
					newobject.push(substitute({ [i]: entry }, func)[newkey]);
			} else
				newobject = substitute(o[i], func);
		}
		build[newkey] = newobject;
	}
	return build;
}

function traverse(o: any, func: (key: string, value: any) => boolean) {
	for (let i in o) {
		if(func.apply(this, [i, o[i], o]))
			continue;
		if (o[i] !== null && typeof (o[i]) == "object") {
			if (o[i] instanceof Array)
				for (let entry of o[i])
					traverse({ [i]: entry }, func);
			//going on step down in the object tree!!
			traverse(o[i], func);
		}
	}
}