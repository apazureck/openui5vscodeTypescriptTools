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
		let isInTag: boolean = true;

		// Catch border Problem i always equals the element right of the cursor.
		if (txt[pos] === ">")
			pos--;
		else if (txt[pos] === "<")
			pos++;

		for (start = pos; start >= 0; start--) {
			if (txt[start] === '<') {
				break;
			} else if (txt[start] === '>')
				isInTag = false;
		}

		let endtag = '<';
		if (isInTag)
			endtag = '>'

		for (end = pos; end < txt.length; end++)
			if (txt[end] === endtag)
				break;

		if (isInTag) {
			this.getUsedNamespaces(txt);
			return new Promise<CompletionItem[]>((resolve, reject) => {
				resolve(this.processInTag(txt.substring(start, end + 1)));
			});
		}


	}

	private processInTag(tagstring: string): CompletionItem[] {
		let tagmatch = tagstring.match(/^<(\w*?):?(\w*?)[\s\/]/);
		let tag = { name: tagmatch[2], namespace: tagmatch[1] };
		let namespace = this.usedNamespaces[tag.namespace];
		let schema = schemastorage[namespace];
		let element = this.findElement(tag, schema);
		let elementType = this.getType(element, schema);
		let attributes = this.getAttributes(elementType, schema);
		let ret : CompletionItem[] = [];
		for(let attribute of attributes) {
			ret.push(this.getCompletionItemFromAttribute(attribute, schema));
		}
		return ret;
	}

	private getCompletionItemFromAttribute(attribute: XmlAttribute, schema: XmlSchema): CompletionItem {
		let schemansprefix = schema.schemanamespace !== "" ? schema.schemanamespace + ":" : "";
		return {
			label: attribute.$.name,
			detail: attribute[schemansprefix+"annotation"][0][schemansprefix+"documentation"][0],
			kind: CompletionItemKind.Property
		}

	}

	private getAttributes(type: XmlComplexType, schema: XmlSchema): XmlAttribute[] {
		let schemansprefix = schema.schemanamespace !== "" ? schema.schemanamespace + ":" : "";
		return type[schemansprefix+"complexContent"][0][schemansprefix+"extension"][0][schemansprefix + "attribute"];
	}

	private getType(element: XmlElement, schema: XmlSchema) {
		let schemansprefix = schema.schemanamespace !== "" ? schema.schemanamespace + ":" : "";
		let aType = element.$.type.split(":");
		let typename, namespace: string;
		if (aType.length > 1) {
			namespace = aType[0];
			typename = aType[1];
		} else {
			typename = element.$.name;
		}
		let complexTypes: any[] = schema.schema[schemansprefix + "schema"][schemansprefix + "complexType"]
		if (namespace) {
			if (schema.referencedNamespaces[namespace] !== schema.targetNamespace)
				connection.console.info("Getting Information from other xsd files is not implemented yet"); // Handle other namespaces
		}
		let complextype: XmlComplexType;
		for (complextype of complexTypes) {
			if (!complextype.$)
				continue;
			if (!complextype.$.name)
				continue;

			if (complextype.$.name === typename)
				return complextype;
		}
	}

	private findElement(tag: { name: string, namespace: string }, schema: XmlSchema): XmlElement {
		let schemansprefix = schema.schemanamespace !== "" ? schema.schemanamespace + ":" : "";
		// Traverse over all
		for (let element of schema.schema[schemansprefix + "schema"][schemansprefix + "element"]) {
			if (!element.$)
				continue;
			if (!element.$.name)
				continue;
			if (element.$.name !== tag.name)
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

							if (schemanamespace)
								schemastorage[tns[1]] = { schemanamespace: schemanamespace, schema: res, referencedNamespaces: namespaces, targetNamespace: tns[1] };
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
	[x: string]: XmlSchema
}

interface XmlBase {
	[x: string]: any
}

interface XmlElement extends XmlBase {
	$: {
		name: string,
		type: string,
		substitutionGroup: string
	}
}

interface XmlComplexType extends XmlBase {
	$: {
		name: string
	}
}

interface XmlExtension extends XmlBase {
	$: {
		base: string;
	}
}

interface XmlAttribute extends XmlBase {
	$: {
		name: string;
		type: string;
	}

}

interface XmlSchema { schemanamespace?: string, schema: {}, referencedNamespaces: { [x: string]: string }, targetNamespace: string }

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
		func.apply(this, [i, o[i]]);
		if (o[i] !== null && typeof (o[i]) == "object") {
			if (o[i] instanceof Array)
				for (let entry of o[i])
					traverse({ [i]: entry }, func);
			//going on step down in the object tree!!
			traverse(o[i], func);
		}
	}
}