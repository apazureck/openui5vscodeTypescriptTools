import {
	CancellationToken,
	CompletionItem,
	CompletionItemKind,
	CompletionItemProvider,
	CompletionList,
	Position,
	TextDocument,
	workspace,
} from "vscode";
import { Storage } from "../xml/XmlDiagnostics";

export class I18NCompletionItemProvider implements CompletionItemProvider {

	public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]> | CompletionList | Thenable<CompletionList> {
		const line = document.lineAt(position);
		// 1 = name so far
		const pos = line.text.match(new RegExp(workspace.getConfiguration("ui5ts").get("lang.i18n.modelname") + ">(.*?)}?\"")) as RegExpMatchArray;
		if (!pos)
			return [];

		const startpos = pos.index + (workspace.getConfiguration("ui5ts").get("lang.i18n.modelname") as string).length + 1;
		const endpos = startpos + pos[1].length;
		if (position.character < startpos || position.character > endpos)
			return [];

		const curlist: CompletionItem[] = [];
		const labels = Storage.i18n.Labels;
		for (const iname in labels) {
			if (Storage.i18n.Labels[iname]) {
				if (token.isCancellationRequested) return curlist;
				const item = Storage.i18n.Labels[iname];
				if (iname.startsWith(pos[1])) {
					const labelpart = iname.substring(pos[1].length, iname.length);
					const citem = new CompletionItem(iname, CompletionItemKind.Value);
					citem.detail = "i18n";
					citem.documentation = item.text;
					citem.filterText = labelpart;
					citem.insertText = labelpart;
					curlist.push(citem);
				}
			}
		}

		return curlist;
	}

	public resolveCompletionItem(item: CompletionItem, token: CancellationToken): CompletionItem | Thenable<CompletionItem> {
		return item;
	}
}