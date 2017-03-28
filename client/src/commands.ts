import { workspace, window, ExtensionContext, TextDocument, Uri } from 'vscode';
import { ui5tsglobal } from './extension'
import * as ncp from 'ncp';
import * as log from './helpers/logging';
import * as file from './helpers/filehandler';
import * as fs from 'fs'
import * as path from 'path'
import { Storage } from './language/xml/XmlDiagnostics'

const namespaceformat = /^(\w+\.?)+\w+$/;
const controllerFileEx = ".controller.{ts,js}";
const viewFileEx = ".view.{xml,json}";

export async function SetupUi5(): Promise<void> {
    // The code you place here will be executed every time your command is executed

    if (!workspace.rootPath) {
        log.showerror("Cancelling: No Project is opened");
        return;
    }

    let result = await workspace.findFiles("**/manifest.json", null, 1);
    if (result.length > 0) {
        log.showerror("Cancelling: Project is already a UI5 project.");
        return;
    }

    // Get project namespace from user
    let projectnamespace = await window.showInputBox(
        {
            validateInput: (value) => {
                if (value.match(namespaceformat))
                    return null;
                else
                    return "Wrong namespace format!";
            },
            placeHolder: "my.ui5.project",
            prompt: "Set default namespace",
            ignoreFocusOut: true
        });

    if (!projectnamespace) {
        log.showerror("Cancelling: No project namespace was given.");
        return;
    }

    // Get all project files and copy them to the workspace (with folder structure)
    ncp.ncp(path.join(ui5tsglobal.core.extensionPath, "templates", "project"), workspace.rootPath, (err) => {
        if (err) {
            log.showerror("Error while copying files:'" + err.message + "'");
            return;
        }
        log.printInfo("Files copied.");

        // Search all files for namespace token and replace it with user input
        let replacer = new file.ReplaceInFiles(workspace.rootPath);
        replacer.replaceTokens([{ key: "$(projectNamespace)", value: projectnamespace }]);
    });

    // Display a message box to the user
    log.showinfo('Created new project layout');
}

export async function SwitchToView(): Promise<void> {

    let fullname = ui5tsglobal.core.GetFullNameByFile(window.activeTextEditor.document.fileName);
    let views = await getViewsForController(fullname);

    if (views.length < 1)
        return;

    if (views.length > 1) {
        window.showInformationMessage("Multiple views found");
        const pick = await window.showQuickPick(views.map(x => x.path.substring(1)));
        window.showTextDocument(await workspace.openTextDocument(pick));
    } else {
        window.showTextDocument(await workspace.openTextDocument(views[0]));
    }
}

async function getViewsForController(cname: string): Promise<Uri[]> {
    let views = await workspace.findFiles(ui5tsglobal.core.relativeRootPath + "/**/*" + viewFileEx, undefined);
    let ret: Uri[] = [];
    for (let view of views) {
        let doc = (await workspace.openTextDocument(view)).getText();
        if (doc.match(new RegExp("controllerName=[\"']" + cname + "[\"']")))
            ret.push(view);
    }
    return ret;
}

export async function SwitchToController() {
    let text = "";
    // TODO: Find view with matching controller
    // check if it is a view
    if (path.basename(window.activeTextEditor.document.uri.path).match(".view.")) {
        text = window.activeTextEditor.document.getText();
        // it is a fragment
    } else {
        text = getView(window.activeTextEditor.document, path.basename(window.activeTextEditor.document.uri.path));
    }

    const tag = text.match(/controllerName=["']([\w\.]+)["']/);

    if (!tag) {
        return;
    }

    const files = await workspace.findFiles(ui5tsglobal.core.CreateRelativePath(tag[1]) + controllerFileEx, undefined);
    if (files.length > 0)
        await window.showTextDocument(await workspace.openTextDocument(files.length > 1 ? files[1] : files[0]));
}

function getView(doc: TextDocument, fragmentName: string): string {
    return "";
}

export async function AddSchemaToStore(): Promise<void> {
    let context = this as ExtensionContext;
    let filename = await window.showInputBox({ prompt: 'Schema location (has to be local .xsd file)', ignoreFocusOut: true });
    // validateInput: (value: string) => {
    //     if(!value.match(/^[a-z]:((\/|(\\?))[\w .]+)+\.xsd$/i))
    //         return "Path is not valid.";
    //     else
    //         return null;
    if (filename.endsWith(".xsd")) {
        fs.createReadStream(filename).pipe(fs.createWriteStream(path.join(context.extensionPath, "schemastore", path.basename(filename))));
        window.showInformationMessage("Successfully added schema to storage.");
    } else {
        let files = fs.readdirSync(filename);
        for (let file of files) {
            fs.createReadStream(path.join(filename, file)).pipe(fs.createWriteStream(path.join(context.extensionPath, "schemastore", path.basename(file))));
        }
        window.showInformationMessage("Successfully added schema to storage.");
    }
    // TODO: Validation
}

export async function AddI18nLabel(label?: string, onSuccess?: () => void) {
    label = label || await window.showInputBox({ prompt: 'Name of the label', ignoreFocusOut: true });
    let text = await window.showInputBox({ prompt: 'Text the user will see', ignoreFocusOut: true });

    try {
        Storage.i18n.addNewLabel(label, text);
        try {
            if (onSuccess)
                onSuccess();
        } catch (error) {
            // TODO: Create error message on console
        }
    } catch (error) {
        return window.showErrorMessage(error.toString());
    }
}

export async function ResetI18nStorage() {
    Storage.i18n.create();
}