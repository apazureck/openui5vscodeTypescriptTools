import * as fs from "fs";
import * as path from "path";
import { CompletionItem, IConnection } from "vscode-languageserver";
import * as xml from "xml2js";
import { Log, LogLevel } from "./Log";

export class XmlStorage extends Log {
	public schemas: {
		[x: string]: IStorageSchema;
	};
	constructor(public schemastorePath: string, connection: IConnection, loglevel: LogLevel) {
		super(connection, loglevel);
		this.schemas = {};
		this.connection.console.info("Creating Schema storage.");
		for (const file of fs.readdirSync(this.schemastorePath)) {
			try {
				const xmltext = fs.readFileSync(path.join(this.schemastorePath, file)).toString();
				xml.parseString(xmltext, { normalize: true }, (err, res) => {
					if (err)
						throw err;
					const tns = xmltext.match(/targetNamespace\s*?=\s*?["'](.*?)["']/);
					if (tns) {
						const nsregex = /xmlns:(.*?)\s*?=\s*?["'](.*?)["']/g;
						let ns: RegExpMatchArray;
						let schemanamespace: string;
						const namespaces = {};
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

						const start = schemanamespace + ":";
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
							throw new Error("No Schema namespace defined, make sure your schema is compared against 'http://www.w3.org/2001/XMLSchema'");
						return;
					} else {
						throw new Error("No Target Namespace found in schema '" + file + "'");
					}
				});
			} catch (error) {
				this.connection.console.warn("Could not open Schema '" + file + "': " + JSON.stringify(error));
			}
		}
	}
}

export declare interface IStorageSchema {
	schemanamespace?: string;
	schema: XmlSchema;
	referencedNamespaces: { [x: string]: string };
	targetNamespace: string;
}

export declare interface IComplexTypeEx extends ComplexType {
	// Additional properties for navigation
	basetype?: IComplexTypeEx;
	schema: IStorageSchema;
}

export declare interface IElementEx extends Element {
	schema?: IStorageSchema;
}

export function getNamespaces(xmlobject: any): INamespace[] {
	var retns: INamespace[] = [];
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

export interface INamespace {
	name: string;
	address: string;
}

export interface IXmlError extends Error {
	message: string;
	Line: number;
	Column: number;
}

export interface IXmlCheckerError {
	message: string;
	expected: {
		type: string;
		value?: string;
		description: string;
	}[];
	found: string;
	offset: number;
	line: number;
	column: number;
}

export interface IFoundAttribute {
	name: string;
	value?: string;
	startpos: number;
	endpos: number;
}

export interface IFoundCursor extends IFoundElementHeader {
	absoluteCursorPosition: number;
	relativeCursorPosition: number;
	isOnElementHeader: boolean;
	isInAttribute: boolean;
	isOnAttributeName: boolean;
	attribute?: IFoundAttribute;
}

export interface IFoundElementHeader {
	/**
	 * TODO: Make mandatory
	 * 
	 * @type {number}
	 * @memberOf FoundElementHeader
	 */
	startindex: number;
	/**
	 * End of element header
	 * 
	 * @type {number}
	 * @memberOf FoundElementHeader
	 */
	endindex: number;
	elementHeader: string;
	path: string[];
	tagName: string;
	tagNamespace: string;

	fullName: string;
	isClosingTag: boolean;
	isSelfClosingTag: boolean;
	attributes?: IFoundAttribute[];
	/**
	 * Parent of this element
	 * 
	 * @type {FoundElementHeader}
	 * @memberOf FoundElementHeader
	 */
	parent?: IFoundElementHeader;
	/**
	 * Children of this element. Empty array, if element is without any children: <Tag></Tag> and undefined if self closing <Tag/>
	 * 
	 * @type {FoundElementHeader[]}
	 * @memberOf FoundElementHeader
	 */
	children?: IFoundElementHeader[];
}

export class XmlBaseHandler extends Log {
	public schemastorage: { [targetNamespace: string]: IStorageSchema };
	public usedNamespaces: { [abbrevation: string]: string };
	protected readonly namespaceRegex = /^(\w*?):?(\w+)?$/;

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
	getSchema(fullElementName: string): IStorageSchema {
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
		const xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g;
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
	public textGetElements(txt: string): IFoundElementHeader
	public textGetElements(txt: string, cursorPosition: number): IFoundCursor
	public textGetElements(txt: string, cursorPostion?: number): IFoundElementHeader | IFoundCursor {

		// Canceloperation will not cancel if undefined, otherwise return found cursor position
		const cancel = cursorPostion ? (foundElement: IFoundElementHeader, parent: IFoundElementHeader, nextMatch: RegExpMatchArray, lastMatch: RegExpMatchArray): IFoundElementHeader => {
			// If it is before lastmatch (that means before the last element)
			if (cursorPostion > lastmatch.index) {
				return undefined;
			} else if (cursorPostion > nextMatch.index) {
				// If the cursor is in the current element
				return undefined;
			} else if (!foundElement) {
				return parent;
			} else if (cursorPostion > foundElement.startindex) {
				// If it is in the last match part (that means before the current the element)
				return foundElement;
			} else {
				return foundElement.parent;
			}
		} : undefined;

		// Check if a number is given and if yes prepare the complex cancel operation.

		// Regex to find the text between a closing and opening bracket "> ... found text <"
		const relbody = />((?!--|.*>)[\s\S]*?<)/g;
		const p: string[] = [];
		let comment = false;
		let bmatch: RegExpMatchArray;
		// execute once to get the first match
		let lastmatch: RegExpMatchArray = relbody.exec(txt);

		let inner = txt.substring(1, lastmatch.index);
		let tag = (inner + " ").match(/(\/?)(\w*?):?(\w+?)\s([\s\S]*?)(\/?)\s?$/);
		if (tag[5])
			this.logError("Self closing element at root level");
		// Get first element
		let parent: IFoundElementHeader = {
			elementHeader: tag[3] ? tag[3] + " " + tag[4] : tag[4],
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
			const part = txt.substring(lastmatch.index, bmatch.index);
			const start = lastmatch.index + lastmatch[0].length;
			const end = bmatch.index;
			inner = txt.substring(start, end);
			lastmatch = bmatch;
			this.logDebug("Found potential element '" + inner + "'");
			// 1: slash at start, if closing tag
			// 2: namespace
			// 3: name
			// 4: space or stringend, if empty opening tag
			// 5: arguments, if There
			// 6: / at the end if self closing element
			// Space at the end to get the last letter from tags only containing the tag name in the correct group
			tag = (inner + " ").match(/(\/?)(\w*?):?(\w+?)\s([\s\S]*?)(\/?)\s?$/);
			let felement: IFoundElementHeader;
			if (comment || !tag) {
				if (inner.startsWith("!--")) {
					comment = true;
					this.logDebug("Found comment");
				}
				if (inner.endsWith("--")) {
					comment = false;
					this.logDebug("Comment ended");
				}
			} else if (tag[1] === "/") {
				// Check if element is closing
				const docancel = cancel ? cancel(felement, parent, bmatch, lastmatch) : undefined;
				if (docancel) {
					return docancel;
				}
				p.pop();
				this.logDebug(() => "Found closing tag. New Stack: " + p.join(" > "));
				if (parent.parent !== undefined)
					parent = parent.parent;
				// TODO: Maybe Append content of parent element when closing or give end index
				continue;
			} else if (tag[5]) {
				this.logDebug("Found self closing element '" + tag[2] + "'");
				if (parent) {
					felement = {
						elementHeader: tag[3] ? tag[3] + " " + tag[4] : tag[4],
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
					elementHeader: tag[3] ? tag[3] + " " + tag[4] : tag[4],
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

				this.logDebug(() => "Found opening element '" + tag[3] + "'. New Stack: " + p.join(" > "));

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

	textGetElementAtCursorPos(txt: string, start: number): IFoundCursor {

		let foundcursor = this.textGetElements(txt, start);
		let cursorpos = start - foundcursor.startindex;
		if (cursorpos < 0) {
			foundcursor = foundcursor.parent as IFoundCursor;
			cursorpos = start - foundcursor.startindex;
		}

		foundcursor.absoluteCursorPosition = start;
		foundcursor.relativeCursorPosition = cursorpos - (foundcursor.tagNamespace.length > 0 ? foundcursor.tagNamespace.length + 1 : 0);
		foundcursor.isOnElementHeader = start > foundcursor.startindex && start <= foundcursor.endindex;
		foundcursor.isInAttribute = false;
		foundcursor.isOnAttributeName = false;


		if (foundcursor.isOnElementHeader) {
			for (const attribute of foundcursor.attributes) {
				if (foundcursor.relativeCursorPosition >= attribute.startpos && foundcursor.relativeCursorPosition < attribute.endpos - attribute.value.length) {
					foundcursor.attribute = attribute;
					foundcursor.isOnAttributeName = true;
					break;
				}
				if (foundcursor.relativeCursorPosition >= attribute.endpos - attribute.value.length && foundcursor.relativeCursorPosition < attribute.endpos) {
					foundcursor.attribute = attribute;
					foundcursor.isInAttribute = true;
					break;
				}
			}
		}

		return foundcursor;
	}

	textGetAttributes(foundElement: IFoundElementHeader): IFoundAttribute[] {
		const attributename = "";
		const attributes: IFoundAttribute[] = [];
		const isinattributename: boolean = false;
		let amatch: RegExpMatchArray;
		// 1: spaces before attribute
		// 2: attributename
		// 3: opening quote
		// 4: value
		const attributeregex = /(\s*?)(\w+?)=(["'])([\s\S]*?)\3/gm;

		while (amatch = attributeregex.exec(foundElement.elementHeader)) {
			attributes.push({
				endpos: amatch.index + amatch[0].length,
				name: amatch[2],
				startpos: amatch.index + amatch[1].length,
				value: amatch[4],
			});
		}

		return attributes;
	}

	getAttributes(type: IComplexTypeEx): Attribute[] {
		if (type.basetype) {
			for (const att of type.complexContent[0].extension[0].attribute as Attribute[]) {
				att.owner = type;
				att.schema = type.schema;
			}
			return this.getAttributes(type.basetype).concat(type.complexContent[0].extension[0].attribute);
		}
		else {
			let attributes = type.complexContent ? type.complexContent[0].attribute : type.attribute;
			if (!attributes)
				attributes = [];
			for (const attribute of attributes) {
				attribute.owner = type;
				attribute.schema = type.schema;
			}

			return attributes;
		}
	}

	protected findElement(name: string, schema: IStorageSchema): IElementEx {
		// Iterate over all
		for (const element of schema.schema.element) {
			if (!element.$)
				continue;
			if (!element.$.name)
				continue;
			if (element.$.name !== name)
				continue;

			(element as IElementEx).schema = schema;
			return element;
		}
	}


	/**
	 * Gets the name of an xml element (removes the namespace part)
	 * 
	 * @param {string} element element name to get name from
	 * @memberof XmlBaseHandler
	 */
	protected getElementName(element: string) {
		return element.split(":").pop();
	}

	protected getRightSubElements(element: IElementEx, downpath: string[]): Element[] {
		const type = this.getTypeOf(element) as IComplexTypeEx;

		// Distinguish between sequences and choices, etc. to display only elements that can be placed here.
		const elements = this.getAllElementsInComplexType(type);
		if (downpath.length > 0) {
			let part: string;
			if (part = this.getElementName(downpath.pop())) {
				const child = elements.find(x => {
					try {
						return x.$.name === part;
					} catch (error) {
						// Do nothing
					}
				});
				if (child) {
					return this.getRightSubElements(child, downpath);
				}
			}
		}
		return elements;
	}

	/**
	 * Gets the **(complex)** type of a given element (`with schema`)
	 * 
	 * @private
	 * @param {ElementEx} element Element to get the type from
	 * @returns {ComplexTypeEx} The Complex type of the elment
	 * 
	 * @memberOf XmlCompletionHandler
	 */
	protected getTypeOf(element: XmlBase): IComplexTypeEx | SimpleType {
		try {
			// Check if complex Type is directly on element
			if (element.complexType) {
				const t: IComplexTypeEx = element.complexType[0] as IComplexTypeEx;
				t.schema = element.schema;
				t.attribute = this.getAttributes(t);
				return t;
				// Check if type is referenced by the element via type="<tname>"
			} else if (element.$ && element.$.type) {
				return this.findTypeByName(element.$.type, element.schema);
			} else {
				// Check for simple type?
				return null;
			}
		} catch (error) {
			return undefined;
		}
	}

	protected getAllElementsInComplexType(type: IComplexTypeEx): Element[] {
		let alltypes = [type];
		alltypes = alltypes.concat(this.getBaseTypes(type));

		let elements: Element[] = [];
		for (const t of alltypes) {
			// Check if type is inheriting other type
			if (t.complexContent && t.complexContent[0].extension) {
				const st = t.complexContent[0].extension[0];
				elements = elements.concat(this.getElementsOfComplexType(st));
			} else {
				try {
					elements = elements.concat(this.getElementsOfComplexType(t));
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
	protected getDerivedElements(element: Element, schema: IStorageSchema): { namespace: string, elements: Element[] }[] {
		const type = this.findTypeByName(element.$.type, schema) as IComplexTypeEx;
		schema = type.schema;
		// Find all schemas using the owningSchema (and so maybe the element)
		const schemasUsingNamespace: { nsabbrevation: string, schema: IStorageSchema }[] = [];
		for (const targetns in this.schemastorage) {
			if (targetns === schema.targetNamespace)
				continue;
			const curschema = this.schemastorage[targetns];
			for (const namespace in curschema.referencedNamespaces)
				// check if xsd file is referenced in current schema.
				if (curschema.referencedNamespaces[namespace] === type.schema.targetNamespace) {
					for (const nsa in this.usedNamespaces)
						// check if namespace is also used in current xml file
						if (this.usedNamespaces[nsa] === curschema.targetNamespace) {
							schemasUsingNamespace.push({ nsabbrevation: nsa, schema: curschema });
							break;
						}
				}
		}

		const foundElements: { namespace: string, elements: Element[] }[] = [];
		for (const nsschema of schemasUsingNamespace) {
			try {
				const newentry: { namespace: string, elements: Element[] } = { namespace: nsschema.nsabbrevation, elements: [] };
				for (const e of nsschema.schema.schema.element) {
					if (!e.$ || !e.$.type)
						continue;
					try {
						const basetypes = this.getBaseTypes(this.findTypeByName(e.$.type, nsschema.schema) as IComplexTypeEx);
						const i = basetypes.findIndex(x => { try { return x.$.name === type.$.name; } catch (error) { return false; } });
						if (i > -1)
							newentry.elements.push(e);
					} catch (error) {
						console.warn("Inner Error when finding basetype: " + error.toString());
					}
				}
				foundElements.push(newentry);
			} catch (error) {
				console.warn("Outer Error when finding basetype: " + error.toString());
			}
		}

		return foundElements;
	}

	protected getBaseTypes(type: IComplexTypeEx, path?: IComplexTypeEx[]): IComplexTypeEx[] {
		if (!path)
			path = [];

		try {
			const newtypename = type.complexContent[0].extension[0].$.base;
			const newtype = this.findTypeByName(newtypename, type.schema) as IComplexTypeEx;
			path.push(newtype);
			this.getBaseTypes(newtype, path);
		} catch (error) {
		}
		return path;
	}

	protected getElementFromReference(elementref: string, schema: IStorageSchema): IElementEx {
		if (!schema)
			return undefined;
		// Split namespace and 
		const nsregex = elementref.match(this.namespaceRegex);
		if (schema.referencedNamespaces[nsregex[1]] !== schema.targetNamespace)
			schema = this.schemastorage[schema.referencedNamespaces[nsregex[1]]];

		return this.findElement(nsregex[2], schema);
	}

	protected getElements(type: IComplexTypeEx, path: string[], schema: IStorageSchema): Element[] {
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

		const elements = this.getElementsFromSequenceAndChoice(curElement, schema);

		// Get choice // TODO: Maybe this is not the only way
		return elements;
	}

	protected getElementsFromSequenceAndChoice(element: Element, schema: IStorageSchema): Element[] {
		let res: Element[] = [];
		// If element contains a complexType
		if (element.complexType)
			element = element.complexType[0];

		if (element.sequence) {
			const sequence = element.sequence[0];
			if (sequence.choice) {
				const choice = sequence.choice[0];
				if (choice.element)
					res = res.concat(choice.element);
			}
			if (sequence.element)
				res = res.concat(sequence.element);
		}
		return res;
	}

	protected markdownText(input: string): string {
		input = input.replace(/<code>([\s\S]*?)<\/code>/gm, "`$1`");
		input = input.replace(/<b>([\s\S]*?)<\/b>/gm, "**$1**");
		input = input.replace(/<i>([\s\S]*?)<\/i>/gm, "*$1*");
		return input;
	}

	private findTypeByName(typename: string, schema: IStorageSchema): IComplexTypeEx | SimpleType {
		const aType = typename.split(":");
		let tn: string;
		let namespace: string;
		if (aType.length > 1) {
			namespace = aType[0];
			tn = aType[1];
		} else {
			tn = typename;
		}
		const complexTypes = schema.schema.complexType;
		if (namespace) {
			if (schema.referencedNamespaces[namespace] !== schema.targetNamespace) {
				const newschema = this.schemastorage[schema.referencedNamespaces[namespace]];
				if (!newschema) {
					throw new Error("No schema found for namespace abbrevation '" + namespace + "' in schema '" + schema.targetNamespace + "'.");
				}
				return this.findTypeByName(typename, newschema);
			}
		}
		for (const complextype of complexTypes as IComplexTypeEx[]) {
			if (!complextype.$)
				continue;
			if (!complextype.$.name)
				continue;

			if (complextype.$.name === tn) {
				// If complextype has complex content it is derived.
				if (complextype.complexContent) {
					const basetypename = complextype.complexContent[0].extension[0].$.base as string;
					const basetype = this.findTypeByName(basetypename, schema) as IComplexTypeEx;
					complextype.basetype = basetype;
				}
				complextype.schema = schema;
				complextype.attribute = this.getAttributes(complextype);
				return complextype;
			}
		}

		for (const simpletype of schema.schema.simpleType) {
			if (!simpletype.$) {
				continue;
			}
			if (!simpletype.$.name) {
				continue;
			}

			if (simpletype.$.name === tn) {
				return simpletype;
			}
		}
		return undefined;
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
	for (const i in o) {
		const newkey = func.apply(this, [i, o[i], o]);
		let newobject = o[i];
		if (o[i] !== null && typeof (o[i]) == "object") {
			if (o[i] instanceof Array) {
				newobject = [];
				for (const entry of o[i])
					newobject.push(substitute({ [i]: entry }, func)[newkey]);
			} else
				newobject = substitute(o[i], func);
		}
		build[newkey] = newobject;
	}
	return build;
}

export function traverse(o: any, func: (key: string, value: any) => void) {
	for (const i in o) {
		if (func.apply(this, [i, o[i], o]))
			continue;
		if (o[i] !== null && typeof (o[i]) == "object") {
			if (o[i] instanceof Array)
				for (const entry of o[i])
					traverse({ [i]: entry }, func);
			//going on step down in the object tree!!
			traverse(o[i], func);
		}
	}
}