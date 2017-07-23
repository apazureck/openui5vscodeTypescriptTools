import * as path from "path";
import * as ts from "typescript";
import { Range, TextDocument, Uri, workspace } from "vscode";
import { ui5tsglobal } from "../extension";

export const viewFileEx = ".view.{xml,json}";
export const namespaceformat = /^(\w+\.?)+\w+$/;
export const controllerFileEx = ".controller.ts";
export const fragmentFileEx = ".fragment.{xml,json}";

export interface IFoundNode<T extends ts.Node> {
    node: T;
    range: Range;
}

export interface IUi5View {
    type: ViewType;
    fullpath: string;
    name: string;
}

/**
 * Gets all views in the project
 * 
 * @returns {Promise<IUi5View[]>} all views
 */
export async function getViews(): Promise<IUi5View[]> {
    return (await workspace.findFiles(ui5tsglobal.core.relativeRootPath + "/**/*.view.{xml,json}", "")).map((file) => {
        const path = ui5tsglobal.core.GetRelativePath(file.path);
        return {
            fullpath: path,
            name: this.getViewName(file.path, ui5tsglobal.core.namespacemappings),
            type: this.getViewType(file.path),
        };
    });
}

/**
 * Gets views (and their used fragments) which use this controller
 * 
 * @export
 * @param {string} cname full name with namespaces of the controller
 * @param {boolean} [includeFragments=true] put out fragments, too. Default: true
 * @returns {Promise<Uri[]>} all uris to files found which use this controller
 */
export async function getViewsForController(cname: string, includeFragments?: boolean): Promise<Uri[]> {
    includeFragments = includeFragments || true;
    const views = await workspace.findFiles(ui5tsglobal.core.relativeRootPath + "/**/*" + viewFileEx, undefined);
    const ret: Uri[] = [];
    for (const view of views) {
        const doc = (await workspace.openTextDocument(view)).getText();
        if (doc.match(new RegExp("controllerName=([\"'])" + cname + "\\1"))) {
            ret.push(view);
            if (includeFragments) {
                // 1: quotes
                // 2: fragment name (namespace syntax)
                const fragmentsRegex = /fragmentName\s*=\s*("|')(.*?)\1/g;
                let fragment: RegExpMatchArray;
                while (fragment = fragmentsRegex.exec(doc)) {
                    const fragfiles = await workspace.findFiles(ui5tsglobal.core.GetRelativePath(fragment[2]) + fragmentFileEx, undefined);
                    for (const fragfile of fragfiles) {
                        ret.push(fragfile);
                    }
                }
            }
        }
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
        try {
            const tag = text.match(/controllerName=(["'])([\w\.]+)\1/);

            if (!tag) {
                continue;
            }
            const ex = ui5tsglobal.core;
            const cname = ex.GetRelativePath(tag[2]) + controllerFileEx;
            const uris = await workspace.findFiles(cname, undefined);
            if (uris && uris.length > 0)
                controllerDictionary[tag[2]] = uris[0];
        } catch (error) {
            console.error(JSON.stringify(error));
        }
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
