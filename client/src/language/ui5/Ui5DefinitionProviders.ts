import * as fs from 'fs'
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
import { channel, ui5tsglobal } from '../../extension'
import { Storage } from '../xml/XmlDiagnostics'

const controllerFileEx = ".controller.{js,ts}";
const fragmentFileEx = ".fragment.{xml,json}";
const viewFileEx = ".view.{xml,json}"

export class Ui5ViewDefinitionProvider implements DefinitionProvider {
    async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        let line = document.lineAt(position);
        let map = ui5tsglobal.core.namespacemappings;
        let tag = line.text.match(/viewName\s*[:=]\s*["']([\w.]+?)["']/);
        if(!tag)
            return;
        let files = await workspace.findFiles(ui5tsglobal.core.CreateRelativePath(tag[1]) + viewFileEx, undefined);
        return files.map(uri => new Location(uri, new Position(0, 0)));
    }
}

export class ViewFragmentDefinitionProvider implements DefinitionProvider {
    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        let line = document.lineAt(position);
        let tag = line.text.match(/fragmentName\s*[:=]\s*["']([\w.]+?)["']/);
        if(!tag)
            return;
        let files = await workspace.findFiles(ui5tsglobal.core.CreateRelativePath(tag[1]) + fragmentFileEx, undefined);
        return files.map(uri => new Location(uri, new Position(0, 0)));
    }
}

export class ViewControllerDefinitionProvider implements DefinitionProvider {
    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        let line = document.lineAt(position);
        let tag = line.text.match(/controllerName\s*[:=]\s*["']([\w.]+?)["']/);
        if(!tag)
            return;
        let files = await workspace.findFiles(ui5tsglobal.core.CreateRelativePath(tag[1]) + controllerFileEx, undefined);
        return files.map(uri => new Location(uri, new Position(0, 0)));
    }
}

export class I18nDfinitionProvider implements DefinitionProvider {
    public provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Definition | Thenable<Definition> {
        let i18nlabelregex = new RegExp("\"\s*?{\s*?" + workspace.getConfiguration("ui5ts").get("lang.i18n.modelname") + "\s*?>\s*?(.*?)\s*?}\s*?\"", "g").exec(document.lineAt(position).text);
        if (i18nlabelregex) {
            let label = Storage.i18n.labels[i18nlabelregex[1]];
            return <Location>{
                range: new Range(label.line, 0, label.line, 1),
                uri: Storage.i18n.modelfile
            }
        }
    }
}