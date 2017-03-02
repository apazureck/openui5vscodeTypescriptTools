"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const filehandler_1 = require('./filehandler');
const xmltypes_1 = require('./xmltypes');
const XmlCompletionProvider_1 = require('./providers/XmlCompletionProvider');
const Log_1 = require('./Log');
const XmlDiagnosticProvider_1 = require('./providers/XmlDiagnosticProvider');
const controllerFileEx = "\\.controller\\.(js|ts)$";
var Global;
(function (Global) {
})(Global = exports.Global || (exports.Global = {}));
// Create a connection for the server. The connection uses Node's IPC as a transport
let connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
// Create a simple text document manager. The text document manager
// supports full document sync only
let documents = new vscode_languageserver_1.TextDocuments();
connection.onInitialize((params) => {
    connection.console.info("Initializing XML language server");
    connection.console.log("params: " + JSON.stringify(params));
    Global.serverSettings = params.initializationOptions;
    Global.workspaceRoot = params.rootPath;
    Global.schemastore = new xmltypes_1.XmlStorage(Global.serverSettings.storagepath, connection, Log_1.LogLevel.None);
    connection.console.info("Starting Listener");
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
    };
});
connection.onCompletion((params, token) => __awaiter(this, void 0, void 0, function* () {
    connection.console.info("Completion providing request received");
    // Use completion list, as the return will be called before 
    let cl = {
        isIncomplete: true,
        items: []
    };
    let doc = documents.get(params.textDocument.uri);
    let line = getLine(doc.getText(), params.position.line);
    try {
        let ch = new XmlCompletionProvider_1.XmlCompletionHandler(Global.schemastore, documents, connection, "./schemastore", Global.settings.ui5ts.lang.xml.LogLevel);
        cl.items = cl.items.concat(yield ch.getCompletionSuggestions(params));
        cl.isIncomplete = false;
    }
    catch (error) {
        connection.console.error("Error when getting XML completion entries: " + JSON.stringify(error));
    }
    return cl;
}));
connection.onDidChangeTextDocument((changeparams) => __awaiter(this, void 0, void 0, function* () {
    let doc = documents.get(changeparams.textDocument.uri);
    if (!doc)
        return;
    let dp = new XmlDiagnosticProvider_1.XmlWellFormedDiagnosticProvider(connection, Global.settings.ui5ts.lang.xml.LogLevel);
    let diagnostics = yield dp.diagnose(doc);
    connection.sendDiagnostics(diagnostics);
}));
documents.onDidChangeContent((e) => {
    let i = 0;
});
connection.onDidChangeWatchedFiles((params) => {
    params.changes[0].uri;
});
connection.onDidChangeConfiguration((change) => {
    connection.console.info("Changed settings: " + JSON.stringify(change));
    Global.settings = change.settings;
});
function getLine(text, linenumber) {
    let lines = text.split(/\n/);
    return lines[linenumber];
}
exports.getLine = getLine;
function getRange(docText, searchPattern) {
    const lineRegex = /.*(?:\n|\r\n)/gm;
    let l;
    let ret = [];
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
exports.getRange = getRange;
function getPositionFromIndex(input, index) {
    let lines = input.split("\n");
    let curindex = 0;
    let lineindex = 0;
    let curline;
    for (let line of lines) {
        if (index <= curindex + line.length) {
            return {
                line: lineindex,
                character: index - curindex
            };
        }
        curindex += line.length;
        lineindex++;
    }
}
exports.getPositionFromIndex = getPositionFromIndex;
function getLineCount(input) {
    return input.split("\n").length;
}
exports.getLineCount = getLineCount;
function tryOpenEventHandler(line, positionInLine, documentText) {
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
    let files = filehandler_1.File.find(new RegExp(cname + controllerFileEx));
    let foundControllers = [];
    let ret = [];
    // Check typescript (dirty)
    for (let i = 0; i < files.length; i = i + 2) {
        let f = files.length > 1 ? files[i + 1] : files[i];
        foundControllers.push({ range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + f });
    }
    // TODO: Make more robust regex for finding method
    for (let entry of foundControllers) {
        let txt = filehandler_1.File.open(entry.uri.substr(8));
        let matchRegex = new RegExp(name + /\s*?\(.*?\)/.source, "g");
        let ranges = getRange(txt, matchRegex);
        if (ranges.length > 0)
            for (let r of ranges)
                ret.push({ uri: entry.uri, range: r });
    }
    return ret;
}
connection.listen();
//# sourceMappingURL=server.js.map