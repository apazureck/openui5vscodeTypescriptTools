import * as vscode from 'vscode';
import * as ncp from 'ncp';
import * as rrd from 'recursive-readdir';
import * as fs from 'fs';
import * as log from './logging';
import * as path from 'path'

export class FileHandler {

    public static replaceText(text: string, replacements: KeyValuePair[]): string {
        for(let entry of replacements)
            text = text.replace(entry.key, entry.value);
        return text;
    }

    /** open document via string or uri
     * @param uri: file uri or path to open
     * @return returns a new text document 
     */
    public static async openDocument(uri: vscode.Uri|string): Promise<vscode.TextDocument> {
        if(typeof uri === "string")
            uri = vscode.Uri.parse(uri);
        return await vscode.workspace.openTextDocument(uri as vscode.Uri);
    }
}

export interface KeyValuePair {
    key: string;
    value: string;
}

export class ReplaceInFiles {
    private _dir: string;
    constructor(dir: string) {
        this._dir = dir;
    }

    public async replaceTokens(tokens: KeyValuePair[]) {
        rrd(vscode.workspace.rootPath, (error, files) => {
            files.forEach(async (file) => {
                fs.readFile(file, (err, data) => {
                    if(err)
                        return log.printError("Error reading file: '" + err.message + "'");
                        
                    let result = FileHandler.replaceText(data.toString(), tokens);

                    fs.writeFile(file, result, (err) => { if(err) log.printError("Error writing back to file: '" + err.message + "'")});
                })
            });
        });
    }
}

/**
 * File interface
 * 
 * @export
 * @class File
 */
export class File {
    
    /**
     * async file search method.
     * 
     * @static
     * @param {(string|RegExp)} pattern to search for.
     * @param {string} [startdir] to start search at. default: workspace root path
     * @returns {Promise<string>}
     * 
     * @memberOf File
     */
    static async find(pattern: RegExp|string, startdir?: string): Promise<string[]> {
        startdir = startdir ? startdir : vscode.workspace.rootPath;
        let matcher = typeof pattern === "string" ? new RegExp((pattern as string)) : pattern as RegExp; 
        return new Promise<string[]>((resolve, reject) => {
            rrd(startdir, (err, files) => {
                if(err) {
                    reject(err);
                    return;
                }
                let result = files.filter(x => x.match(matcher)!=null);
                if(result)
                    resolve(result);
                else
                    reject();
            });
        });
    }
     /**
     *  
     * @static
     * @param {(RegExp|string)} pattern Filepattern to search for
     * @param {string} [startdir] dir to start (if none is given workspace is taken)
     * @returns {string[]} files
     * 
     * @memberOf File
     */
    static findSync(pattern: RegExp|string, startdir?:string, ignore?: string[]): string[] {
        startdir = startdir ? startdir : vscode.workspace.rootPath;
        let regex = typeof pattern === "string" ? new RegExp(pattern as string) : pattern as RegExp;
        return this.findFilesSync(regex, startdir, ignore);
    }

    private static findFilesSync(pattern: RegExp, startdir: string, ignore: string[]) {
        let results: string[] = [];
        let list = fs.readdirSync(startdir)
        for(let file of list) {
            file = startdir + '\\' + file;
            var stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                let base = path.basename(file);
                if(!ignore.find((value, index, obj) => {
                    let fpaths = value.split('/');
                    if(fpaths[0] == base) {
                        if(fpaths.length>1)
                            this.findFilesSync(pattern, path.join(startdir, fpaths[0]),  [ fpaths.splice(0, 1).join("/") ]);
                        else
                            return true;
                    }
                    else
                        return false;
                }))
                    results = results.concat(this.findFilesSync(pattern, file, ignore));
            }
            else if(file.match(pattern)) 
                results.push(file);
        }
        return results;
    }

    static getFileName(path: string): string {
        return path.split("\\").pop();
    }
}
