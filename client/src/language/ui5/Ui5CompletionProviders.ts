import { CompletionItemProvider, TextDocument, Position, CancellationToken, CompletionList, CompletionItem } from 'vscode';
import { channel } from '../../extension';

export class Ui5i18nCompletionItemProvider implements CompletionItemProvider {
    /**
		 * Provide completion items for the given position and document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @return An array of completions, a [completion list](#CompletionList), or a thenable that resolves to either.
		 * The lack of a result can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Thenable<CompletionList> {
            channel.appendLine("Provide Completion Request received.");
            return new Promise((reject, resolve) => {
                let i = 0;
            });
        };

		/**
		 * Given a completion item fill in more data, like [doc-comment](#CompletionItem.documentation)
		 * or [details](#CompletionItem.detail).
		 *
		 * The editor will only resolve a completion item once.
		 *
		 * @param item A completion item currently active in the UI.
		 * @param token A cancellation token.
		 * @return The resolved completion item or a thenable that resolves to of such. It is OK to return the given
		 * `item`. When no result is returned, the given `item` will be used.
		 */
		resolveCompletionItem(item: CompletionItem, token: CancellationToken): Thenable<CompletionItem> {
            channel.appendLine("Resolve Completion Request received.");
            return new Promise((reject, resolve) => {
                let i = 0;
            })
        }
}