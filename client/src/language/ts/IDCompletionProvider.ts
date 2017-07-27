import {
    CancellationToken,
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    CompletionList,
    Position,
    Range,
    TextDocument,
    Uri,
    workspace,
} from "vscode";
import { ui5tsglobal } from "../../extension";
import { getNodeAtPosition, getParentOfType, getViewsForController } from "../searchFunctions";

/**
 * Interface for a found ID in an xml view.
 * 
 * @interface IFoundID
 */
interface IFoundID {
    /**
     * The ID found in id="<id>"
     * 
     * @type {string}
     * @memberof IFoundID
     */
    id: string;
    /**
     * The name of the element <ElementName ... id="foo" ... >
     * 
     * @type {string}
     * @memberof IFoundID
     */
    element: string;
    /**
     * Location of the ID string for example "foo"
     *
     * @type {Range}
     * @memberof IFoundID
     */
    location: Range;
}

export class IDCompletionProvider implements CompletionItemProvider {
    public async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
        const linetocursor = document.lineAt(position).text.substr(0, position.character);
        if (!linetocursor.endsWith(".byId(")) {
            return undefined;
        }

        const fullname = ui5tsglobal.core.GetModuleNameFromFilePath(document.fileName);
        const views = await getViewsForController(fullname);
        const ids = await this.getIdsFromViews(views);

        return ids.map((value, index, array) => {
            const i = new CompletionItem(value.id, CompletionItemKind.Value);
            i.sortText = "*" + value.id;
            i.detail = "Element: '" + value.element;
            i.insertText = "\"" + value.id + "\"";
            return i;
        });
    }
    public resolveCompletionItem?(item: CompletionItem, token: CancellationToken): CompletionItem | Thenable<CompletionItem> {
        return item;
    }

    private async getIdsFromViews(views: Uri[]): Promise<IFoundID[]> {
        const ret: IFoundID[] = [];
        for (const view of views) {
            const doc = await workspace.openTextDocument(view);
            const text = doc.getText();

            // 1: Text until matching group 4
            // 2: Element Name (For example Page)
            // 3: Quote (' or ")
            // 4: Id name (id="foo") -> foo
            const idFinderRegex = /(<\s*?([\w:]+)(?:(?!>)[\s\S])*?id\s*?=\s*?("|'))(\w+)\3/gm;

            let match: RegExpMatchArray;
            while (match = idFinderRegex.exec(text)) {
                ret.push({
                    element: match[2],
                    id: match[4],
                    location: new Range(doc.positionAt(match.index + match[1].length), doc.positionAt(match.index + match[0].length - 1)),
                });
            }
        }
        return ret;
    }
}
