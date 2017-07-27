import * as path from "path";
import * as vscode from "vscode";
import {
	CancellationToken,
	CompletionItem,
	CompletionItemKind,
	CompletionItemProvider,
	CompletionList,
	Position,
	TextDocument,
} from "vscode";
import { Ui5ManifestBase } from "../../baseclasses";
import { ui5tsglobal } from "../../extension";
import { getViews, IUi5View } from "../searchFunctions";

export class ManifestCompletionItemProvider extends Ui5ManifestBase implements CompletionItemProvider {
	public async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionList> {
		const line = document.lineAt(position);
		const matches = line.text.match(/"(.*)"\s*:\s*(.*)\s*[,]?\s*/);
		if (!matches)
			return new CompletionList();
		if (token.isCancellationRequested) {
			throw new Error("Cancelled");
		}

		const key = matches[1];
		let value = matches[2];
		let val;
		let kind = CompletionItemKind.Field;

		switch (key) {
			case "target":
				console.log("Target triggered\n");
				let targets: Array<string>;
				ui5tsglobal.core.manifest = JSON.parse(document.getText());

				targets = ui5tsglobal.core.manifest ? (this.getTargets(ui5tsglobal.core.manifest)) : this.getTargets(JSON.parse(document.getText()));

				if (token.isCancellationRequested) {
					throw new Error("Cancelled");
				}

				if (!targets) {
					throw new Error("No targets found");
				}

				if (value && value.startsWith('"')) {
					value = value.match(/"(.*)"/)[1];
					kind = CompletionItemKind.Text;
				}

				val = new CompletionList(targets.map(x => {
					if (token.isCancellationRequested) throw (new Error("Cancelled"));
					const item = this.newCompletionItem(x, kind);
					item.documentation = "viewName: '" + ui5tsglobal.core.manifest["sap.ui5"].routing.targets[item.label].viewName + "'\n" +
						"transition: '" + ui5tsglobal.core.manifest["sap.ui5"].routing.targets[item.label].transition + "'";
					return item;
				}), false);
				return val;
			case "viewName":
				console.log("viewName triggered\n");

				if (value && value.startsWith('"')) {
					value = value.match(/"(.*)"/)[1];
					kind = CompletionItemKind.Text;
				}

				const views = await getViews();
				let relativeViews: Array<IUi5View> = [];
				if (ui5tsglobal.core.manifest["sap.ui5"].routing.config.viewPath) {
					// make relative namespaces
					const prefix = ui5tsglobal.core.manifest["sap.ui5"].routing.config.viewPath + ".";

					for (const view of views) {
						relativeViews.push({
							fullpath: view.fullpath,
							name: view.name.replace(prefix, ""),
							type: view.type,
						});
					}
				} else {
					relativeViews = views;
				}

				return new CompletionList(relativeViews.map(x => {
					const item = this.newCompletionItem(x.name, kind);
					item.documentation = "file: '." + path.sep + path.relative(vscode.workspace.rootPath, x.fullpath) + "'";
					item.detail = "type: '" + ViewType[x.type] + "'";
					return item;
				}), false);
			default:
				throw new Error("Unknown Key: '" + key + "'");
		}
	}

	private newCompletionItem(name: string, kind: CompletionItemKind): CompletionItem {
		let item: CompletionItem;
		if (kind === CompletionItemKind.Text) {
			item = new CompletionItem(name, kind);
			item.insertText = '"' + name;
			item.filterText = '"' + name + '"';
		} else {
			item = new CompletionItem(name, kind);
			item.insertText = '"' + name + '"';
		}
		return item;
	}
}
