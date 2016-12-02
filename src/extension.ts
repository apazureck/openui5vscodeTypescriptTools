'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as commands from './commands';
import * as file from './helpers/filehandler';
import * as fs from 'fs';
import * as log from './helpers/logging';

export const name = "ui5-ts";
export var context: vscode.ExtensionContext;
export interface Ui5Extension {
    namespacemappings: { [id: string] : string; };
}
export var ui5extension: Ui5Extension = { namespacemappings: { } };

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(c: vscode.ExtensionContext) {
    context = c;
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Activating UI5 extension.');

    getAllNamespaceMappings();

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let setupUi5Command = vscode.commands.registerCommand('ui5ts.SetupUi5', commands.SetupUi5);

    let switchToViewCommand = vscode.commands.registerCommand('ui5ts.SwitchToController', commands.SwitchToController);
    let switchToControllerCommand = vscode.commands.registerCommand('ui5ts.SwitchToView', commands.SwitchToView);
    let switchToFileCommand = vscode.commands.registerTextEditorCommand('ui5ts.GoToDefinition', commands.GoToDefinition);

    context.subscriptions.push(setupUi5Command);
    context.subscriptions.push(switchToViewCommand);
    context.subscriptions.push(switchToFileCommand);
    context.subscriptions.push(switchToViewCommand);
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
