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
        if (!tag)
            return;
        let files = await workspace.findFiles(ui5tsglobal.core.GetRelativePath(tag[1]) + viewFileEx, undefined);
        return files.map(uri => new Location(uri, new Position(0, 0)));
    }
}

export class ViewFragmentDefinitionProvider implements DefinitionProvider {
    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        let line = document.lineAt(position);
        let tag = line.text.match(/fragmentName\s*[:=]\s*["']([\w.]+?)["']/);
        if (!tag)
            return;
        let files = await workspace.findFiles(ui5tsglobal.core.GetRelativePath(tag[1]) + fragmentFileEx, undefined);
        return files.map(uri => new Location(uri, new Position(0, 0)));
    }
}

export class ViewControllerDefinitionProvider implements DefinitionProvider {
    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        const line = document.lineAt(position).text;
        const files = await getControllerFiles(line);
        return files.map(uri => new Location(uri, new Position(0, 0)));
    }
}

async function getControllerFiles(text: string): Promise<Uri[]> {
    const tag = text.match(/\bcontrollerName\s*[:=]\s*(["'])([\w\.]+?)\1/);
    if (!tag)
        return;
    return await workspace.findFiles(ui5tsglobal.core.GetRelativePath(tag[2]) + controllerFileEx, undefined);
}

export class I18nDfinitionProvider implements DefinitionProvider {
    public provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Definition | Thenable<Definition> {
        const i18nlabelregex = new RegExp("\\b\\w+=(['\"])\\s*?{\\s*?" + ui5tsglobal.config["lang.i18n.modelname"] + "\\s*?>\\s*?(.*?)\\s*?}\\s*?\\1").exec(document.lineAt(position).text);
        if (i18nlabelregex) {
            if (position.character < i18nlabelregex.index || position.character > i18nlabelregex.index + i18nlabelregex[0].length) {
                return;
            }
            const label = Storage.i18n.Labels[i18nlabelregex[1]];
            return {
                range: new Range(label.line, 0, label.line, 1),
                uri: Storage.i18n.modelfile,
            } as Location;
        }
    }
}

export class EventCallbackDefinitionProvider implements DefinitionProvider {
    async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        const txt = document.lineAt(position).text;
        // 1 = attribute name
        // 2 = quotetype " or '
        // 3 = attribute value
        const i18nlabelregex = /\b(\w+)=(['"])([\s\S]*?)\2/gm;
        let match: RegExpMatchArray;
        while (match = i18nlabelregex.exec(txt)) {
            if (position.character > match.index && position.character < match.index + match[0].length) {
                break;
            }
        }
        if (!match)
            return;
        let controllerFileUris;
        try {
            controllerFileUris = await getControllerFiles(document.getText());
        } catch (error) {
            let i = 0;
        }

        if (!controllerFileUris)
            return;

        const ret: Location[] = [];

        for (const controllerFileUri of controllerFileUris) {
            const controllerfile = await workspace.openTextDocument(controllerFileUri);
            const controllertext = controllerfile.getText();

            const eventmethodregex = /^\s*?(?:public)?\s+?(\w+?)\s?\([\s\S]*?\)[\S\s]*?{/gm;
            let event: RegExpMatchArray;

            while (event = eventmethodregex.exec(controllertext)) {
                if (event[1] === match[3])
                    ret.push({
                        range: controllerfile.lineAt(controllerfile.positionAt(event.index + event[1].length)).range,
                        uri: controllerfile.uri,
                    });
            }
        }

        return ret;
    }

}