import { Ui5ManifestBase, IUi5View } from '../../baseclasses';
import * as vscode from 'vscode';
import {
    CancellationToken,
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    CompletionList,
    Position,
    TextDocument
} from 'vscode';
import * as path from 'path';
import{ui5tsglobal} from '../../extension';

export class ManifestCompletionItemProvider extends Ui5ManifestBase implements CompletionItemProvider {
    public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Thenable<CompletionItem[]> | CompletionItem[] | Thenable<CompletionList> {
		return new Promise<CompletionList>((resolve, reject) => {
			let line = document.lineAt(position);
			let matches = line.text.match(/"(.*)"\s*:\s*(.*)\s*[,]?\s*/);
			if(!matches)
				return reject("No matches found.");
			if(token.isCancellationRequested) reject("Cancelled");

			let key = matches[1];
			let value = matches[2];
			let val;
			let kind = CompletionItemKind.Field;

			try {
				switch (key) {
				case "target":
					console.log("Target triggered\n");
					let targets: Array<string>;
					ui5tsglobal.core.manifest = JSON.parse(document.getText());
					try {
						if(ui5tsglobal.core.manifest)
							targets = (this.getTargets(ui5tsglobal.core.manifest));
						else
							targets = this.getTargets(JSON.parse(document.getText()));
					} catch (error) {
						return reject(error);
					}

					if(token.isCancellationRequested) reject("Cancelled");

					if(!targets)
						return reject("No targets found");
					 
					if(value && value.startsWith('"')) {
						value = value.match(/"(.*)"/)[1];
						kind = CompletionItemKind.Text;
					}

					val = new CompletionList(targets.map(x => {
							if(token.isCancellationRequested) throw("Cancelled");
							let item = this.newCompletionItem(x, kind);
							item.documentation = "viewName: '"  + ui5tsglobal.core.manifest["sap.ui5"].routing.targets[item.label].viewName + "'\n" +
												 "transition: '" + ui5tsglobal.core.manifest["sap.ui5"].routing.targets[item.label].transition + "'";
							return item;
					}), false);
					return resolve(val);
				case "viewName":
					console.log("viewName triggered\n");

					if(value && value.startsWith('"')) {
						value = value.match(/"(.*)"/)[1];
						kind = CompletionItemKind.Text;
					}

					let views = this.getViews();
					let relativeViews: Array<IUi5View> = []
					if(ui5tsglobal.core.manifest["sap.ui5"].routing.config.viewPath) {
						//make relative namespaces
						let prefix = ui5tsglobal.core.manifest["sap.ui5"].routing.config.viewPath+".";

						for(let view of views) {
							relativeViews.push({
								fullpath: view.fullpath,
								name: view.name.replace(prefix, ""),
								type: view.type
							});
						}
					}
					else
						relativeViews = views;

					resolve(new CompletionList(relativeViews.map(x => {
						let item = this.newCompletionItem(x.name, kind);
						item.documentation = "file: '." + path.sep + path.relative(vscode.workspace.rootPath, x.fullpath) + "'";
						item.detail = "type: '" + ViewType[x.type] + "'";
						return item;
					}), false));
				default:
					return reject("Unknown Key: '"+key+"'");
			}
			} catch(error) { 
				reject(error);
			}
		});
    }

	private newCompletionItem(name: string, kind: CompletionItemKind): CompletionItem {
		let item: CompletionItem;
		if(kind === CompletionItemKind.Text) {
			item = new CompletionItem(name, kind);
			item.insertText = '"'+name;
			item.filterText = '"'+name+'"'
		}
		else {
			item = new CompletionItem(name, kind);
			item.insertText = '"'+name+'"';
		}
		return item;
	}
}