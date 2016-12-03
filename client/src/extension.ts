'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as commands from './commands';
import * as file from './helpers/filehandler';
import * as fs from 'fs';
import * as log from './helpers/logging';
import * as defprov from './language/ui5/Ui5DefinitionProviders';

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

export var ui5extension: Ui5Extension = { namespacemappings: { } };

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(c: vscode.ExtensionContext) {
    context = c;
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Activating UI5 extension.');

    getAllNamespaceMappings();

    // Hook the commands
    context.subscriptions.push(vscode.commands.registerCommand('ui5ts.SetupUi5', commands.SetupUi5));
    context.subscriptions.push(vscode.commands.registerCommand('ui5ts.SwitchToView', commands.SwitchToView));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('ui5ts.SwitchToController', commands.SwitchToController));

    // Setup Language Providers
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_xmlviews, new defprov.Ui5ViewDefinitionProvider));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_jsonviews, new defprov.Ui5ViewDefinitionProvider));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_tscontrollers, new defprov.Ui5ControllerDefinitionProvider));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_jscontrollers, new defprov.Ui5ControllerDefinitionProvider));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_xmlfragments, new defprov.Ui5FragmentDefinitionProvider))
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(ui5_jsonfragments, new defprov.Ui5FragmentDefinitionProvider))
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
