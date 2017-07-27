import * as path from "path";
import * as vscode from "vscode";
import { Range, workspace } from "vscode";
import { ui5tsglobal } from "./extension";
import * as file from "./helpers/filehandler";

export enum ViewType {
    XML, JSON = 1,
}

export class Ui5Base {
    public getViewType(viewPath: string): ViewType {
        if (viewPath.toLowerCase().endsWith("xml"))
            return ViewType.XML;
        else
            return ViewType.JSON;
    }

    protected getRange(docText: string, searchPattern: RegExp, subgroup?: number): Range[] {
        const lineRegex = /.*(?:\n|\r\n)/gm;
        let l;
        const ret: Range[] = [];
        let linectr = 0;
        while ((l = lineRegex.exec(docText)) !== null) {
            linectr = linectr + 1;
            if (l.index === lineRegex.lastIndex)
                lineRegex.lastIndex++;

            const match = searchPattern.exec(l);

            if (!match)
                continue;
            let startchar = match.index;
            // calculate start of the subgroup
            if (subgroup)
                startchar += match[0].indexOf(match[subgroup]);

            ret.push(new Range(linectr - 1, startchar, linectr - 1, startchar + match[subgroup ? subgroup : 0].length));
        }
        return ret;
    }

    

    protected getViewName(viewpath: string, namespacemappings: { [id: string]: string }): string {
        return ui5tsglobal.core.GetModuleNameFromFilePath(viewpath);
    }

}

export class Ui5ManifestBase extends Ui5Base {
    protected getTargets(jcontent: Manifest): string[] {
        const targetnames: string[] = [];
        for (const key in jcontent["sap.ui5"].routing.targets)
            targetnames.push(key);
        return targetnames;
    }
}
