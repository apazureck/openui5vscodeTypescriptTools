import * as ncp from 'ncp';
import * as rrd from 'recursive-readdir';
import * as enumerable from 'linq-es2015';
import * as fs from 'fs';
import { TextDocument } from 'vscode-languageserver';
import { workspaceRoot } from './server';

export class FileHandler {

    // /** Appends text to the given document in the constructor and saves the document asynchronously.
    //  * @param input: uri to the input source or string with content of the source document
    //  * @param output: uri to the document which should be written to (or document itself)
    //  * @param replacements: optional array of keys to replace in the document
    //  * @returns {Promise<void>}
    //  */
    // public static async appendText(input: TextDocument|vscode.Uri, output: vscode.TextDocument|vscode.Uri,  replacements?: KeyValuePair[]): Promise<void> {
    //     let lineoffset: number;
    //     let text: string;
    //     let textdoc: vscode.TextDocument;

    //     if(typeof input === "vscode.Uri")
    //         textdoc = await FileHandler.openDocument(output as vscode.Uri);
    //     else
    //         textdoc = output as vscode.TextDocument;

    //     try {
    //         lineoffset = textdoc.lineAt(textdoc.lineCount).text.length;
    //     } catch (error) {
    //         lineoffset = 0;
    //     }
    //     let startpos = new vscode.Position(textdoc.lineCount, lineoffset);
    //     let edit = new vscode.WorkspaceEdit();

    //     if(typeof input === "string")
    //         text = await textdoc.getText();
    //     else
    //         text = (await vscode.workspace.openTextDocument(input as vscode.Uri)).getText();

    //     try {
    //         if(replacements)
    //             text = FileHandler.replaceText(text, replacements);            
    //     } catch (error) {
            
    //     }
            
    //     edit.insert(textdoc.uri, startpos, text as string);
    //     await vscode.workspace.applyEdit(edit)
    //     await textdoc.save();
    // }

    // public static replaceText(text: string, replacements: KeyValuePair[]): string {
    //     for(let entry of replacements)
    //         text = text.replace(entry.key, entry.value);
    //     return text;
    // }

    // /** open document via string or uri
    //  * @param uri: file uri or path to open
    //  * @return returns a new text document 
    //  */
    // public static async openDocument(uri: Uri|string): Promise<TextDocument> {
    //     if(typeof uri === "string")
    //         uri = vscode.Uri.parse(uri);
    //     return await vscode.workspace.openTextDocument(uri as vscode.Uri);
    // }
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

    // public async replaceTokens(tokens: KeyValuePair[]) {
    //     rrd(workspaceRoot, (error, files) => {
    //         files.forEach(async (file) => {
    //             fs.readFile(file, (err, data) => {
    //                 if(err)
    //                     return;
                        
    //                 let result = FileHandler.replaceText(data.toString(), tokens);

    //                 fs.writeFile(file, result, (err) => { if(err) log.printError("Error writing back to file: '" + err.message + "'")});
    //             })
    //         });
    //     });
    // }
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
        startdir = startdir ? startdir : workspaceRoot;
        let matcher = typeof pattern === "string" ? new RegExp((pattern as string)) : pattern as RegExp; 
        return new Promise<string[]>((resolve, reject) => {
            rrd(startdir, (err, files) => {
                if(err) {
                    reject(err);
                    return;
                }
                let result = enumerable.asEnumerable<string>(files).Where(x => x.match(matcher)!=null);
                if(result)
                    resolve(result.ToArray());
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
    static findSync(pattern: RegExp|string, startdir?:string): string[] {
        startdir = startdir ? startdir : workspaceRoot;
        let regex = typeof pattern === "string" ? new RegExp(pattern as string) : pattern as RegExp;
        return findFilesSync(regex, startdir);
    }

    static getFileName(path: string): string {
        return path.split("\\").pop();
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