import * as ts from "typescript";
import * as vscode from "vscode";
import { Range, TextDocument, TextEdit, workspace, WorkspaceEdit } from "vscode";
import { ui5tsglobal } from "../../extension";
import { findNodesBySyntaxKind, getViewsForController } from "../searchFunctions";

export class CallbackRenameProvider implements vscode.RenameProvider {
    public async provideRenameEdits(
        document: vscode.TextDocument, position: vscode.Position,
        newName: string, token: vscode.CancellationToken):
        Promise<vscode.WorkspaceEdit> {

        // Check if file is a controller
        if (!document.fileName.match(/\.controller\.ts$/)) {
            throw new Error("File is not a controller");
        }

        // Get all methods on this controller / class
        const methods = findNodesBySyntaxKind<ts.MethodDeclaration>(document, ts.SyntaxKind.MethodDeclaration);

        // Find the node that contains the range
        const foundnode = methods.find((val) => val.range.contains(position));

        // Cancel if not found
        if (!foundnode)
            throw new Error("No method with given name found");

        // Get all views using this controller
        const views = await getViewsForController(ui5tsglobal.core.GetModuleNameFromFilePath(document.uri.fsPath));

        const contents: TextDocument[] = [];
        for (const view of views) {
            contents.push(await workspace.openTextDocument(view));
        }

        const wedit = new WorkspaceEdit();

        for (const viewdoc of contents) {
            console.log("Searching for methods to replace " + foundnode.node.name.getText() + " in " + viewdoc.fileName);
            let match: RegExpMatchArray;
            // 1: text before quotes
            // 2: starting quote
            // 3: ending quote
            const eventHandlerRegex = new RegExp("(\\b\\w+\\b=([\"']))" + foundnode.node.name.getText() + "(\\2)", "gm");
            const text = viewdoc.getText();

            while (match = eventHandlerRegex.exec(text)) {
                console.log("Found eventhandler and adding to replace");
                wedit.replace(viewdoc.uri, new Range(viewdoc.positionAt(match.index + match[1].length), viewdoc.positionAt(match.index + match[0].length - match[3].length)), newName);
            }
        }

        return wedit;
    }
}
