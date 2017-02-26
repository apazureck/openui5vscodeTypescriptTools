import {
	CancellationToken,
	CompletionItem,
	CompletionItemKind,
	CompletionItemProvider,
	CompletionList,
	Position,
	TextDocument,
	workspace
} from 'vscode';
import { Storage } from '../xml/XmlDiagnostics';

export class I18NCompletionItemProvider implements CompletionItemProvider {

	public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]> | CompletionList | Thenable<CompletionList> {
		let line = document.lineAt(position);
		// 1 = name so far
		let pos = line.text.match(new RegExp(workspace.getConfiguration("ui5ts").get("lang.i18n.modelname") + ">(.*?)}?\"")) as RegExpMatchArray;
		if (!pos)
			return [];

		let startpos = pos.index + (<string>workspace.getConfiguration("ui5ts").get("lang.i18n.modelname")).length + 1;
		let endpos = startpos + pos[1].length
		if (position.character < startpos || position.character > endpos)
			return [];

		let curlist: CompletionItem[] = [];
		for (let iname in Storage.i18n.labels) {
			if(token.isCancellationRequested) return curlist;
			let item = Storage.i18n.labels[iname];
			if (iname.startsWith(pos[1])) {
				let labelpart = item.text.substring(pos[1].length, item.text.length);
				let citem = new CompletionItem(iname, CompletionItemKind.Value);
				citem.detail = "i18n";
				citem.documentation = item.text;
				citem.filterText = labelpart;
				citem.insertText = labelpart;
				curlist.push(citem);
			}
		}

		return curlist;
	}

	public resolveCompletionItem(item: CompletionItem, token: CancellationToken): CompletionItem | Thenable<CompletionItem> {
		return item;
	}
}