'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as commands from './commands';
import * as file from './helpers/filehandler';
import * as fs from 'fs';
import * as log from './helpers/logging';
// import * as defprov from './language/ui5/Ui5DefinitionProviders';
// import * as mcp from './language/ui5/ManifestCompletionItemProvider';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';
import * as path from 'path';
import * as enumerable from 'linq-es5';

export const name = "ui5-ts";
export var context: vscode.ExtensionContext;
export interface Ui5Extension {
    namespacemappings: { [id: string] : string; };
}

const ui5_jsonviews: vscode.DocumentFilter = { language: 'json', scheme: 'file', pattern: "*.view.json" };
const ui5_xmlviews: vscode.DocumentFilter = { language: 'ui5xml', scheme: "file", pattern: "*.view.xml"};
const ui5_tscontrollers: vscode.DocumentFilter = { language: 'typescript', scheme: 'file', pattern: "*.controller.ts"};
const ui5_jscontrollers: vscode.DocumentFilter = { language: 'javascript', scheme: 'file', pattern: ".controller.js"};
const ui5_jsonfragments: vscode.DocumentFilter = { language: 'json', scheme: 'file', pattern: "*.fragment.json"};
const ui5_xmlfragments: vscode.DocumentFilter = { language: "ui5xml", scheme: 'file', pattern: "*.fragment.xml"};
const ui5_manifest: vscode.DocumentFilter = { language: "json", scheme: 'file', pattern: "**/manifest.json"};

export var ui5extension: Ui5Extension = { namespacemappings: { } };

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(c: vscode.ExtensionContext) {
    context = c;
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Activating UI5 extension.');

    startXmlViewLanguageServer();
    // startManifestLanguageServer();

    getAllNamespaceMappings();

    // Hook the commands
    context.subscriptions.push(vscode.commands.registerCommand('ui5ts.SetupUi5', commands.SetupUi5));
    context.subscriptions.push(vscode.commands.registerCommand('ui5ts.SwitchToView', commands.SwitchToView));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('ui5ts.SwitchToController', commands.SwitchToController));

    // Setup Language Providers
    // context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_xmlviews, new defprov.Ui5ViewDefinitionProvider));
    // context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_jsonviews, new defprov.Ui5ViewDefinitionProvider));
    // context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_tscontrollers, new defprov.Ui5ControllerDefinitionProvider));
    // context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_jscontrollers, new defprov.Ui5ControllerDefinitionProvider));
    // context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_xmlfragments, new defprov.Ui5FragmentDefinitionProvider))
    // context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_jsonfragments, new defprov.Ui5FragmentDefinitionProvider));

    diagnosticCollection = vscode.languages.createDiagnosticCollection('json');
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(ui5_manifest, new ManifestCompletionItemProvider));

    context.subscriptions.push(diagnosticCollection);

    vscode.workspace.onDidChangeTextDocument(onChange);
}

let diagnosticCollection: vscode.DiagnosticCollection;

function onChange(changes: vscode.TextDocumentChangeEvent) {
    try {
	diagnosticCollection.clear();
	let diag: vscode.Diagnostic[] = [];
	let text = changes.document.getText();
	let jcontent: Manifest = JSON.parse(text);
	let targets = enumerable.AsEnumerable(getTargets(jcontent));
	for(let route of jcontent["sap.ui5"].routing.routes) {
		try {
			if(!targets.Contains(route.target))
				diag.push({
					message: "Target '" + route.target + "' could not be found. Check your 'sap.ui5.targets' section for the correct key or define the target there.",
					range: getRange(text, new RegExp(route.name))[0],
					severity: 0,
					source: route.name,
					code: "newCode123"
				});
		} catch (error) {
			
		}
	}
	if(diag.length>0)
		diagnosticCollection.set(changes.document.uri, diag);
		if(jcontent)
			manifest = jcontent;
	} catch (error) {

	}
}

function getTargets(jcontent: Manifest) {
	let targetnames: string[] = []
	for(let key in jcontent["sap.ui5"].routing.targets)
		targetnames.push(key);
	return targetnames;
}

function getRange(docText: string, searchPattern: RegExp): vscode.Range[] {
	const lineRegex = /.*(?:\n|\r\n)/gm;
	let l;
	let ret: vscode.Range[] = [];
	let linectr = 0;
	while((l = lineRegex.exec(docText)) !== null) {
	 linectr = linectr + 1;
		if(l.index === lineRegex.lastIndex)
			lineRegex.lastIndex++;

		let match = searchPattern.exec(l);
		
		if(!match)
			continue;
		
        ret.push(new vscode.Range(new vscode.Position(linectr, match.index), new vscode.Position(linectr, match.index + match[0].length)));
	}
	return ret;
}

async function getAllNamespaceMappings() {
    ui5extension.namespacemappings = { };
    // search all html files
    let docs = await file.File.find(".*\\.(html|htm)$");
    for(let doc of docs) {
        try {
            let text = (await vscode.workspace.openTextDocument(vscode.Uri.parse("file:///"+doc))).getText();
            // get script html tag with data-sap-ui-resourceroots
            let scripttag = text.match(/<\s*script[\s\S]*sap-ui-core[\s\S]*data-sap-ui-resourceroots[\s\S]*?>/m)[0];
            if(!scripttag)
                continue;
            let resourceroots = scripttag.match(/data-sap-ui-resourceroots.*?['"][\s\S]*?{([\s\S]*)}[\s\S]*['"]/m)[1];
            if(!resourceroots)
                continue;
            for(let rr of resourceroots.split(",")) {
                let entry = rr.split(":");
                let key = entry[0].trim();
                let val = entry[1].trim();
                log.printInfo("Found " + key + " to replace with " + val);
                ui5extension.namespacemappings[key.substr(1, key.length-2)] = val.substr(1, val.length-2);
            }
        }
        catch (error) {

        }
    }
    console.info(ui5extension.namespacemappings);
}

// this method is called when your extension is deactivated
export function deactivate() {
    
}

function startManifestLanguageServer(): void {
    // The server is implemented in node
    log.printInfo("Staring Manifest language server");
	let serverModule = context.asAbsolutePath(path.join('languages', 'ui5manifest', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };
	
	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}
	
	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for UI5 xml decuments documents
		documentSelector: ['manifest.json'],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			// configurationSection: 'languageServerExample',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
		}
	}
	
	// Create the language client and start the client.
	let disposable = new LanguageClient('UI5 Manifest Language Client', serverOptions, clientOptions).start();
    // Push the disposable to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
}

function startXmlViewLanguageServer(): void {
    // The server is implemented in node
    log.printInfo("Staring XML View language server");
	let serverModule = context.asAbsolutePath(path.join('languages', 'ui5xml', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };
	
	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}
	
	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for UI5 xml decuments documents
		documentSelector: ['ui5xml'],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			// configurationSection: 'languageServerExample',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			// fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
		}
	}
	
	// Create the language client and start the client.
	let disposable = new LanguageClient('UI5 XML Language Client', serverOptions, clientOptions).start();
    // Push the disposable to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
}

var manifest: Manifest;

export class ManifestCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> | vscode.CompletionItem[] | Thenable<vscode.CompletionList> {
		return new Promise<vscode.CompletionItem[]>((resolve, reject) => {
			let line = document.lineAt(position);
			let matches = line.text.match(/"(.*)"\s*:\s*(.*)\s*[,]?\s*/);
			if(!matches)
				return reject("No matches found.");
			if(token.isCancellationRequested) reject("Cancelled");

			let key = matches[1];
			let value = matches[2];
			let val;

			try {
				switch (key) {
				case "target":
					console.log("Target triggered\n");
					let targets: string[];
					try {
						if(manifest)
							targets = getTargets(manifest);
						else
							targets = getTargets(JSON.parse(document.getText()));
					} catch (error) {
						return reject(error);
					}

					if(token.isCancellationRequested) reject("Cancelled");

					if(!targets)
						return reject("No targets found");
					
					let kind = vscode.CompletionItemKind.Value;
					if(value && value.startsWith('"')) {
						value = value.match(/"(.*)"/)[1];
						kind = vscode.CompletionItemKind.Text;
					}

					if(!value) {
						val = new vscode.CompletionList(enumerable.asEnumerable(targets).Select(x => {
							if(token.isCancellationRequested) throw("Cancelled");
							let item = new vscode.CompletionItem(x, kind);
							item.insertText = "\""+x+"\"";
							return item;
						}).ToArray(), false); 
						return resolve(val);
					}

					val = new vscode.CompletionList(enumerable.asEnumerable(targets).Where(x => x.toLowerCase().startsWith(value.toLowerCase())).Select(x => {
							if(token.isCancellationRequested) throw("Cancelled");
							let item = new vscode.CompletionItem(x, kind);
							item.insertText = "\""+x+"\"";
							return item;
					}).ToArray(), false);
					return resolve(val);
				default:
					return reject("Unknown Key: '"+key+"'");
			}
			} catch(error) { 
				reject(error);
			}
		});
    }
}