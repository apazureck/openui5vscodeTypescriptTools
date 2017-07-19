import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import {
    CancellationToken,
    CompletionItem,
    CompletionList,
    Definition,
    DefinitionProvider,
    Location,
    Position,
    Range,
    TextDocument,
    Uri,
    window,
    workspace,
} from "vscode";
import * as commands from "../../commands";
import { channel, ui5tsglobal } from "../../extension";
import * as file from "../../helpers/filehandler";
import { findNodesBySyntaxKind, getController, getControllersUsedByViews } from "../searchFunctions";
import { Storage } from "../xml/XmlDiagnostics";

const controllerFileEx = ".controller.ts";
const fragmentFileEx = ".fragment.{xml,json}";
const viewFileEx = ".view.{xml,json}";

export class Ui5ViewDefinitionProvider implements DefinitionProvider {
    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        const line = document.lineAt(position);
        const map = ui5tsglobal.core.namespacemappings;
        const tag = line.text.match(/viewName\s*[:=]\s*["']([\w.]+?)["']/);
        if (!tag)
            return;
        const files = await workspace.findFiles(ui5tsglobal.core.GetRelativePath(tag[1]) + viewFileEx, undefined);
        return files.map(uri => new Location(uri, new Position(0, 0)));
    }
}

export class ViewFragmentDefinitionProvider implements DefinitionProvider {
    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        const line = document.lineAt(position);
        const tag = line.text.match(/fragmentName\s*[:=]\s*["']([\w.]+?)["']/);
        if (!tag)
            return;
        const files = await workspace.findFiles(ui5tsglobal.core.GetRelativePath(tag[1]) + fragmentFileEx, undefined);
        return files.map(uri => new Location(uri, new Position(0, 0)));
    }
}

export class ViewControllerDefinitionProvider implements DefinitionProvider {
    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        const line = document.lineAt(position).text;
        const files = await getControllersUsedByViews([line]);
        return files.map(x => new Location(x.fileUri, new Position(0, 0)));
    }
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
            };
        }
    }
}

export class EventCallbackDefinitionProvider implements DefinitionProvider {
    public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        const txt = document.lineAt(position).text;
        // 1 = attribute name
        // 2 = quotetype " or '
        // 3 = attribute value
        const attributeRegex = /\b(\w+)=(['"])([\s\S]*?)\2/gm;
        let match: RegExpMatchArray;
        while (match = attributeRegex.exec(txt)) {
            if (position.character > match.index && position.character < match.index + match[0].length) {
                break;
            }
        }
        if (!match)
            return;

        try {
            const controllerFileUris = await getController(document);

            if (!controllerFileUris)
                return;

            const ret: Location[] = [];

            for (const controllerFileUri of controllerFileUris) {
                const controllerfile = await workspace.openTextDocument(controllerFileUri.fileUri);
                const methods = findNodesBySyntaxKind<ts.MethodDeclaration>(document, ts.SyntaxKind.MethodDeclaration);

                for (const method of methods) {
                    if (method.node.name.getText() === match[3]) {
                        ret.push({
                            range: method.range,
                            uri: controllerfile.uri,
                        });
                    }
                }
            }

            return ret;
        } catch (error) {
            const i = 0;
        }
    }

}
