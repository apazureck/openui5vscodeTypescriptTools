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
	elementcontent: string
	path: string[]
	tagName: string
	tagNamespace: string

	fullName: string
	isClosingTag: boolean
	isSelfClosingTag: boolean
	/**
	 * Name of the attribute, if cursor is in attribute
	 * 
	 * @type {string}
	 * @memberOf FoundCursor
	 */

	attributes?: FoundAttribute[]
}

export class XmlBase extends Log {
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
		return this.schemastorage[this.usedNamespaces[fullElementName.match(/(\w*?):?\w+/)[1]]]
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

	textGetElements(txt: string, parent?: FoundElementHeader) {
		// Regex to find the text between a closing and opening bracket "> ... found text <"
		let between = /(>(?!--|.*>)[\s\S]*?<)/g;
		let p: string[] = [];
		let comment = false;
		let bmatch: RegExpMatchArray;
		// execute once to get the first match
		let lm: RegExpMatchArray = between.exec(txt);

		// Get first element
		

		// Get rest of the elements
		while (bmatch = between.exec(txt)) {
			let part = txt.substring(lm.index, bmatch.index);
			let inner = txt.substring(lm.index + lm[0].length, bmatch.index)
			lm = bmatch;
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
	}

	textGetElementAtCursorPos(txt: string, start: number): FoundCursor {
		// Regex will find all stuff between two xml elements. so it will find sth. like this: <element1> ... "This is found" ... <element2>
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
			foundcursor.attributes = this.textGetAttributes(foundcursor);
			foundcursor.isInAttribute = this.textIsInAttribute(foundcursor);
		}

		return foundcursor;
	}

	textGetElement() {

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

	getAttributes(type: ComplexTypeEx, schema: StorageSchema): Attribute[] {
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