
import { CancellationToken, CompletionItem, CompletionItemKind, SymbolKind, CompletionItemProvider, CompletionList, Position, Range, TextDocument, Uri, workspace } from "vscode";

function toCompletionItemKind(kind: SymbolKind): CompletionItemKind {
    
    if (kind == SymbolKind.Variable) {
        return CompletionItemKind.Variable;
    } else if (kind == SymbolKind.Function) {
        return CompletionItemKind.Function;
    } else if (kind == SymbolKind.Class) {
        return CompletionItemKind.Class;
    } else if (kind == SymbolKind.Enum) {
        return CompletionItemKind.Enum;
    } else {
        return CompletionItemKind.Variable;
    }
}

export default class JSCompletionItemProvider  implements CompletionItemProvider {
    
    public async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken) :Promise<CompletionItem[]> {
		console.log(position);
		var word = document.getText(document.getWordRangeAtPosition(position)).split(/\r?\n/)[0];
        var self = this;
        return null;
	}
}