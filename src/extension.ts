'use strict';
import { format } from 'util';
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

var ln: (searchstring: string, pattern: RegExp) => { line: string, match: string, number: number }[] = require('line-number');

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

    let switchToViewCommand = vscode.commands.registerCommand('extension.SwitchToController', switchToController);

    let switchToControllerCommand = vscode.commands.registerCommand('extension.SwitchToView', async () => {
        let viewname = File.getFileName(vscode.window.activeTextEditor.document.fileName).split(".")[0] + ".view.xml";

        let viewfile = await File.find(viewname);

        if(!viewfile)
            return;

        vscode.window.showTextDocument(await vscode.workspace.openTextDocument(viewfile[0]));
    });

    let switchToFileCommand = vscode.commands.registerCommand('extension.GoToFile', async () => {
        let filename = File.getFileName(vscode.window.activeTextEditor.document.fileName);
        if(!filename.match(/\.view\.(?:xml|json)$/))
            return;

        let line = vscode.window.activeTextEditor.document.lineAt(vscode.window.activeTextEditor.selection.active);
        let tag = line.text.match(/(\w+)Name="(.*?)"/);

        if(!tag)
            return tryOpenEventHandler(line);

        let tName = tag[2].split(".").pop();
        let file: string;
        switch (tag[1]) {
            case "controller":
                let files = await File.find(new RegExp(tName+"\\.controller\\.(js|ts)$"));
                // Check typescript (dirty)
                file = files.length>1 ? files[1] : files[0];
                break;
            case "view":
                file = (await File.find(new RegExp(tName+"\\.view\\.(xml|json)$")))[0];
                break;
            case "fragment":
                file = (await File.find(new RegExp(tName+"\\.fragment\\.(xml|json)$")))[0];
                break;
            default:
                let eventhandlertag = vscode.window.activeTextEditor.selection.active;
                break;
        }

        if(file)
            vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
    })

    context.subscriptions.push(setupUi5Command);
    context.subscriptions.push(switchToViewCommand);
    context.subscriptions.push(switchToFileCommand);
}

async function tryOpenEventHandler(line: vscode.TextLine): Promise<void> {
    let editor = vscode.window.activeTextEditor;
    let rightpart = line.text.substr(editor.selection.active.character).match(/(\w*?)"/)[1];
    if(!rightpart)
        return;

    let leftpart = line.text.substr(0, editor.selection.active.character);
    let leftquotepos = leftpart.match(/.*"/)[0].length;
    if(!leftquotepos)
        return;
    leftpart = leftpart.substr(leftquotepos);
    let name = leftpart+rightpart;

    await switchToController();

    editor = vscode.window.activeTextEditor;
    let ccontent = editor.document.getText();

    let match = new RegExp(/^(\s*?)/.source+name+/\s*?\(.*?\)/.source, "gm").exec(ccontent);
    let lineNumber = editor.document.positionAt(match.index + match[1].length).line;
    let range = editor.document.lineAt(lineNumber).range;
    editor.selection =  new vscode.Selection(range.start, range.end);
    editor.revealRange(range);
}

async function switchToController() {
    let text = vscode.window.activeTextEditor.document.getText();
    let cnameri = text.match(/controllerName="([\w\.]+)"/);

    if(!cnameri) {
        return;
    }

    let cname = cnameri[1].split(".").pop();
    
    let foundcontrollers = await File.find(new RegExp(cname+"\\.controller\\.(?:ts|js)$"));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(foundcontrollers.length>1?foundcontrollers[1]:foundcontrollers[0]));
}

/**
 * File interface
 * 
 * @export
 * @class File
 */
export class File {
    
    /**
     * async file search method.
     * 
     * @static
     * @param {(string|RegExp)} pattern to search for. * == Wildcard
     * @param {string} [startdir] to start search at. default: workspace root path
     * @returns {Promise<string>}
     * 
     * @memberOf File
     */
    static async find(pattern: RegExp|string, startdir?: string): Promise<string[]> {
        startdir = startdir ? startdir : vscode.workspace.rootPath;
        let matcher = typeof pattern === "string" ? new RegExp((pattern as string).replace("*", ".*")) : pattern as RegExp; 
        return new Promise<string[]>((resolve, reject) => {
            rrd(startdir, (err, files) => {
                if(err) {
                    reject(err);
                    return;
                }
                let result = enumerable.asEnumerable(files).Where(x => x.match(matcher)!=null);
                if(result)
                    resolve(result.ToArray());
                else
                    reject();
            });
        });
    }

    static getFileName(path: string): string {
        return path.split("\\").pop();
    }
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
