import { TextEditorSelectionChangeEvent, TextEditorSelectionChangeKind, Range, Position, workspace } from 'vscode';

export function closeEmptyTag(e: TextEditorSelectionChangeEvent) {

    let enabled = workspace. getConfiguration("ui5ts").get("lang.xml.autoCloseEmptyElement", true);
    if(!enabled) {
        return;
    }
    if (e.textEditor.document.languageId !== "xml")
        return;
    if (e.kind !== TextEditorSelectionChangeKind.Keyboard)
        return;

    if (!e.textEditor.selection.isEmpty)
        return;

    if (e.textEditor.document.getText(new Range(e.textEditor.selection.start, new Position(e.textEditor.selection.start.line, e.textEditor.selection.start.character - 1))) !== "/")
        return;

    let start = e.textEditor.document.offsetAt(e.textEditor.selection.start);
    let text = e.textEditor.document.getText();
    // Get endtag and tag is empty
    let endtagsearch = text.substring(start, text.length).match(/^>\s*<\/(\w*?:?\w*?)>/);
    let quote: string = undefined;
    let starttag: string = undefined;
    if (endtagsearch && getStartTag(text.substr(0, start), endtagsearch[1])) {
        e.textEditor.edit((editBuilder => {
            editBuilder.delete(new Range(new Position(e.textEditor.selection.start.line, e.textEditor.selection.start.character + 1), e.textEditor.document.positionAt(start + endtagsearch[0].length)));
        }))
    }
}

function getStartTag(text: string, tagname: string): string {
    let quotechar: string = undefined;
    for (let i = text.length - 1; i >= 0; i--) {
        switch (text[i]) {
            case quotechar:
                quotechar = undefined;
                continue;
            case "'": case '"':
                if (!quotechar)
                    quotechar = text[i];
                continue;
            case "<":
                if (!quotechar)
                    break;
                break;
            default:
                continue;
        }
        let t = text.substring(i);
        if (("<"+t).startsWith(tagname))
            return t;
        else
            return undefined;
    }
    return undefined;
}