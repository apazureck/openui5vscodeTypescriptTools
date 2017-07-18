
import * as path from "path";
import { TextDocument } from "vscode";
import { Uri, workspace } from "vscode";
import { ui5tsglobal } from "../extension";

export const viewFileEx = ".view.{xml,json}";
export const namespaceformat = /^(\w+\.?)+\w+$/;
export const controllerFileEx = ".controller.ts";
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
