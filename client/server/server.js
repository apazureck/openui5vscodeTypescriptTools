/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
const vscode_languageserver_1 = require('vscode-languageserver');
const filehandler_1 = require('./filehandler');
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
    exports.workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            // Tell the client that the server support code complete
            definitionProvider: true
        }
    };
});
connection.onDefinition((params) => {
    let files;
    let doc = documents.get(params.textDocument.uri);
    let startindex = doc.offsetAt(params.position);
    let text = doc.getText();
    let line = getLine(text, startindex);
    let tag = line.match(/(\w+)Name="(.*?)"/);
    // if(!tag)
    // 	return tryOpenEventHandler(document, position, token);
    let tName = tag[2].split(".").pop();
    switch (tag[1]) {
        case "controller":
            files = filehandler_1.File.findSync(new RegExp(tName + "\\.controller\\.(js|ts)$"));
            // Check typescript (dirty)
            let f = files.length > 1 ? files[1] : files[0];
            return { range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + f };
        case "view":
            files = filehandler_1.File.findSync(new RegExp(tName + "\\.view\\.(xml|json)$"));
            let ret;
            for (let f in files)
                ret.push({ range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + files[0] });
        case "fragment":
            files = filehandler_1.File.findSync(new RegExp(tName + "\\.fragment\\.(xml|json)$"));
            return { range: { start: { character: 0, line: 0 }, end: { character: 0, line: 0 } }, uri: "file:///" + files[0] };
        default:
            // let eventhandlertag = vscode.window.activeTextEditor.selection.active;
            throw new DOMException();
    }
});
documents.onDidChangeContent((e) => {
    connection.console.info("Did  Change Content Event occurred.");
});
connection.listen();
function getLine(input, startindex) {
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
//# sourceMappingURL=server.js.map