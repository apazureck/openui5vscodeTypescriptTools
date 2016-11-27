'use strict';
import { Url } from 'url';
import { FileHandler } from './helpers/filehandler';
import { appendFile } from 'fs';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Activating UI5 extension.');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.SetupUi5', async () => {
        // The code you place here will be executed every time your command is executed

        if(!vscode.workspace.rootPath) {
            vscode.window.showErrorMessage("No Project is opened");
            return;
        }
        
        let result = await vscode.workspace.findFiles("**/manifest.json", null, 1);
        if(result.length>0) {
            vscode.window.showErrorMessage("Project is already a UI5 project.");
            return;
        }

        try {
            let appcontroller = await vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:"+vscode.workspace.rootPath+"\\controller\\App.controller.ts"));
            let writer = new FileHandler(appcontroller);
            writer.appendText(vscode.Uri.parse("file:///"+context.extensionPath+"/templates/project/controller/App.controller.txt"))
        } catch (error) {
            vscode.window.showWarningMessage("App.controller.ts seems to exist already and will not be created twice.")
        }
        
        console.info("Created App controller");

        let manifest = await vscode.workspace.openTextDocument(vscode.Uri.parse("untitled:"+vscode.workspace.rootPath+"\\manifest.json"));
        manifest.save();
        
        console.info("Created new manifest.json file");

        // Display a message box to the user
        vscode.window.showInformationMessage('Created new project layout');
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}