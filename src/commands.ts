/// <reference path="./helpers/filehandler.ts"/>

import * as vscode from 'vscode';
import * as ncp from 'ncp';
import * as ui5ts from './extension';
import * as log from './helpers/logging';
import * as file from './helpers/filehandler';

var ln: (searchstring: string, pattern: RegExp) => { line: string, match: string, number: number }[] = require('line-number');

const namespaceformat = /^(\w+\.?)+\w+$/;

export async function SetupUi5 (context: vscode.ExtensionContext): Promise<void> {
    // The code you place here will be executed every time your command is executed

    if(!vscode.workspace.rootPath) {
        log.showerror("Cancelling: No Project is opened");
        return;
    }
    
    let result = await vscode.workspace.findFiles("**/manifest.json", null, 1);
    if(result.length>0) {
        log.showerror("Cancelling: Project is already a UI5 project.");
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
        log.showerror("Cancelling: No project namespace was given.");
        return;
    }

    // Get all project files and copy them to the workspace (with folder structure)
    ncp.ncp(context.extensionPath+"\\templates\\project", vscode.workspace.rootPath, (err) => { 
        if(err) {
            log.showerror("Error while copying files:'"+err.message+"'");
            return;
        }
        log.printInfo("Files copied.");

        // Search all files for namespace token and replace it with user input
        let replacer = new file.ReplaceInFiles(vscode.workspace.rootPath);
        replacer.replaceTokens([{ key: "$(projectNamespace)", value: projectnamespace}]);
    });

    // Display a message box to the user
    log.showinfo('Created new project layout');
}

export async function SwitchToView(): Promise<void> {
    let viewname = file.File.getFileName(vscode.window.activeTextEditor.document.fileName).split(".")[0] + ".view.xml";

    let viewfile = await file.File.find(viewname);

    if(!viewfile)
        return;

    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(viewfile[0]));
}

export async function GoToDefinition(textEditor, edit): Promise<void> {
    let filename = file.File.getFileName(vscode.window.activeTextEditor.document.fileName);
    if(!filename.match(/\.view\.(?:xml|json)$/))
        return;
    let line = vscode.window.activeTextEditor.document.lineAt(vscode.window.activeTextEditor.selection.active);
    let tag = line.text.match(/(\w+)Name="(.*?)"/);

    if(!tag)
        return tryOpenEventHandler(line);

    let tName = tag[2].split(".").pop();
    let f: string;
    switch (tag[1]) {
        case "controller":
            let files = await file.File.find(new RegExp(tName+"\\.controller\\.(js|ts)$"));
            // Check typescript (dirty)
            f = files.length>1 ? files[1] : files[0];
            break;
        case "view":
            f = (await file.File.find(new RegExp(tName+"\\.view\\.(xml|json)$")))[0];
            break;
        case "fragment":
            f = (await file.File.find(new RegExp(tName+"\\.fragment\\.(xml|json)$")))[0];
            break;
        default:
            let eventhandlertag = vscode.window.activeTextEditor.selection.active;
            break;
    }

    if(file)
        vscode.window.showTextDocument(await vscode.workspace.openTextDocument(f));
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

    await SwitchToController();

    editor = vscode.window.activeTextEditor;
    let ccontent = editor.document.getText();

    let match = new RegExp(/^(\s*?)/.source+name+/\s*?\(.*?\)/.source, "gm").exec(ccontent);
    let lineNumber = editor.document.positionAt(match.index + match[1].length).line;
    let range = editor.document.lineAt(lineNumber).range;
    editor.selection =  new vscode.Selection(range.start, range.end);
    editor.revealRange(range);
}

export async function SwitchToController() {
    let text = vscode.window.activeTextEditor.document.getText();
    let cnameri = text.match(/controllerName="([\w\.]+)"/);

    if(!cnameri) {
        return;
    }

    let cname = cnameri[1].split(".").pop();
    
    let foundcontrollers = await file.File.find(new RegExp(cname+"\\.controller\\.(?:ts|js)$"));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(foundcontrollers.length>1?foundcontrollers[1]:foundcontrollers[0]));
}
