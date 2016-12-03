import * as vscode from 'vscode';
import * as file from '../../helpers/filehandler';
import * as commands from '../../commands';

export class Ui5ViewDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
        let line = vscode.window.activeTextEditor.document.lineAt(vscode.window.activeTextEditor.selection.active);
        let tag = line.text.match(/(\w+)Name="(.*?)"/);

        if(!tag)
            return tryOpenEventHandler(document, position, token);

        let tName = tag[2].split(".").pop();
        switch (tag[1]) {
            case "controller":
                return file.File.find(new RegExp(tName+"\\.controller\\.(js|ts)$")).then((files) => {
                    // Check typescript (dirty)
                    let f = files.length>1 ? files[1] : files[0];
                    new vscode.Location(vscode.Uri.parse("file:///"+f), new vscode.Position(0,0));
                });
            case "view":
                return file.File.find(new RegExp(tName+"\\.view\\.(xml|json)$")).then((files) => {
                    return new vscode.Location(vscode.Uri.parse("file:///"+files[0]), new vscode.Position(0,0));
                });
            case "fragment":
                return file.File.find(new RegExp(tName+"\\.fragment\\.(xml|json)$")).then((files) => {
                    return new vscode.Location(vscode.Uri.parse("file:///"+files[0]), new vscode.Position(0,0));
                });
            default:
                let eventhandlertag = vscode.window.activeTextEditor.selection.active;
                break;
        }
    }
}

export class Ui5FragmentDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
        let line = vscode.window.activeTextEditor.document.lineAt(vscode.window.activeTextEditor.selection.active);
        let tag = line.text.match(/(\w+)Name="(.*?)"/);

        if(!tag)
            return tryOpenEventHandler(document, position, token);

        let tName = tag[2].split(".").pop();
        switch (tag[1]) {
            case "view":
                return file.File.find(new RegExp(tName+"\\.view\\.(xml|json)$")).then((files) => {
                    return new vscode.Location(vscode.Uri.parse("file:///"+files[0]), new vscode.Position(0,0));
                });
            case "fragment":
                return file.File.find(new RegExp(tName+"\\.fragment\\.(xml|json)$")).then((files) => {
                    return new vscode.Location(vscode.Uri.parse("file:///"+files[0]), new vscode.Position(0,0));
                });
            default:
                break;
        }
    }
}

export class Ui5ControllerDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
        return null;
        // let line = vscode.window.activeTextEditor.document.lineAt(vscode.window.activeTextEditor.selection.active);
        // let tag = line.text.match(/(\w+)Name="(.*?)"/);

        // if(!tag)
        //     return tryOpenEventHandler(document, position, token);

        // let tName = tag[2].split(".").pop();
        // switch (tag[1]) {
        //     case "controller":
        //         return file.File.find(new RegExp(tName+"\\.controller\\.(js|ts)$")).then((files) => {
        //             // Check typescript (dirty)
        //             let f = files.length>1 ? files[1] : files[0];
        //             new vscode.Location(vscode.Uri.parse("file:///"+f), new vscode.Position(0,0));
        //         });
        //     case "view":
        //         return file.File.find(new RegExp(tName+"\\.view\\.(xml|json)$")).then((files) => {
        //             return new vscode.Location(vscode.Uri.parse("file:///"+files[0]), new vscode.Position(0,0));
        //         });
        //     case "fragment":
        //         return file.File.find(new RegExp(tName+"\\.fragment\\.(xml|json)$")).then((files) => {
        //             return new vscode.Location(vscode.Uri.parse("file:///"+files[0]), new vscode.Position(0,0));
        //         });
        //     default:
        //         let eventhandlertag = vscode.window.activeTextEditor.selection.active;
        //         break;
        // }
    }
}

function tryOpenEventHandler(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
    let rightpart = document.lineAt(position.line).text.substr(position.character).match(/(\w*?)"/)[1];
    if(!rightpart)
        return null;

    let leftpart = document.lineAt(position.line).text.substr(0, position.character);
    let leftquotepos = leftpart.match(/.*"/)[0].length;
    if(!leftquotepos)
        return;
    leftpart = leftpart.substr(leftquotepos);
    let name = leftpart+rightpart;

    let text = vscode.window.activeTextEditor.document.getText();
    let cnameri = text.match(/controllerName="([\w\.]+)"/);

    if(!cnameri) {
        return null;
    }

    let cname = cnameri[1].split(".").pop();

    return file.File.find(new RegExp(cname+"\\.controller\\.(js|ts)$")).then((files) => {
                let f = files.length>1 ? files[1] : files[0];
                let uri = vscode.Uri.parse("file:///"+f);
                return vscode.workspace.openTextDocument(uri).then((controllerdoc) => {
                    let ccontent = controllerdoc.getText();

                    let match = new RegExp(/^(\s*?)/.source+name+/\s*?\(.*?\)/.source, "gm").exec(ccontent);
                    let lineNumber = document.positionAt(match.index + match[1].length).line;
                    let range = controllerdoc.lineAt(lineNumber).range;
                    return new vscode.Location(uri, range);
                });
            });
}
