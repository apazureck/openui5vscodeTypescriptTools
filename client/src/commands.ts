import * as vscode from 'vscode';
import * as ui5ts from './extension'
import * as ncp from 'ncp';
import * as log from './helpers/logging';
import * as file from './helpers/filehandler';
import * as fs from 'fs'
import * as path from 'path'
import { Storage } from './language/xml/XmlDiagnostics'

export var core: ui5ts.Ui5Extension;

const namespaceformat = /^(\w+\.?)+\w+$/;

export async function SetupUi5 (): Promise<void> {
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
    ncp.ncp(path.join(core.extensionPath, "templates", "project"), vscode.workspace.rootPath, (err) => { 
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

export async function AddSchemaToStore(): Promise<void> {
    let context = this as vscode.ExtensionContext;
    let filename = await vscode.window.showInputBox({prompt: 'Schema location (has to be local .xsd file)', ignoreFocusOut: true});
    // validateInput: (value: string) => {
    //     if(!value.match(/^[a-z]:((\/|(\\?))[\w .]+)+\.xsd$/i))
    //         return "Path is not valid.";
    //     else
    //         return null;
    if(filename.endsWith(".xsd")) {
        fs.createReadStream(filename).pipe(fs.createWriteStream(path.join(context.extensionPath, "schemastore", path.basename(filename))));
        vscode.window.showInformationMessage("Successfully added schema to storage.");
    } else {
        let files = fs.readdirSync(filename);
        for(let file of files) {
            fs.createReadStream(path.join(filename, file)).pipe(fs.createWriteStream(path.join(context.extensionPath, "schemastore", path.basename(file))));
        }
        vscode.window.showInformationMessage("Successfully added schema to storage.");
    }
    Storage.schemastore.initializeStorage();
    // TODO: Validation
}

export async function AddI18nLabel(label?: string, onSuccess?: () => void) {
    label = label || await vscode.window.showInputBox({prompt: 'Name of the label', ignoreFocusOut: true});
    let text = await vscode.window.showInputBox({prompt: 'Text the user will see', ignoreFocusOut: true});

    try {
        Storage.i18n.addNewLabel(label, text);
        try {
            if(onSuccess)
                onSuccess();
        } catch (error) {
            // TODO: Create error message on console
        }
    } catch (error) {
        return vscode.window.showErrorMessage(error.toString());   
    }
}

export async function ResetI18nStorage() {
    Storage.i18n.create();
}