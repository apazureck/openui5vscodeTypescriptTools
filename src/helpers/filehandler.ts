import * as vscode from 'vscode';

export class FileHandler {
    private _textdoc: vscode.TextDocument;
    /** Gets the underlying document */
    public get textdoc(): vscode.TextDocument {
        return this._textdoc;
    }

    /** Creates a new file handler for the given document. */
    constructor(textdoc: vscode.TextDocument) {
        this._textdoc = textdoc;
    }

    /** Appends text to the given document in the constructor and saves the document asynchronously.
     * @param text: text to append
     */
    public async appendText(input: string|vscode.Uri): Promise<void> {
        let lineoffset: number;
        try {
            lineoffset = this.textdoc.lineAt(this.textdoc.lineCount).text.length;
        } catch (error) {
            lineoffset = 0;
        }
        let startpos = new vscode.Position(this.textdoc.lineCount, lineoffset);
        let edit = new vscode.WorkspaceEdit();
        if(typeof input === "string") {
            edit.insert(this._textdoc.uri, startpos, input as string);
        } else {
            let text = (await vscode.workspace.openTextDocument(input)).getText();
            edit.insert(this._textdoc.uri, startpos, text);
        }
        await vscode.workspace.applyEdit(edit)
        await this._textdoc.save();
    }
}