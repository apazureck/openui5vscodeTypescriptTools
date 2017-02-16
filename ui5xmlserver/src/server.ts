import { CompletionList } from 'vscode-languageserver-types/lib/main';
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
import {  } from 'cancellation'
import * as vscodels from 'vscode-languageserver'
import { File } from './filehandler';
import * as p from 'path';

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

connection.onInitialize((params): InitializeResult => {
	connection.console.info("Initializing UI5 XML language server");
	workspaceRoot = params.rootPath;
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

	if(!tag)
		return tryOpenEventHandler(line, params.position.character, text);

	let tName = tag[2].split(".").pop();
	let ret: Location[] = [];
	switch (tag[1]) {
		case "controller":
			files = File.find(new RegExp(tName+controllerFileEx));
			// Check typescript (dirty)
			for(let i =0; i< files.length; i = i+2 ) {
				let f = files.length>1 ? files[i+1] : files[i];
				ret.push({ range: { start: { character: 0, line: 0}, end: { character: 0, line: 0}}, uri: "file:///"+f });
			}
			return ret;
		case "view":
			files = File.find(new RegExp(tName+"\\.view\\.(xml|json)$"));
			for(let f in files)
				ret.push({ range: { start: { character: 0, line: 0}, end: { character: 0, line: 0}}, uri: "file:///"+files[0] });
		case "fragment":
			files = File.find(new RegExp(tName+"\\.fragment\\.(xml|json)$"));
			return { range: { start: { character: 0, line: 0}, end: { character: 0, line: 0}}, uri: "file:///"+files[0] };
		default:
			// let eventhandlertag = vscode.window.activeTextEditor.selection.active;
			return [];
	}
});

connection.onCompletion((handler) => {
	connection.console.info("Completion providing request received");
	return new Promise<CompletionItem[]>((resolve, reject) => {
		let cl: CompletionItem[] = [];
		let doc = documents.get(handler.textDocument.uri);
		let line = getLine(doc.getText(), handler.position.line);
		cl = cl.concat(geti18nlabels(line, handler.position.character));
		resolve(cl);
	});
});

function geti18nlabels(line: string, cursorpos: number): CompletionItem[] {
	let pos = line.match(new RegExp(settings.ui5ts.lang.i18nmodelname + ">(.*?)}?\"")) as RegExpMatchArray;
	if(!pos)
		return [];
	
	let startpos = pos.index + settings.ui5ts.lang.i18nmodelname.length + 1;
	let endpos = startpos + pos[1].length
	if(cursorpos < startpos || cursorpos > endpos)
		return [];

	if(!storage.i18nItems)
		storage.i18nItems = getLabelsFormi18nFile();
	
	return storage.i18nItems;
}

function getLabelsFormi18nFile(): CompletionItem[] {
	if(!settings.ui5ts.lang.i18nmodelfilelocation)
		settings.ui5ts.lang.i18nmodelfilelocation = "./i18n/i18n.properties";
	let content = File.open(settings.ui5ts.lang.i18nmodelfilelocation).split("\n");
	let items: CompletionItem[] = []
	for(let line of content) {
		try {
			// Comment
		if(line.startsWith("#"))
			continue;
		// New label
		let match = line.match("^(.*?)=(.*)");
		if(match)
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

interface Storage {
	i18nItems?: CompletionItem[];
}

var storage: Storage = {};

function tryOpenEventHandler(line: string, positionInLine: number, documentText: string): Location[] {
	let rightpart = line.substr(positionInLine).match(/(\w*?)"/)[1];
    if(!rightpart)
        return null;

    let leftpart = line.substr(0, positionInLine);
    let leftquotepos = leftpart.match(/.*"/)[0].length;
    if(!leftquotepos)
        return;
    leftpart = leftpart.substr(leftquotepos);
    let name = leftpart+rightpart;

    let cnameri = documentText.match(/controllerName="([\w\.]+)"/);

    if(!cnameri) {
		return [];
    }

	let cname = cnameri[1].split(".").pop();

	let files = File.find(new RegExp(cname+controllerFileEx));

	let foundControllers: Location[] = [];
	let ret: Location[] = [];
	// Check typescript (dirty)
	for(let i =0; i< files.length; i = i+2 ) {
		let f = files.length>1 ? files[i+1] : files[i];
		foundControllers.push({ range: { start: { character: 0, line: 0}, end: { character: 0, line: 0}}, uri: "file:///"+f });
	}

	// TODO: Make more robust regex for finding method

	for(let entry of foundControllers) {
		let txt = File.open(entry.uri.substr(8));

		let matchRegex = new RegExp(name+/\s*?\(.*?\)/.source, "g");
		let ranges = getRange(txt, matchRegex);
		if(ranges.length>0)
			for(let r of ranges)
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
	while((l = lineRegex.exec(docText)) !== null) {
	 linectr = linectr + 1;
		if(l.index === lineRegex.lastIndex)
			lineRegex.lastIndex++;

		let match = searchPattern.exec(l);
		
		if(!match)
			continue;
		
		ret.push({ start: { line: linectr, character: match.index}, end: { line: linectr, character: match.index + match[0].length}, });
	}
	return ret;
}

function getLineByIndex(input: string, startindex: number): string {
	let rightpart = input.substr(startindex).match(/.*/m)[0];
	if(!rightpart)
		return null;
	const getLastLineRegex = /\n.*/gm;
	let leftinput = input.substr(0, startindex);
	let l, m;
	while((l = getLastLineRegex.exec(leftinput)) !== null) {
		if(l.index === getLastLineRegex.lastIndex)
			getLastLineRegex.lastIndex++;
		m = l;
	}
	
	let leftpart = m.pop().substr(1);
	if(!leftpart)
		return null;
	
	return leftpart + rightpart;
}

interface Settings {
	ui5ts: {
		lang: {
			i18nmodelname: string,
			i18nmodelfilelocation: string
		}
	}
}

var settings: Settings = {
	ui5ts: {
		lang: {
			i18nmodelfilelocation: "./i18n/i18n.properties",
			i18nmodelname: "i18n"
		}
	}
};

connection.onDidChangeConfiguration((change) => {
	settings = <Settings>change.settings;
});

connection.listen();