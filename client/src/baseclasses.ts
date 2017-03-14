import * as vscode from 'vscode';
import { Range } from 'vscode';
import * as file from './helpers/filehandler';
import * as path from 'path';
import { ui5tsglobal } from './extension';

export interface Ui5View {
	type: ViewType;
	fullpath: string;
	name: string;
}

export enum ViewType {
	XML, JSON
}

export class Ui5Base {
    protected getRange(docText: string, searchPattern: RegExp, subgroup?: number): Range[] {
        const lineRegex = /.*(?:\n|\r\n)/gm;
        let l;
        let ret: Range[] = [];
        let linectr = 0;
        while((l = lineRegex.exec(docText)) !== null) {
        linectr = linectr + 1;
            if(l.index === lineRegex.lastIndex)
                lineRegex.lastIndex++;

            let match = searchPattern.exec(l);
            
            if(!match)
                continue;
            let startchar = match.index;
            // calculate start of the subgroup
            if(subgroup)
                startchar += match[0].indexOf(match[subgroup]);

            ret.push(new Range(linectr-1, startchar, linectr -1, startchar + match[subgroup?subgroup:0].length));
        }
        return ret;
    }

    protected getViews(): Ui5View[] {
        // TODO: Make Setting for to ignore folders
        let viewpaths = file.File.findSync(/(.*)\.view\.(json|xml|JSON|XML)/, vscode.workspace.rootPath, ['resources', '.vscode', 'node_modules', 'out', 'typings', '.bin', '.idea']);
        let ret: Ui5View[] = []
        for(let viewpath of viewpaths) {
            ret.push({
                fullpath: viewpath,
                name: this.getViewName(viewpath, ui5tsglobal.core.namespacemappings),
                type: this.getViewType(viewpath)
            });
        }
        return ret;
    }

    protected getViewName(viewpath: string, namespacemappings: { [id: string] : string }): string {
        let relativepath = path.relative(vscode.workspace.rootPath, viewpath);
        let projectnamespace: string;
        for(let key in namespacemappings)
            if(namespacemappings[key] == "./")
                projectnamespace = key;
        
        relativepath = relativepath.replace(/\.view\.(xml|json|XML|JSON)/, "");
        return projectnamespace + "." + relativepath.split(path.sep).join(".");
    }

    getViewType(viewPath: string): ViewType {
        if(viewPath.toLowerCase().endsWith("xml"))
            return ViewType.XML;
        else
            return ViewType.JSON;
    }
}

export class Ui5ManifestBase extends Ui5Base {
    protected getTargets(jcontent: Manifest): string[] {
        let targetnames: string[] = []
        for(let key in jcontent["sap.ui5"].routing.targets)
            targetnames.push(key);
        return targetnames;
    }
}