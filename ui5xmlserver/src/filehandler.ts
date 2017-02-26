import * as rrd from 'recursive-readdir';
import * as fs from 'fs';
import { TextDocument } from 'vscode-languageserver';
import { Global } from './server';

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
    static async findAsync(pattern: RegExp|string, startdir?: string): Promise<string[]> {
        startdir = startdir ? startdir : Global.workspaceRoot;
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
    static find(pattern: RegExp|string, startdir?:string): string[] {
        startdir = startdir ? startdir : Global.workspaceRoot;
        let regex = typeof pattern === "string" ? new RegExp(pattern as string) : pattern as RegExp;
        return findFilesSync(regex, startdir);
    }

    static getFileName(path: string): string {
        return path.split("\\").pop();
    }

    static open(path: string, encoding?:string): string {
        encoding = encoding? encoding : "utf-8";
        return fs.readFileSync(path, encoding);
    }
}

function findFilesSync(pattern: RegExp, startdir) {
    let results: string[] = [];
    let list = fs.readdirSync(startdir)
    for(let file of list) {
        file = startdir + '\\' + file;
        var stat = fs.statSync(file);
        if (stat && stat.isDirectory()) 
            results = results.concat(findFilesSync(pattern, file));
        else if(file.match(pattern)) 
            results.push(file);
    }
    return results;
}