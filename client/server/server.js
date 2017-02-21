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
const XmlCompletionProvider_1 = require('./providers/XmlCompletionProvider');
const controllerFileEx = "\\.controller\\.(js|ts)$";
// Create a connection for the server. The connection uses Node's IPC as a transport
let connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
// Create a simple text document manager. The text document manager
// supports full document sync only
let documents = new vscode_languageserver_1.TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
connection.onInitialize((params) => {
    connection.console.info("Initializing UI5 XML language server");
    connection.console.log("params: " + JSON.stringify(params));
    exports.workspaceRoot = params.rootPath;
    exports.schemastorePath = params.initializationOptions.schemastore;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            // Tell the client that the server support code complete
            definitionProvider: true,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: [">"]
            }
        }
    };
});
connection.onDefinition((params) => {
    let files;
    let doc = documents.get(params.textDocument.uri);
    let startindex = doc.offsetAt(params.position);
    let text = doc.getText();
    let line = getLineByIndex(text, startindex);
    let tag = line.match(/(\w+)Name="(.*?)"/);
    if (!tag)
        return tryOpenEventHandler(line, params.position.character, text);
    let tName = tag[2].split(".").pop();
    let ret = [];
    switch (tag[1]) {
        case "controller":
            files = filehandler_1.File.find(new RegExp(tName + controllerFileEx));
            // Check typescript (dirty)
            for (let i = 0; i < files.length; i = i + 2) {
                let f = files.length > 1 ? files[i + 1] : files[i];
                ret.push({ range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + f });
            }
            return ret;
        case "view":
            files = filehandler_1.File.find(new RegExp(tName + "\\.view\\.(xml|json)$"));
            for (let f in files)
                ret.push({ range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + files[0] });
        case "fragment":
            files = filehandler_1.File.find(new RegExp(tName + "\\.fragment\\.(xml|json)$"));
            return { range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + files[0] };
        default:
            // let eventhandlertag = vscode.window.activeTextEditor.selection.active;
            return [];
    }
});
connection.onCompletion((handler) => __awaiter(this, void 0, void 0, function* () {
    connection.console.info("Completion providing request received");
    let cl = [];
    let doc = documents.get(handler.textDocument.uri);
    let line = getLine(doc.getText(), handler.position.line);
    try {
        cl = cl.concat(new I18NCompletionHandler().geti18nlabels(line, handler.position.character));
    }
    catch (error) {
        connection.console.error("Error when getting i18n completion entries: " + JSON.stringify(error));
    }
    try {
        let ch = new XmlCompletionProvider_1.XmlCompletionHandler(schemastorage, documents, connection, exports.schemastorePath, settings.ui5ts.lang.xml.LogLevel);
        cl = cl.concat(yield ch.getCompletionSuggestions(handler));
        schemastorage = ch.schemastorage;
    }
    catch (error) {
        connection.console.error("Error when getting XML completion entries: " + JSON.stringify(error));
    }
    return cl;
}));
class I18NCompletionHandler {
    geti18nlabels(line, cursorpos) {
        let pos = line.match(new RegExp(settings.ui5ts.lang.i18n.modelname + ">(.*?)}?\""));
        if (!pos)
            return [];
        let startpos = pos.index + settings.ui5ts.lang.i18n.modelname.length + 1;
        let endpos = startpos + pos[1].length;
        if (cursorpos < startpos || cursorpos > endpos)
            return [];
        if (!storage.i18nItems)
            storage.i18nItems = this.getLabelsFormi18nFile();
        return storage.i18nItems;
    }
    getLabelsFormi18nFile() {
        if (!settings.ui5ts.lang.i18n.modelfilelocation)
            settings.ui5ts.lang.i18n.modelfilelocation = "./i18n/i18n.properties";
        let content = filehandler_1.File.open(settings.ui5ts.lang.i18n.modelfilelocation).split("\n");
        let items = [];
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
                        kind: vscode_languageserver_1.CompletionItemKind.Text,
                    });
            }
            catch (error) {
            }
        }
        return items;
    }
}
var schemastorage;
var storage = {};
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
function getLine(text, linenumber) {
    let lines = text.split(/\n/);
    return lines[linenumber];
}
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
function getLineByIndex(input, startindex) {
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
var settings;
connection.onDidChangeConfiguration((change) => {
    connection.console.info("Changed settings: " + JSON.stringify(change));
    settings = change.settings;
});
connection.listen();
function traverse(o, func) {
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
//# sourceMappingURL=server.js.map