/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	IPCMessageReader, IPCMessageWriter, RequestHandler, Definition, Location, ResponseError,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, Range
} from 'vscode-languageserver';
import {  } from 'cancellation'
import * as vscodels from 'vscode-languageserver'
import { File } from './filehandler';
import * as p from 'path';
import * as enumerable from 'linq-es5';

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
				triggerCharacters: [
					'.'
				]
			}
		}
	}
});

connection.onDefinition((params) => {
	return [];
});

documents.onDidChangeContent(change => {
	let diag: Diagnostic[] = [];
	let text = change.document.getText();
	let jcontent: Manifest = JSON.parse(text);
	let targets = enumerable.AsEnumerable(getTargets(jcontent));
	for(let route of jcontent["sap.ui5"].routing.routes) {
		if(!targets.Contains(route.target))
			diag.push({
				message: "Target '" + route.target + "' could not be found.",
				range: getRange(text, new RegExp(route.name))[0],
				severity: 1,
				source: route.name
			});
	}
	connection.sendDiagnostics({ uri: change.document.uri, diagnostics: diag });
});

function getTargets(jcontent: Manifest) {
	let targetnames: string[] = []
	for(let key in jcontent["sap.ui5"].routing.targets)
		targetnames.push(key);
	return targetnames;
}

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

documents.onDidChangeContent((e) => {
	connection.console.info("Did  Change Content Event occurred.")
});

connection.listen();

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

function getLine(input: string, startindex: number): string {
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