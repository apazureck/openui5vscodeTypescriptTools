import * as path from "path";
import * as ts from "typescript";
import { Range, TextDocument, Uri, workspace } from "vscode";
import { ui5tsglobal } from "../extension";

export const viewFileEx = ".view.{xml,json}";
export const namespaceformat = /^(\w+\.?)+\w+$/;
export const controllerFileEx = ".controller.ts";

export interface IFoundNode<T extends ts.Node> {
    node: T;
    range: Range;
}
export async function getViewsForController(cname: string): Promise<Uri[]> {
    const views = await workspace.findFiles(ui5tsglobal.core.relativeRootPath + "/**/*" + viewFileEx, undefined);
    const ret: Uri[] = [];
    for (const view of views) {
        const doc = (await workspace.openTextDocument(view)).getText();
        if (doc.match(new RegExp("controllerName=[\"']" + cname + "[\"']")))
            ret.push(view);
    }
    return ret;
}

export async function getControllersUsedByViews(viewContents: string[]): Promise<{
    controllerName: string,
    fileUri: Uri,
}[]> {

    const controllerDictionary: {
        [key: string]: Uri;
    } = {};

    for (const text of viewContents) {
        const tag = text.match(/controllerName=["']([\w\.]+)["']/);

        if (!tag) {
            continue;
        }
        const uris = await workspace.findFiles(ui5tsglobal.core.GetRelativePath(tag[1]) + controllerFileEx, undefined);
        if (uris && uris.length > 0)
            controllerDictionary[tag[1]] = uris[0];
    }

    const retlist = [];
    for (const key in controllerDictionary) {
        if (key) {
            retlist.push({
                controllerName: key,
                fileUri: controllerDictionary[key],
            });
        }
    }

    return retlist;
}

export async function getViewsUsingFragment(fragmentName: string): Promise<string[]> {
    const views = await workspace.findFiles(ui5tsglobal.core.relativeRootPath + "/**/*" + viewFileEx, undefined);
    const ret: string[] = [];
    for (const view of views) {
        const doc = (await workspace.openTextDocument(view)).getText();
        if (doc.match(new RegExp("fragmentName=([\"'])" + fragmentName + "\\1")))
            ret.push(doc);
    }
    return ret;
}

export async function getController(document: TextDocument): Promise<{
    controllerName: string,
    fileUri: Uri,
}[]> {
    const views = path.basename(document.uri.path).toLowerCase().match(/\.view\.(xml|json)$/) ? [document.getText()] : await getViewsUsingFragment(ui5tsglobal.core.GetModuleNameFromFilePath(document.uri.fsPath));
    // TODO: Find view with matching controller
    // check if it is a view

    return await getControllersUsedByViews(views);
}

function traverseNodes<T extends ts.Node>(node: ts.Node, foundNodes: IFoundNode<T>[], document: TextDocument, searchKind: ts.SyntaxKind): void {
    try {
        console.log(ts.SyntaxKind[node.kind] + " " + ((node as any).name ? (node as any).name.getText() : ""));
        if (node.kind === searchKind) {
                foundNodes.push({ node: node as T, range: new Range(document.positionAt(node.getStart()), document.positionAt(node.getEnd())) });
        }
        node.forEachChild((n) => {
            traverseNodes(n, foundNodes, document, searchKind);
        });
    } catch (error) {
        console.error(error.toString());
    }
}

/**
 * Recursively searches the Abstract Syntax Tree (AST) for the given syntax element and adds all found nodes to the foundNodes array
 * 
 * @export
 * @template T the type of the found syntax elements
 * @param {IFoundNode<T>[]} foundNodes found nodes array with node and range in the document
 * @param {TextDocument} document the text document to search the syntax elements
 * @param {ts.SyntaxKind} searchKind the type of the syntax element to search
 */
export function findNodesBySyntaxKind<T extends ts.Node>(document: TextDocument, searchKind: ts.SyntaxKind): IFoundNode<T>[] {
    const foundNodes: IFoundNode<T>[] = [];
    const sourcefile = ts.createSourceFile(document.fileName, document.getText(), ts.ScriptTarget.ES5, true);
    traverseNodes<T>(sourcefile, foundNodes, document, searchKind);
    return foundNodes;
}
