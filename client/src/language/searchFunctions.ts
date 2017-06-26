import { Uri, workspace } from "vscode";
import { ui5tsglobal } from "../extension";

export const viewFileEx = ".view.{xml,json}";
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