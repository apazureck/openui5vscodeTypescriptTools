import { Log, LogLevel } from './Log';
import { CompletionItem, IConnection } from 'vscode-languageserver'
import * as fs from 'fs'
import * as path from 'path'
import * as xml from 'xml2js'

export class XmlStorage extends Log {
	constructor(public schemastorePath: string, connection: IConnection, loglevel: LogLevel) {
		super(connection, loglevel)
		this.schemas = {};
		this.connection.console.info("Creating Schema storage.")
		for (let file of fs.readdirSync(this.schemastorePath)) {
			try {
				let xmltext = fs.readFileSync(path.join(this.schemastorePath, file)).toString();
				xml.parseString(xmltext, { normalize: true }, (err, res) => {
					if (err)
						throw err;
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
							this.schemas[tns[1]] = { schemanamespace: schemanamespace, schema: res.schema, referencedNamespaces: namespaces, targetNamespace: tns[1] };
						else
							throw new Error("No Schema namespace defined, make sure your schema is compared against 'http://www.w3.org/2001/XMLSchema'")
						return;;
					}
					else
						throw new Error("No Target Namespace found in schema '" + file + "'");
				});
			} catch (error) {
				this.connection.console.warn("Could not open Schema '" + file + "': " + JSON.stringify(error));
			}
		}
	}
	schemas: {
		[x: string]: StorageSchema
	}
}

export declare interface StorageSchema {
	schemanamespace?: string,
	schema: XmlSchema,
	referencedNamespaces: { [x: string]: string },
	targetNamespace: string
}

export declare interface ComplexTypeEx extends ComplexType {
	// Additional properties for navigation
	basetype?: ComplexTypeEx;
	schema: StorageSchema;
}

export declare interface ElementEx extends Element {
	ownerschema?: StorageSchema
}

export function getNamespaces(xmlobject: any): Namespace[] {
	var retns: Namespace[] = [];
	traverse(xmlobject, (key, value) => {
		try {
			if (key.startsWith("xmlns:"))
				retns.push({
					name: key.split(":")[1],
					address: value
				});
		} catch (error) {

		}
	});
	return retns;
}

export interface Namespace {
	name: string
	address: string
}

export interface XmlError extends Error {
	message: string;
	Line: number;
	Column: number;
}

export interface XmlCheckerError {
	message: string
	expected: {
		type: string;
		value?: string;
		description: string;
	}[]
	found: string;
	offset: number;
	line: number;
	column: number;
}

export interface FoundAttribute {
	name: string,
	value?: string
	startpos: number,
	endpos: number
}

export interface FoundCursor extends FoundElementHeader {
	absoluteCursorPosition: number
	relativeCursorPosition: number
	isInElement: boolean
	isInAttribute: boolean
	attributeName?: FoundAttribute
}

export interface FoundElementHeader {
	/**
	 * TODO: Make mandatory
	 * 
	 * @type {number}
	 * @memberOf FoundElementHeader
	 */
	startindex: number
	/**
	 * End of element header
	 * 
	 * @type {number}
	 * @memberOf FoundElementHeader
	 */
	endindex: number
	elementcontent: string
	path: string[]
	tagName: string
	tagNamespace: string

	fullName: string
	isClosingTag: boolean
	isSelfClosingTag: boolean
	attributes?: FoundAttribute[]
	/**
	 * Parent of this element
	 * 
	 * @type {FoundElementHeader}
	 * @memberOf FoundElementHeader
	 */
	parent?: FoundElementHeader
	/**
	 * Children of this element. Empty array, if element is without any children: <Tag></Tag> and undefined if self closing <Tag/>
	 * 
	 * @type {FoundElementHeader[]}
	 * @memberOf FoundElementHeader
	 */
	children?: FoundElementHeader[];
}

export class XmlBaseHandler extends Log {
	protected readonly namespaceRegex = /^(\w*?):?(\w+)?$/;
	public schemastorage: { [targetNamespace: string]: StorageSchema }
	public usedNamespaces: { [abbrevation: string]: string }
	constructor(schemastorage: XmlStorage, connection: IConnection, loglevel: LogLevel) {
		super(connection, loglevel);
		this.schemastorage = schemastorage.schemas;
	}

	/**
	 * Gets the schema from an element, which can come in form of '<namespace:name ... ' or '<name ...   '
	 * 
	 * @param {string} fullElementName 
	 * @returns 
	 * 
	 * @memberOf XmlBase
	 */
	getSchema(fullElementName: string): StorageSchema {
		const schema = this.schemastorage[this.usedNamespaces[fullElementName.match(this.namespaceRegex)[1]]];
		if (!schema) {
			this.logDebug("Schema for element '" + fullElementName + "' not found.");
		}
		return schema;
	}

	/**
	 * gets the used namespaces in the input string. The used namespaces are stored in the usedNamespaces property.
	 * 
	 * @param {string} input Input xml string to get the namespaces from
	 * 
	 * @memberOf XmlBase
	 */
	getUsedNamespaces(input: string): void {
		let xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g
		let match: RegExpMatchArray;
		this.usedNamespaces = {};
		while (match = xmlnsregex.exec(input))
			this.usedNamespaces[match[1]] = match[2];
	}

	/**
	 * Searches all Elements and puts them in a structure.
	 * 
	 * @param {string} txt 
	 * @param {(curIndex: number) => boolean} [cancel] 
	 * @returns {FoundElementHeader} 
	 * 
	 * @memberOf XmlBaseHandler
	 */
	textGetElements(txt: string): FoundElementHeader
	textGetElements(txt: string, cursorPosition: number): FoundCursor
	textGetElements(txt: string, cursorPostion?: number): FoundElementHeader | FoundCursor {

		// Canceloperation will not cancel if undefined, otherwise return found cursor position
		const cancel = cursorPostion ? (foundElement: FoundElementHeader, parent: FoundElementHeader, nextMatch: RegExpMatchArray, lastMatch: RegExpMatchArray): FoundElementHeader => {
			// If it is before lastmatch (that means before the last element)
			if (cursorPostion > lastmatch.index) {
				return undefined;
			} else if (cursorPostion > nextMatch.index) {
				// If the cursor is in the current element
				return undefined;
			} else if(!foundElement) {
				return parent;
			} else if (cursorPostion > foundElement.startindex) {
				// If it is in the last match part (that means before the current the element)
				return foundElement;
			} else {
				return foundElement.parent;
			}
		} : undefined;
		let stopIndex: number;
		// Check if a number is given and if yes prepare the complex cancel operation.

		// Regex to find the text between a closing and opening bracket "> ... found text <"
		let relbody = />((?!--|.*>)[\s\S]*?<)/g;
		let p: string[] = [];
		let comment = false;
		let bmatch: RegExpMatchArray;
		// execute once to get the first match
		let lastmatch: RegExpMatchArray = relbody.exec(txt);

		let inner = txt.substring(1, lastmatch.index);
		let tag = (inner + " ").match(/(\/?)(\w*?):?(\w+?)\s([\s\S]*?)(\/?)\s?$/);
		if (tag[5])
			this.logError("Self closing element at root level");
		// Get first element
		let parent: FoundElementHeader = {
			elementcontent: tag[3] ? tag[3] + " " + tag[4] : tag[4],
			isClosingTag: false,
			isSelfClosingTag: true,
			tagName: tag[3],
			tagNamespace: tag[2],
			fullName: (tag[2].match(/\w+/) ? tag[2] + ":" : "") + tag[3],
			path: p.slice(),
			startindex: 0,
			endindex: lastmatch.index,
			children: []
		};
		parent.attributes = this.textGetAttributes(parent);
		// Check if cancel criteria is fulfilled in first element
		const docancel = cancel ? cancel(undefined, parent, bmatch, lastmatch) : undefined;
		if (docancel) {
			return docancel;
		}

		// Get rest of the elements
		while (bmatch = relbody.exec(txt)) {
			let part = txt.substring(lastmatch.index, bmatch.index);
			let start = lastmatch.index + lastmatch[0].length;
			let end = bmatch.index
			let inner = txt.substring(start, end)
			lastmatch = bmatch;
			this.logDebug("Found potential element '" + inner + "'")
			// 1: slash at start, if closing tag
			// 2: namespace
			// 3: name
			// 4: space or stringend, if empty opening tag
			// 5: arguments, if There
			// 6: / at the end if self closing element
			// Space at the end to get the last letter from tags only containing the tag name in the correct group
			let tag = (inner + " ").match(/(\/?)(\w*?):?(\w+?)\s([\s\S]*?)(\/?)\s?$/);
			let felement: FoundElementHeader = undefined;
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
			// Check if element is closing
			else if (tag[1] === "/") {
				const docancel = cancel ? cancel(felement, parent, bmatch, lastmatch) : undefined;
				if (docancel) {
					return docancel;
				}
				p.pop();
				this.logDebug(() => "Found closing tag. New Stack: " + p.join(" > "))
				if (parent.parent !== undefined)
					parent = parent.parent;
				// TODO: Maybe Append content of parent element when closing or give end index
				continue;
			} else if (tag[5]) {
				this.logDebug("Found self closing element '" + tag[2] + "'")
				if (parent) {
					felement = {
						elementcontent: tag[3] ? tag[3] + " " + tag[4] : tag[4],
						isClosingTag: false,
						isSelfClosingTag: true,
						tagName: tag[3],
						tagNamespace: tag[2],
						fullName: (tag[2].match(/\w+/) ? tag[2] + ":" : "") + tag[3],
						path: p.slice(),
						startindex: start,
						endindex: end,
						parent: parent
					};
					felement.attributes = this.textGetAttributes(felement);
					parent.children.push(felement);
				} else {
					this.logError("Self closing element at root level");
				}
			} else {
				felement = {
					elementcontent: tag[3] ? tag[3] + " " + tag[4] : tag[4],
					isClosingTag: false,
					isSelfClosingTag: false,
					tagName: tag[3],
					tagNamespace: tag[2],
					fullName: (tag[2].match(/\w+/) ? tag[2] + ":" : "") + tag[3],
					children: [],
					parent: parent,
					startindex: start,
					endindex: end,
					path: p.slice(),
				};
				felement.attributes = this.textGetAttributes(felement);
				p.push(felement.fullName);

				this.logDebug(() => "Found opening element '" + tag[3] + "'. New Stack: " + p.join(" > "))

				if (parent)
					parent.children.push(felement);
				parent = felement;
			}

			const docancel = cancel ? cancel(felement, parent, bmatch, lastmatch) : undefined;
			if (docancel) {
				return docancel;
			}
		}

		return parent;
	}

	textGetElementAtCursorPos(txt: string, start: number): FoundCursor {

		let foundcursor = this.textGetElements(txt, start);
		let cursorpos = start - foundcursor.startindex;
		if (cursorpos < 0) {
			foundcursor = foundcursor.parent as FoundCursor;
			cursorpos = start - foundcursor.startindex;
		}

		foundcursor.absoluteCursorPosition = start;
		foundcursor.relativeCursorPosition = cursorpos;
		foundcursor.isInElement = start > foundcursor.startindex && start <= foundcursor.endindex;
		foundcursor.isInAttribute = false;


		if (foundcursor.isInElement) {
			foundcursor.isInAttribute = this.textIsInAttribute(foundcursor);
		}

		return foundcursor;
	}

	textIsInAttribute(foundcursor: FoundCursor): boolean {
		let quote: string = undefined;
		for (let i = 0; i <= foundcursor.relativeCursorPosition; i++) {
			switch (foundcursor.elementcontent[i]) {
				case quote:
					quote = undefined;
					continue;
				case "'": case '"':
					if (!quote)
						quote = foundcursor.elementcontent[i]
					continue;
				default:
					continue;
			}
		}
		return quote !== undefined;
	}

	textGetAttributes(foundElement: FoundElementHeader): FoundAttribute[] {
		let quote: string = undefined
		let attributename = "";
		let attributes: FoundAttribute[] = [];
		let isinattributename: boolean = false;
		let amatch: RegExpMatchArray

		// 1: attributename
		// 2: opening quote
		let attributeregex = /\s*?(\w+?)\s*?=\s*?(["'])?/g;
		attributeregex.lastIndex = foundElement.fullName.length;

		while (amatch = attributeregex.exec(foundElement.elementcontent)) {
			for (let i = amatch.index + amatch[0].length; i < foundElement.elementcontent.length; i++) {
				if (foundElement.elementcontent[i] === amatch[2]) {
					attributes.push({
						startpos: amatch.index,
						endpos: i,
						name: amatch[1],
						value: foundElement.elementcontent.substring(amatch.index + amatch[0].length, i)
					});
					attributeregex.lastIndex = i + 1;
					break;
				}
			}
		}

		return attributes;
	}

	getAttributes(type: ComplexTypeEx): Attribute[] {
		if (type.basetype) {
			for (let att of type.complexContent[0].extension[0].attribute as Attribute[])
				att.__owner = type;
			return this.getAttributes(type.basetype).concat(type.complexContent[0].extension[0].attribute);
		}
		else {
			let attributes = type.complexContent ? type.complexContent[0].attribute : type.attribute;
			if (!attributes)
				attributes = [];
			for (let attribute of attributes)
				attribute.__owner = type;
			return attributes;
		}
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

	protected findElement(name: string, schema: StorageSchema): ElementEx {
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



	protected getRightSubElements(element: ElementEx, downpath: string[]): Element[] {
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
	protected getTypeOfElement(element: ElementEx): ComplexTypeEx {
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

	protected getAllElementsInComplexType(type: ComplexTypeEx): Element[] {
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

	protected getElementsOfComplexType(type: ComplexType): Element[] {
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
	protected getDerivedElements(element: Element, schema: StorageSchema): { namespace: string, elements: Element[] }[] {
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

	protected getBaseTypes(type: ComplexTypeEx, path?: ComplexTypeEx[]): ComplexTypeEx[] {
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

	protected getElementFromReference(elementref: string, schema: StorageSchema): ElementEx {
		if (!schema)
			return undefined;
		// Split namespace and 
		let nsregex = elementref.match(this.namespaceRegex);
		if (schema.referencedNamespaces[nsregex[1]] !== schema.targetNamespace)
			schema = this.schemastorage[schema.referencedNamespaces[nsregex[1]]];

		return this.findElement(nsregex[2], schema);
	}

	protected getElements(type: ComplexTypeEx, path: string[], schema: StorageSchema): Element[] {
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

	protected getElementsFromSequenceAndChoice(element: Element, schema: StorageSchema): Element[] {
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
}

/**
 * Replaces the key. Return old key if key should not be renamed.
 * 
 * @param {*} o 
 * @param {(key: string, value: any, parent: {}) => string} func 
 */
export function substitute(o: any, func: (key: string, value: any) => string): {} {
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

export function traverse(o: any, func: (key: string, value: any) => void) {
	for (let i in o) {
		if (func.apply(this, [i, o[i], o]))
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