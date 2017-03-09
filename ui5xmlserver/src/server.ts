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
	CompletionItem, CompletionItemKind, Location, Range, DidChangeTextDocumentParams, CompletionList, Position, PublishDiagnosticsParams
} from 'vscode-languageserver';
import { } from 'cancellation'
import * as vscodels from 'vscode-languageserver';
import { File } from './filehandler';
import * as p from 'path';
import * as xml from 'xml2js';
import * as fs from 'fs';
import { XmlStorage, StorageSchema } from './xmltypes'
import { XmlCompletionHandler } from './providers/XmlCompletionProvider'
import { LogLevel } from './Log'
import {
    DiagnosticCollection,
    XmlAttributeDiagnosticProvider,
    XmlWellFormedDiagnosticProvider
} from './providers/XmlDiagnosticProvider';

const controllerFileEx = "\\.controller\\.(js|ts)$";

/**
 * Initialization options for the xml language server
 * 
 * @interface XmlInitOptions
 */
interface XmlInitOptions {
    /**
     * asolute path to the folder of the xsd files
     * 
     * @type {string}
     * @memberOf XmlInitOptions
     */
	storagepath: string;
}

export namespace Global {
	/**
	 * settings coming from the language client (the extension). Can be changed by the user.
	 */
	export var settings: ClientSettings;
	/**
	 * Static settings for the server
	 */
	export var serverSettings: XmlInitOptions;
	/**
	 * Instance of the schemastore, which handles the xml schemas
	 */
	export var schemastore: XmlStorage;
	/**
	 * Root folder of the current workspace
	 */
	export var workspaceRoot: string;
}

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

connection.onInitialize((params): InitializeResult => {
	connection.console.info("Initializing XML language server");
	// connection.console.log("params: " + JSON.stringify(params));

	Global.serverSettings = params.initializationOptions
	Global.workspaceRoot = params.rootPath;
	Global.schemastore = new XmlStorage(Global.serverSettings.storagepath, connection, LogLevel.None);

	connection.console.info("Starting Listener")
	// Make the text document manager listen on the connection
	// for open, change and close text document events
	documents.listen(connection);

	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			definitionProvider: false,
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: ["<", ">", '"', "'", ".", "/"]
			},
			codeActionProvider: false
		}
	}
});

connection.onCompletion(async (params, token): Promise<CompletionList> => {
	connection.console.info("Completion providing request received");
	// Use completion list, as the return will be called before 
	let cl: CompletionList = {
		isIncomplete: true,
		items: []
	};

	let doc = documents.get(params.textDocument.uri);
	let line = getLine(doc.getText(), params.position.line);

	try {
		let ch = new XmlCompletionHandler(Global.schemastore, documents, connection, "./schemastore", Global.settings.ui5ts.lang.xml.LogLevel);
		cl.items = cl.items.concat(await ch.getCompletionSuggestions(params));
		cl.isIncomplete = false;
	} catch (error) {
		connection.console.error("Error when getting XML completion entries: " + JSON.stringify(error));
	}
	return cl;
});

documents.onDidChangeContent(async (params) => {
	let doc = documents.get(params.document.uri);
	if (!doc)
		return;

	
	let diagnostics: PublishDiagnosticsParams = { uri: doc.uri, diagnostics: [] }

	try {
		let wfd = new XmlWellFormedDiagnosticProvider(connection, Global.settings.ui5ts.lang.xml.LogLevel);
		diagnostics.diagnostics = diagnostics.diagnostics.concat(await wfd.diagnose(doc));
	} catch(error) {
	}
	try {
		let ad = new XmlAttributeDiagnosticProvider(Global.schemastore, connection, Global.settings.ui5ts.lang.xml.LogLevel);
		diagnostics.diagnostics = diagnostics.diagnostics.concat(await ad.diagnose(doc));
	} catch(error) {
	}
	connection.sendDiagnostics(diagnostics);
});

connection.onDidChangeConfiguration((change) => {
	connection.console.info("Changed settings: " + JSON.stringify(change));
	Global.settings = <ClientSettings>change.settings;
});

export function getLine(text: string, linenumber: number): string {
	let lines = text.split(/\n/);
	if(linenumber > lines.length-1)
		linenumber = lines.length-1;
	return lines[linenumber];
}

export function getRange(docText: string, searchPattern: RegExp): Range[] {
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

export function getPositionFromIndex(input: string, index: number): Position {
	let lines = input.split("\n");
	let curindex = 0;
	let lineindex = 0;
	let curline: string;
	for (let line of lines) {
		if (index <= curindex + line.length) {
			return {
				line: lineindex,
				character: index - curindex
			}
		}
		curindex += line.length;
		lineindex++;
	}
}

export function getLineCount(input: string) {
	return input.split("\n").length;
}

interface ClientSettings {
	ui5ts: {
		lang: {
			i18n: {
				modelname: string
				modelfilelocation: string
			}
			xml: {
				autoCloseEmptyElement: boolean,
				LogLevel: LogLevel
			}
		}

	}
}

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

connection.listen();