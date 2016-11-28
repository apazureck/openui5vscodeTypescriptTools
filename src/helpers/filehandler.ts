import * as vscode from 'vscode';

export class FileHandler {

    /** Appends text to the given document in the constructor and saves the document asynchronously.
     * @param input: uri to the input source or string with content of the source document
     * @param output: uri to the document which should be written to (or document itself)
     * @param replacements: optional array of keys to replace in the document
     * @returns {Promise<void>}
     */
    public static async appendText(input: vscode.TextDocument|vscode.Uri, output: vscode.TextDocument|vscode.Uri,  replacements?: KeyValuePair[]): Promise<void> {
        let lineoffset: number;
        let text: string;
        let textdoc: vscode.TextDocument;

        if(typeof input === "vscode.Uri")
            textdoc = await FileHandler.openDocument(output as vscode.Uri);
        else
            textdoc = output as vscode.TextDocument;

        try {
            lineoffset = textdoc.lineAt(textdoc.lineCount).text.length;
        } catch (error) {
            lineoffset = 0;
        }
        let startpos = new vscode.Position(textdoc.lineCount, lineoffset);
        let edit = new vscode.WorkspaceEdit();

        if(typeof input === "string")
            text = await textdoc.getText();
        else
            text = (await vscode.workspace.openTextDocument(input as vscode.Uri)).getText();

        try {
            if(replacements)
                text = FileHandler.replaceText(text, replacements);            
        } catch (error) {
            
        }
            
        edit.insert(textdoc.uri, startpos, text as string);
        await vscode.workspace.applyEdit(edit)
        await textdoc.save();
    }

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
