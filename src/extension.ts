'use strict';
import * as path from 'path';
import { request } from 'http';
import { listeners } from 'cluster';
import { Url } from 'url';
import { FileHandler, KeyValuePair } from './helpers/filehandler';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as ncp from 'ncp';
import * as rrd from 'recursive-readdir';
import * as fs from 'fs';
import * as enumerable from 'linq-es5';
var FsFinder = require('fs-finder');

export const extensionname = "ui5-ts";
const namespaceformat = /^(\w+\.?)+\w+$/;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Activating UI5 extension.');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let setupUi5Command = vscode.commands.registerCommand('extension.SetupUi5', async () => {
        // The code you place here will be executed every time your command is executed

        if(!vscode.workspace.rootPath) {
            showerror("Cancelling: No Project is opened");
            return;
        }
        
        let result = await vscode.workspace.findFiles("**/manifest.json", null, 1);
        if(result.length>0) {
            showerror("Cancelling: Project is already a UI5 project.");
            return;
        }

        // Get project namespace from user
        let projectnamespace = await vscode.window.showInputBox(
            { validateInput: (value) => {
                if(value.match(namespaceformat))
                    return null;
                else
                    return "Wrong namespace format!";
            },
            placeHolder: "my.ui5.project",
            prompt: "Set default namespace",
            ignoreFocusOut: true});

        if(!projectnamespace) {
            showerror("Cancelling: No project namespace was given.");
            return;
        }

        // Get all project files and copy them to the workspace (with folder structure)
        ncp.ncp(context.extensionPath+"\\templates\\project", vscode.workspace.rootPath, (err) => { 
            if(err) {
                showerror("Error while copying files:'"+err.message+"'");
                return;
            }
            printInfo("Files copied.");

            // Search all files for namespace token and replace it with user input
            let replacer = new ReplaceInFiles(vscode.workspace.rootPath);
            replacer.replaceTokens([{ key: "$(projectNamespace)", value: projectnamespace}]);
        });

        // Display a message box to the user
        showinfo('Created new project layout');
    });

    let switchToViewCommand = vscode.commands.registerCommand('extension.SwitchToController', async () => {
        let text = vscode.window.activeTextEditor.document.getText();
        let cnameri = text.match(/controllerName="([\w\.]+)"/);

        let cname = cnameri[1].split(".").pop()+".controller";
        
        let foundcontroller;
        rrd(vscode.workspace.rootPath, async (err, files) => {
            let flist = enumerable.AsEnumerable(files);
            foundcontroller = flist.FirstOrDefault(x=>x.match(cname)!=null);

            vscode.window.showTextDocument(await vscode.workspace.openTextDocument(foundcontroller));
         });
    });

    context.subscriptions.push(setupUi5Command);
    context.subscriptions.push(switchToViewCommand);
}

export class ReplaceInFiles {
    private _dir: string;
    constructor(dir: string) {
        this._dir = dir;
    }

    public async replaceTokens(tokens: KeyValuePair[]) {
        rrd(vscode.workspace.rootPath, (error, files) => {
            files.forEach(async (file) => {
                fs.readFile(file, (err, data) => {
                    if(err)
                        return printError("Error reading file: '" + err.message + "'");
                        
                    let result = FileHandler.replaceText(data.toString(), tokens);

                    fs.writeFile(file, result, (err) => { if(err) printError("Error writing back to file: '" + err.message + "'")});
                })
            });
        });
    }
}

export function showerror(message: string) {
    vscode.window.showErrorMessage(extensionname + ": " + message);
}
export function showinfo(message: string) {
    vscode.window.showInformationMessage(extensionname + ": " + message);
}
export function showWarning(message: string) {
    vscode.window.showWarningMessage(extensionname + ": " + message);
}
export function printInfo(message: string) {
    console.info(extensionname + ": "+message);
}
export function printError(message: string) {
    console.error(extensionname + ": "+message);
}
export function printWarning(message: string) {
    console.warn(extensionname + ": "+message);
}

// this method is called when your extension is deactivated
export function deactivate() {
    
}
