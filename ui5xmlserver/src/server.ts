import * as path from 'path';
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, Location, Range
} from 'vscode-languageserver';
import { } from 'cancellation'
import * as vscodels from 'vscode-languageserver';
import { File } from './filehandler';
import * as p from 'path';
import * as xml from 'xml2js';
import * as fs from 'fs';

const controllerFileEx = "\\.controller\\.(js|ts)$";

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
export var workspaceRoot: string;
export var schemastorePath: string;
export var loadedschemas: {
	[x: string]: {}
}

connection.onInitialize((params): InitializeResult => {
	connection.console.info("Initializing UI5 XML language server");
	connection.console.log("params: " + JSON.stringify(params));
	workspaceRoot = params.rootPath;
	schemastorePath = params.initializationOptions.schemastore;
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			definitionProvider: true,
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: [">"]
			}
		}
	}
});

connection.onDefinition((params) => {
	let files: string[];
	let doc = documents.get(params.textDocument.uri);
	let startindex = doc.offsetAt(params.position);
	let text = doc.getText();
	let line = getLineByIndex(text, startindex);
	let tag = line.match(/(\w+)Name="(.*?)"/);

	if (!tag)
		return tryOpenEventHandler(line, params.position.character, text);

	let tName = tag[2].split(".").pop();
	let ret: Location[] = [];
	switch (tag[1]) {
		case "controller":
			files = File.find(new RegExp(tName + controllerFileEx));
			// Check typescript (dirty)
			for (let i = 0; i < files.length; i = i + 2) {
				let f = files.length > 1 ? files[i + 1] : files[i];
				ret.push({ range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + f });
			}
			return ret;
		case "view":
			files = File.find(new RegExp(tName + "\\.view\\.(xml|json)$"));
			for (let f in files)
				ret.push({ range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + files[0] });
		case "fragment":
			files = File.find(new RegExp(tName + "\\.fragment\\.(xml|json)$"));
			return { range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + files[0] };
		default:
			// let eventhandlertag = vscode.window.activeTextEditor.selection.active;
			return [];
	}
});

connection.onCompletion(async (handler) => {
	connection.console.info("Completion providing request received");
	let cl: CompletionItem[] = [];
	let doc = documents.get(handler.textDocument.uri);
	let line = getLine(doc.getText(), handler.position.line);

	try {
		cl = cl.concat(new I18NCompletionHandler().geti18nlabels(line, handler.position.character));
	} catch (error) {
		connection.console.error("Error when getting i18n completion entries: " + JSON.stringify(error));
	}
	try {
		cl = cl.concat(await new XmlCompletionHandler().getCompletionSuggestions(handler));
	} catch (error) {
		connection.console.error("Error when getting XML completion entries: " + JSON.stringify(error));
	}

	return cl;
});

class I18NCompletionHandler {
	geti18nlabels(line: string, cursorpos: number): CompletionItem[] {
		let pos = line.match(new RegExp(settings.ui5ts.lang.i18n.modelname + ">(.*?)}?\"")) as RegExpMatchArray;
		if (!pos)
			return [];

		let startpos = pos.index + settings.ui5ts.lang.i18n.modelname.length + 1;
		let endpos = startpos + pos[1].length
		if (cursorpos < startpos || cursorpos > endpos)
			return [];

		if (!storage.i18nItems)
			storage.i18nItems = this.getLabelsFormi18nFile();

		return storage.i18nItems;
	}

	getLabelsFormi18nFile(): CompletionItem[] {
		if (!settings.ui5ts.lang.i18n.modelfilelocation)
			settings.ui5ts.lang.i18n.modelfilelocation = "./i18n/i18n.properties";
		let content = File.open(settings.ui5ts.lang.i18n.modelfilelocation).split("\n");
		let items: CompletionItem[] = []
		for (let line of content) {
			try {
				// Comment
				if (line.startsWith("#"))
					continue;
				// New label
				let match = line.match("^(.*?)=(.*)");
				if (match)
					items.push({
						label: match[1],
						detail: "i18n",
						documentation: "'" + match[2] + "'",
						kind: CompletionItemKind.Text,

					});
			} catch (error) {

			}
		}
		return items;
	}
}

class XmlCompletionHandler {
	private usedNamespaces: { [abbrevation: string]: string };
	async getCompletionSuggestions(handler: TextDocumentPositionParams): Promise<CompletionItem[]> {
		if (!schemastorage)
			await this.createSchemas();

		let doc = documents.get(handler.textDocument.uri);
		let txt = doc.getText();
		let pos = doc.offsetAt(handler.position);
		let start, end: number;
		let isInElement: boolean = true;
		let isInParamValue: boolean = false;

		// Catch border Problem i always equals the element right of the cursor.
		if (txt[pos] === ">")
			pos--;
		else if (txt[pos] === "<")
			pos++;

		let quote: string;
		let quotesfoundct = 0;

		for (start = pos; start >= 0; start--) {
			switch (txt[start]) {
				case '<':
					if (!quote)
						break;
				case "=":
					// if = occurs maybe search is a parameter value
					if (quotesfoundct == 1)
						for (let checkpos = pos; checkpos < txt.length; checkpos++) {
							switch (txt[checkpos]) {
								case quote:
									isInParamValue = true;
									break;
								case "<": case ">": case "/":
									break;
								default:
									continue;
							}
							break;
						}

					if (isInParamValue)
						break;
					else
						continue;
				case '>':
					if (!quote)
						isInElement = false;
					break;
				case quote:
					quote = undefined
					continue;
				case "'": case '"':
					quotesfoundct++;
					if (!quote)
						quote = txt[start];
					continue;
				default:
					continue;
			}
			if (txt[start] === '<') {
				break;
			} else if (txt[start] === '>')
				isInElement = false;
			break;
		}

		let endtag = '<';
		if (isInElement)
			endtag = '>'

		this.getUsedNamespaces(txt);
		if (isInElement && !isInParamValue) {
			for (end = pos; end < txt.length; end++)
				if (txt[end] === endtag)
					break;

			connection.console.info("Found cursor location to be in element");
			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.processInTag(txt.substring(start, end + 1)));
			});
		} else if (!isInElement) {
			let parent = this.getParentElement(txt, start, []);
			let tag = parent.element.$.name.match(/(\w*?):?(\w*)$/);
			let schema = schemastorage[this.usedNamespaces[tag[1]]];
			let type = this.getType(parent.element.$.type, schema);
			let elements = this.getElements(type, parent.path, schema);
			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.processAllowedElements(elements, schema));
			});
		}
	}

	processAllowedElements(elements: Element[], schema: StorageSchema): CompletionItem[] {
		let foundElements: { namespace: string, elements: Element[] }[] = [];
		let baseElements: Element[] = [];

		// First get all element references, if referenced.
		for (let element of elements) {
			try {
				let useschema = schema;
				if (element.$ && element.$.ref) {
					let res = this.getElementFromReference(element.$.ref, useschema);
					element = res.element;
					useschema = res.ownerSchema;
					if (!element)
						continue;
					baseElements.push(element);
				}
				foundElements = foundElements.concat(this.getDerivedElements(element, useschema));
			} catch (error) {
				connection.console.error("Error getting element: " + error.toString());
			}
		}

		let ret: CompletionItem[] = [];
		for (let item of foundElements) {
			for (let entry of item.elements)
				try {
					let citem = CompletionItem.create(entry.$.name);
					let nsprefix = item.namespace.length>0 ? item.namespace + ":" : "";
					citem.insertText = "<" + nsprefix + entry.$.name + ">$0</" + nsprefix + entry.$.name + ">";
					citem.insertTextFormat = 2;
					citem.kind = CompletionItemKind.Class;
					if(item.namespace.length>0)
						citem.detail = "Namespace: " + item.namespace;
					try {
						citem.documentation = entry.annotation[0].documentation[0];
					} catch (error) {

					}
					ret.push(citem);
				} catch (error) {
					connection.console.error("Item error: " + error.toString());
				}
		}
		return ret;
	}

	getDerivedElements(element: Element, owningSchema: StorageSchema): { namespace: string, elements: Element[] }[] {
		var type = this.getType(element.$.type, owningSchema);
		// Find all schemas using the owningSchema (and so maybe the element)
		let schemasUsingNamespace: { nsabbrevation: string, schema: StorageSchema }[] = [];
		for (let targetns in schemastorage) {
			if (targetns === owningSchema.targetNamespace)
				continue;
			let curschema = schemastorage[targetns];
			for (let namespace in curschema.referencedNamespaces)
				// check if xsd file is referenced in current schema.
				if (curschema.referencedNamespaces[namespace] === owningSchema.targetNamespace) {
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
						let basetypes = this.getBaseTypes(this.getType(e.$.type, schema.schema), schema.schema);
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

	getBaseTypes(type: ComplexType, schema: StorageSchema, path?: ComplexType[]): ComplexType[] {
		if (!path)
			path = [];

		try {
			let newtypename = type.complexContent[0].extension[0].$.base
			let newtype = this.getType(newtypename, schema);
			path.push(newtype);
			this.getBaseTypes(newtype, schema, path);
		} catch (error) {
		}
		return path;
	}

	getElementFromReference(elementref: string, schema: StorageSchema): { element: Element, ownerSchema: StorageSchema } {
		// Split namespace and 
		let nsregex = elementref.match(/(\w*?):?(\w+?)$/);
		if (schema.referencedNamespaces[nsregex[1]] !== schema.targetNamespace)
			schema = schemastorage[schema.referencedNamespaces[nsregex[1]]];

		return { element: this.findElement(nsregex[2], schema), ownerSchema: schema };
	}

	getElements(type: ComplexType, path: string[], schema: StorageSchema): Element[] {
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

	getElementsFromSequenceAndChoice(element: Element, schema: StorageSchema): Element[] {
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

	private getParentElement(txt: string, start: number, path: string[]): { element: Element, path: string[] } {
		let entagfound = false;
		let quote: string;
		for (let i = start; i >= 0; i--) {
			switch (txt[i]) {
				case '<':
					if (!quote) {
						// Add Whitespace to make regex more simple
						let foundelement = txt.substring(i, start) + " ";
						let x = foundelement.match(/<(\w*?):?(\w+?)(\s|\/|>)/);
						let schema = schemastorage[this.usedNamespaces[x[1]]];
						let element = this.findElement(x[2].trim(), schema);
						if (!element) {
							path.push(x[2].trim());
							return this.getParentElement(txt, --i, path);
						}
						else
							return { element: element, path: path };
					}
					continue;
				case quote:
					quote = undefined;
					continue;
				case "'": case '"':
					if (!quote)
						quote = txt[i];
					continue;
				default:
					continue;
			}
		}
		return undefined;
	}

	private processInTag(tagstring: string): CompletionItem[] {
		let tagmatch = tagstring.match(/^<(\w*?):?(\w*?)[\s\/]/);
		let tag = { name: tagmatch[2], namespace: tagmatch[1] };
		let namespace = this.usedNamespaces[tag.namespace];
		let schema = schemastorage[namespace];
		let element = this.findElement(tag.name, schema);
		let elementType = this.getType(element.$.type, schema);
		let attributes = this.getAttributes(elementType, schema);
		let ret: CompletionItem[] = [];
		for (let attribute of attributes) {
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

	private getAttributes(type: ComplexType, schema: StorageSchema): Attribute[] {
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

	private getType(typename: string, schema: StorageSchema): ComplexType {
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
				let newschema = schemastorage[schema.referencedNamespaces[namespace]];
				return this.getType(typename, newschema);
			}
		}
		let complextype: ComplexType;
		for (complextype of complexTypes) {
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

	private findElement(name: string, schema: StorageSchema): Element {
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

			return element;
		}
	}

	private getUsedNamespaces(input: string): void {
		let xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g
		let match: RegExpMatchArray;
		this.usedNamespaces = {};
		while (match = xmlnsregex.exec(input))
			this.usedNamespaces[match[1]] = match[2];
	}

	async createSchemas(): Promise<void> {
		schemastorage = {};
		connection.console.info("Creating Schema storage.")
		for (let file of fs.readdirSync(schemastorePath)) {
			try {
				let xmltext = fs.readFileSync(path.join(schemastorePath, file)).toString();
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

							connection.console.info("Found a valid schema. Renaming namespace abbrevation '" + schemanamespace + " to empty abbrevation to make it more readable for programmers.");

							if (namespaces[""]) {
								connection.console.error("There is an empty namespace. It will be missinterpreted, as for lazynessreasons of the author the xsd namespace will be removed from all elements.");
							}

							var start = schemanamespace + ":"
							res = substitute(res, (key, value) => {
								if (key.startsWith(start)) {
									return key.split(":")[1];
								}
								return key;
							});

							connection.console.info("Converted schema " + schemanamespace);

							if (schemanamespace)
								schemastorage[tns[1]] = { schemanamespace: schemanamespace, schema: res.schema, referencedNamespaces: namespaces, targetNamespace: tns[1] };
							else
								return reject("No Schema namespace defined, make sure your schema is compared against 'http://www.w3.org/2001/XMLSchema'")
							return resolve();
						}
						else
							return reject({ message: "No Target Namespace found in schema '" + file + "'" });
					});
				});
			} catch (error) {
				return connection.console.warn("Could not open Schema '" + file + "': " + JSON.stringify(error));
			}
		}
	}
}

var schemastorage: XmlStorage;

interface XmlStorage {
	[x: string]: StorageSchema
}

interface XmlBase {
	[x: string]: any
}

interface Element extends XmlBase {
	$: {
		name?: string,
		type?: string,
		substitutionGroup?: string,
		minOccurs?: number | string
		maxOccurs?: number | string
		ref?: string
	}
	sequence?: Sequence[];
	complexType?: ComplexType[];
	annotation?: Annotation[];
}

interface XmlComplexContent extends XmlBase {
	extension?: Extension[];
}

interface Sequence extends XmlBase {
	element?: Element[];
	choice?: Choice[];
}

interface Choice extends XmlBase {
	$: {
		minOccurs: number | string,
		maxOccurs: number | string
	}
	element?: Element[];
	any?: Any[]
}

interface Any extends XmlBase {
	$: {
		processContents?: string;
		namespace?: string;
	}
}

interface ComplexType extends XmlBase {
	$: {
		name: string
	}
	complexContent?: XmlComplexContent[];
	attribute?: Attribute[];

	// Additional properties for navigation
	basetype?: ComplexType;
	schema: StorageSchema;
}

interface Extension extends XmlBase {
	$: {
		base: string;
	}
	attribute?: Attribute[];
	sequence?: Sequence[];
}

interface Attribute extends XmlBase {
	$: {
		name: string;
		type: string;
	}
	annotation?: Annotation[];

	// Additional properties for navigation
	__owner?: ComplexType;
}

interface Annotation extends XmlBase {
	documentation?: string[];
}

interface XmlSchema extends XmlBase {
	complexType?: ComplexType[];
	element?: Element[];
}

interface StorageSchema {
	schemanamespace?: string,
	schema: XmlSchema,
	referencedNamespaces: { [x: string]: string }, targetNamespace: string
}

interface Storage {
	i18nItems?: CompletionItem[];
}

var storage: Storage = {};

function tryOpenEventHandler(line: string, positionInLine: number, documentText: string): Location[] {
	let rightpart = line.substr(positionInLine).match(/(\w*?)"/)[1];
	if (!rightpart)
		return null;

	let leftpart = line.substr(0, positionInLine);
	let leftquotepos = leftpart.match(/.*"/)[0].length;
	if (!leftquotepos)
		return;
	leftpart = leftpart.substr(leftquotepos);
	let name = leftpart + rightpart;

	let cnameri = documentText.match(/controllerName="([\w\.]+)"/);

	if (!cnameri) {
		return [];
	}

	let cname = cnameri[1].split(".").pop();

	let files = File.find(new RegExp(cname + controllerFileEx));

	let foundControllers: Location[] = [];
	let ret: Location[] = [];
	// Check typescript (dirty)
	for (let i = 0; i < files.length; i = i + 2) {
		let f = files.length > 1 ? files[i + 1] : files[i];
		foundControllers.push({ range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + f });
	}

	// TODO: Make more robust regex for finding method

	for (let entry of foundControllers) {
		let txt = File.open(entry.uri.substr(8));

		let matchRegex = new RegExp(name + /\s*?\(.*?\)/.source, "g");
		let ranges = getRange(txt, matchRegex);
		if (ranges.length > 0)
			for (let r of ranges)
				ret.push({ uri: entry.uri, range: r });
		// let pos = vscode. . positionAt(match.index + match[1].length).line;
		// let range = controllerdoc.lineAt(lineNumber).range;
	}

	return ret;
}

function getLine(text: string, linenumber: number) {
	let lines = text.split(/\n/);
	return lines[linenumber];
}

documents.onDidChangeContent((e) => {
	connection.console.info("Did  Change Content Event occurred.")
});

function getRange(docText: string, searchPattern: RegExp): Range[] {
	const lineRegex = /.*(?:\n|\r\n)/gm;
	let l;
	let ret: Range[] = [];
	let linectr = 0;
	while ((l = lineRegex.exec(docText)) !== null) {
		linectr = linectr + 1;
		if (l.index === lineRegex.lastIndex)
			lineRegex.lastIndex++;

		let match = searchPattern.exec(l);

		if (!match)
			continue;

		ret.push({ start: { line: linectr, character: match.index }, end: { line: linectr, character: match.index + match[0].length }, });
	}
	return ret;
}

function getLineByIndex(input: string, startindex: number): string {
	let rightpart = input.substr(startindex).match(/.*/m)[0];
	if (!rightpart)
		return null;
	const getLastLineRegex = /\n.*/gm;
	let leftinput = input.substr(0, startindex);
	let l, m;
	while ((l = getLastLineRegex.exec(leftinput)) !== null) {
		if (l.index === getLastLineRegex.lastIndex)
			getLastLineRegex.lastIndex++;
		m = l;
	}

	let leftpart = m.pop().substr(1);
	if (!leftpart)
		return null;

	return leftpart + rightpart;
}

interface Settings {
	ui5ts: {
		lang: {
			i18n: {
				modelname: string,
				modelfilelocation: string
			}
		}
	}
	xml: {
		schemastoragelocation: string;
		schemas: string[];
	}
}

var settings: Settings = {
	ui5ts: {
		lang: {
			i18n: {
				modelfilelocation: "./i18n/i18n.properties",
				modelname: "i18n"
			}
		}
	},
	xml: {
		schemastoragelocation: "./.vscode/schemas/xml",
		schemas: []
	}
};

connection.onDidChangeConfiguration((change) => {
	connection.console.info("Changed settings: " + JSON.stringify(change));
	settings = <Settings>change.settings;
});

connection.listen();

function traverse(o: any, func: (key: string, value: any) => void) {
	for (let i in o) {
		func.apply(this, [i, o[i], o]);
		if (o[i] !== null && typeof (o[i]) == "object") {
			if (o[i] instanceof Array)
				for (let entry of o[i])
					traverse({ [i]: entry }, func);
			//going on step down in the object tree!!
			traverse(o[i], func);
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