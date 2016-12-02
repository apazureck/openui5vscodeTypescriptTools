'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as commands from './commands';

export const name = "ui5-ts";
export var context: vscode.ExtensionContext;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(c: vscode.ExtensionContext) {
    context = c;
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Activating UI5 extension.');

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

// this method is called when your extension is deactivated
export function deactivate() {
    
}
