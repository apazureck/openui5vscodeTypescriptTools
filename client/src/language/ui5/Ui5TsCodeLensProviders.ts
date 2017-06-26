import * as fs from "fs";
import * as ts from "typescript";
import { CancellationToken, CodeLens, CodeLensProvider, Range, TextDocument, workspace, Location } from "vscode";
import { ui5tsglobal } from "../../extension";
import { getViewsForController } from "../searchFunctions";

interface IFoundMethod { name: string; range: Range; };

export class Ui5EventHandlerCodeLensProvider implements CodeLensProvider {
    public async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        const sourcefile = ts.createSourceFile(document.fileName, document.getText(), ts.ScriptTarget.ES5, true);
        const methods: IFoundMethod[] = [];
        const matches: CodeLens[] = [];
        traverseNodes(sourcefile, methods, document);

        const views = await getViewsForController(ui5tsglobal.core.GetModuleNameFromFilePath(document.uri.fsPath));

        const contents: TextDocument[] = [];
        for (const view of views) {
            contents.push(await workspace.openTextDocument(view));
        }

        for (const method of methods) {
            const locations: Location[] = [];
            for (const viewdoc of contents) {
                console.log("Searching for method " + method.name + " in " + viewdoc.fileName);
                let match: RegExpMatchArray;
                const eventHandlerRegex = new RegExp("\\b\\w+\\b=([\"'])" + method.name + "\\1", "gm");
                const text = viewdoc.getText();

                while (match = eventHandlerRegex.exec(text)) {
                    locations.push(new Location(viewdoc.uri, new Range(viewdoc.positionAt(match.index), viewdoc.positionAt(match.index + match[0].length))));
                }
            }
            const lens = new CodeLens(method.range);
            lens.command = {
                arguments: [document.uri, lens.range.start, locations],
                command: locations.length ? "editor.action.showReferences" : "",
                title: locations.length === 1 ? "1 callback" : locations.length + " callbacks",
            };
            matches.push(lens);
        }
        return matches;
    }
}

export function traverseNodes(node: ts.Node, methods: IFoundMethod[], document: TextDocument): void {
    try {
        console.log(ts.SyntaxKind[node.kind] + " " + ((node as any).name ? (node as any).name.getText() : ""));
        switch (node.kind) {
            case ts.SyntaxKind.MethodDeclaration:
                const method = node as ts.MethodDeclaration;
                methods.push({ name: method.name.getText(), range: new Range(document.positionAt(method.getStart()), document.positionAt(method.getEnd())) });
                console.log(ts.SyntaxKind[node.kind] + ": " + method.name.getText());
                break;
            default:
                break;
        }
        node.forEachChild((n) => {
            traverseNodes(n, methods, document);
        });
    } catch (error) {
        console.error(error.toString());
    }
}