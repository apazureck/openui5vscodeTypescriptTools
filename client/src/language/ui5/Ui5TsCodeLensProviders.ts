import * as fs from "fs";
import * as ts from "typescript";
import { CancellationToken, CodeLens, CodeLensProvider, Location, Range, TextDocument, workspace } from "vscode";
import { ui5tsglobal } from "../../extension";
import { findNodesBySyntaxKind, getViewsForController, IFoundNode } from "../searchFunctions";

export class Ui5EventHandlerCodeLensProvider implements CodeLensProvider {
    public async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        const matches: CodeLens[] = [];
        const methods = findNodesBySyntaxKind<ts.MethodDeclaration>(document, ts.SyntaxKind.MethodDeclaration);

        const views = await getViewsForController(ui5tsglobal.core.GetModuleNameFromFilePath(document.uri.fsPath));

        const contents: TextDocument[] = [];
        for (const view of views) {
            contents.push(await workspace.openTextDocument(view));
        }

        for (const method of methods) {
            const locations: Location[] = [];
            for (const viewdoc of contents) {
                console.log("Searching for method " + method.node.name.getText() + " in " + viewdoc.fileName);
                let match: RegExpMatchArray;
                const eventHandlerRegex = new RegExp("\\b\\w+\\b=([\"'])" + method.node.name.getText() + "\\1", "gm");
                const text = viewdoc.getText();

                while (match = eventHandlerRegex.exec(text)) {
                    locations.push(new Location(viewdoc.uri, new Range(viewdoc.positionAt(match.index), viewdoc.positionAt(match.index + match[0].length))));
                }
            }
            if (locations.length > 0) {
                const lens = new CodeLens(method.range);
                lens.command = {
                    arguments: [document.uri, lens.range.start, locations],
                    command: locations.length ? "editor.action.showReferences" : "",
                    title: locations.length === 1 ? "1 callback" : locations.length + " callbacks",
                };
                matches.push(lens);
            }
        }
        return matches;
    }
}
