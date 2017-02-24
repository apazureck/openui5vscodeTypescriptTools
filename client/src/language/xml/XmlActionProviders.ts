import { CodeActionProvider, TextDocument, Range, CodeActionContext, CancellationToken, Command, Diagnostic, workspace, TextEdit, window, TextEditorEdit } from 'vscode'
import { Storage, I18nDiagnostic } from './XmlDiagnostics'

export class I18nCodeActionprovider implements CodeActionProvider {
    provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): Command[] | Thenable<Command[]> {
        let commands: Command[] = [];
        for(let diag of context.diagnostics.filter(x=>x.code === "i18nLabelMissing") as I18nDiagnostic[]) {
            commands.push({
                arguments: [diag.label, () => {
                    // Make this to reinitialize diagnostics
                    window.activeTextEditor.edit((edit: TextEditorEdit) => {
                        let rangetext = document.getText(range);
                        edit.delete(range);
                        edit.insert(range.start, rangetext);
                    });
                }],
                command: "ui5ts.CreateNewI18nLabel",
                title: "Create i18n Label..."
            });
            
        }
        return commands;
    }
}