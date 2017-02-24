import * as file from '../../helpers/filehandler';
import * as commands from '../../commands';
import {
    CancellationToken,
    CompletionItem,
    CompletionList,
    Definition,
    DefinitionProvider,
    Location,
    Position,
    TextDocument,
    workspace,
    window,
    Uri,
    Range
} from 'vscode';
import { channel } from '../../extension'
import { Storage } from '../xml/XmlDiagnostics'

export class Ui5ViewDefinitionProvider implements DefinitionProvider {
    provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Thenable<Definition> {
        return null
    }
}

export class Ui5FragmentDefinitionProvider implements DefinitionProvider {
    provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Thenable<Definition> {
        let line = window.activeTextEditor.document.lineAt(window.activeTextEditor.selection.active);
        let tag = line.text.match(/(\w+)Name="(.*?)"/);

        if(!tag)
            return tryOpenEventHandler(document, position, token);

        let tName = tag[2].split(".").pop();
        switch (tag[1]) {
            case "view":
                return file.File.find(new RegExp(tName+"\\.view\\.(xml|json)$")).then((files) => {
                    return new Location(Uri.parse("file:///"+files[0]), new Position(0,0));
                });
            case "fragment":
                return file.File.find(new RegExp(tName+"\\.fragment\\.(xml|json)$")).then((files) => {
                    return new Location(Uri.parse("file:///"+files[0]), new Position(0,0));
                });
            default:
                break;
        }
    }
}

export class Ui5ControllerDefinitionProvider implements DefinitionProvider {
    provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Thenable<Definition> {
        return null;
        // let line = window.activeTextEditor.document.lineAt(window.activeTextEditor.selection.active);
        // let tag = line.text.match(/(\w+)Name="(.*?)"/);

        // if(!tag)
        //     return tryOpenEventHandler(document, position, token);

        // let tName = tag[2].split(".").pop();
        // switch (tag[1]) {
        //     case "controller":
        //         return file.File.find(new RegExp(tName+"\\.controller\\.(js|ts)$")).then((files) => {
        //             // Check typescript (dirty)
        //             let f = files.length>1 ? files[1] : files[0];
        //             new Location(Uri.parse("file:///"+f), new Position(0,0));
        //         });
        //     case "view":
        //         return file.File.find(new RegExp(tName+"\\.view\\.(xml|json)$")).then((files) => {
        //             return new Location(Uri.parse("file:///"+files[0]), new Position(0,0));
        //         });
        //     case "fragment":
        //         return file.File.find(new RegExp(tName+"\\.fragment\\.(xml|json)$")).then((files) => {
        //             return new Location(Uri.parse("file:///"+files[0]), new Position(0,0));
        //         });
        //     default:
        //         let eventhandlertag = window.activeTextEditor.selection.active;
        //         break;
        // }
    }
}

function tryOpenEventHandler(document: TextDocument, position: Position, token: CancellationToken): Thenable<Definition> {
    let rightpart = document.lineAt(position.line).text.substr(position.character).match(/(\w*?)"/)[1];
    if(!rightpart)
        return null;

    let leftpart = document.lineAt(position.line).text.substr(0, position.character);
    let leftquotepos = leftpart.match(/.*"/)[0].length;
    if(!leftquotepos)
        return;
    leftpart = leftpart.substr(leftquotepos);
    let name = leftpart+rightpart;

    let text = window.activeTextEditor.document.getText();
    let cnameri = text.match(/controllerName="([\w\.]+)"/);

    if(!cnameri) {
        return null;
    }

    let cname = cnameri[1].split(".").pop();

    return file.File.find(new RegExp(cname+"\\.controller\\.(js|ts)$")).then((files) => {
                let f = files.length>1 ? files[1] : files[0];
                let uri = Uri.parse("file:///"+f);
                return workspace.openTextDocument(uri).then((controllerdoc) => {
                    let ccontent = controllerdoc.getText();

                    let match = new RegExp(/^(\s*?)/.source+name+/\s*?\(.*?\)/.source, "gm").exec(ccontent);
                    let lineNumber = document.positionAt(match.index + match[1].length).line;
                    let range = controllerdoc.lineAt(lineNumber).range;
                    return new Location(uri, range);
                });
            });
}

export class I18nDfinitionProvider implements DefinitionProvider {
    public provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Definition | Thenable<Definition> {
        let i18nlabelregex = new RegExp("\"\s*?{\s*?" + workspace.getConfiguration("ui5ts").get("lang.i18n.modelname") + "\s*?>\s*?(.*?)\s*?}\s*?\"", "g").exec(document.lineAt(position).text);
        if(i18nlabelregex) {
            let label = Storage.i18n.labels[i18nlabelregex[1]];
            return <Location>{
                range: new Range(label.line, 0, label.line, 1),
                uri: Storage.i18n.modelfile
            }
        }
    }
}