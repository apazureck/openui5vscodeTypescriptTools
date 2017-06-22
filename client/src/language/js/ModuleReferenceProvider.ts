import * as path from "path";
import * as vscode from "vscode";
import { CancellationToken, Location, Position, Range, ReferenceContext, ReferenceProvider, TextDocument } from "vscode";
import { ui5tsglobal } from "../../extension";

export class ModuleReferenceProvider implements ReferenceProvider {
    private STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    private childWord: string;
    private currentList: any;
    public async provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken) {
        const fullText = document.getText();
        const currentFilePath = document.fileName;

        const range = document.getWordRangeAtPosition(position);

        if (range) {
            const word = document.getText(range);

            const params = /(define|require)\s*\(([^)]*)/gi;

            const noComment = fullText.toString().replace(this.STRIP_COMMENTS, "");
            const tmpResult = params.exec(noComment);

            if (tmpResult && tmpResult[2])
                this.parseRequireDefine(tmpResult[2]);

            let modulePath;
            modulePath = ui5tsglobal.core.GetNamespaceFromFilePath(this.currentList[word]);

            // We matched a module (word is a module)
            if (modulePath) {
                let searchFor = "";
                let stopSearchingFurther;

                if (this.childWord === "") {// Not a parent - search for the module name (word)
                    searchFor = word;
                    stopSearchingFurther = true;
                } else { // It is a parent, search for the child which is a property of the module
                    searchFor = this.childWord;
                    stopSearchingFurther = false;
                }
                this.childWord = "";

                return await this.searchModule(modulePath, searchFor, stopSearchingFurther, currentFilePath);
            } else { // word is not a module

                let continueFrom;

                let dotPosition: number | boolean = document.offsetAt(new vscode.Position(range.start.line, range.start.character - 1));

                // Do backwards search for a dot
                dotPosition = this.doBackwardsSearch(dotPosition, ".", fullText);
                const haveParent = dotPosition !== false;

                let tmpModuleName;
                if (!haveParent) {
                    tmpModuleName = this.extractString(document, range);
                }

                const constructors = this.findConstructor(word, fullText, document);
                // TODO: also consider window. defined globals
                // Dont have a parent and have a constructor, follow the constructor
                if (constructors.length && !haveParent) {
                    // Break search in case the instance and the constructor have the same name
                    if (document.getText(document.getWordRangeAtPosition(constructors[0].range.start)) === word) {
                        return undefined;
                    } else {
                        continueFrom = constructors[0].range.start;
                    }
                } else if (haveParent) { // Have a parent - follow it
                    const propertyParentPosition = document.positionAt(dotPosition as number);
                    const propertyParent = document.getText(document.getWordRangeAtPosition(propertyParentPosition));

                    let bracketPosition: number | boolean = document.offsetAt(propertyParentPosition);
                    // Do backwards search for a ")"
                    bracketPosition = this.doBackwardsSearch(bracketPosition, ")", fullText);

                    // Immediately invoked define/require
                    if (bracketPosition) {
                        const line = document.lineAt(propertyParentPosition.line).text;
                        const path = /['"]([^'"]*)/gi.exec(line);

                        return [this.searchModule(path[1], word, true, currentFilePath)];
                    } else {
                        continueFrom = propertyParentPosition;
                        this.childWord = word;
                    }
                } else { // Neither have a parent nor a constructor, maybe its a module itself? navigate to module
                    let isModule = false;
                    for (const key in this.currentList) {
                        if (this.currentList[key] === tmpModuleName) {
                            isModule = true;
                            break;
                        }
                    }

                    if (isModule) {
                        return [await this.searchModule(tmpModuleName, "", true, currentFilePath)];
                    } else {
                        // No match;
                        return undefined;
                    }
                }

                // Should we continue searching? If so re-invoke a definition provider
                if (continueFrom) {
                    const refs: TextDocument[] = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", document.uri, continueFrom) as TextDocument[];

                    for (let i = refs.length - 1; i >= 0; i--) {
                        // Discard if same file
                        if (refs[i].uri.path === document.uri.path) {
                            refs.splice(i, 1);
                        }
                    }
                    return refs;
                }
            }
        } else {
            return;
        }
    }

    /**
     * Fills currentList with path/name pairs given a define/require statement
     * @param {String} str
     */
    private parseRequireDefine(str: string): void {
        let list; let result;
        const array = /\[[^\]]*\]/gi;
        const params = /function\s*\([^)]*/gi;

        let m = array.exec(str);

        if (m) {
            list = JSON.parse(m[0].split("'").join("\""));
        }

        m = params.exec(str);

        if (m) {
            const test = /([^\s,]+)/g;
            result = m[0].slice(m[0].indexOf("(") + 1).match(test);
        }

        this.currentList = {};

        if (result)
            result.forEach((value, index) => {
                this.currentList[value] = list[index];
            });
    };

    /**
     * Searched for construction patterns in the fullText and returns locations of constructor calls
     */
    private findConstructor(word: string, fullText: string, document: TextDocument): Location[] {
        const test = new RegExp("(?:" + word + "\\s*=\\s*(?:new)?\\s*)([^\\s(;]*)", "ig");
        let searchResult;

        const references = [];

        do {
            searchResult = test.exec(fullText);
            if (searchResult) {
                const newPosition = document.positionAt(searchResult.index + searchResult[0].indexOf(searchResult[1]));

                const range = document.getWordRangeAtPosition(newPosition);
                if (range)
                    references.push(new Location(document.uri, range));
            }
        } while (searchResult);
        return references;
    };

    /**
     * Diverges the search to the given module
     * @param {string} modulePath Require path of the target module
     * @param {string} searchFor The string to search for inside the module
     * @param {boolean} stopSearchingFurther If set to true, do not continue following definitions.
     * @param {string} currentFilePath path of the current file
     */
    private async searchModule(modulePath: string, searchFor: string, stopSearchingFurther: boolean, currentFilePath: string) {

        let newUriPath;

        if (!!modulePath.match(/^\./i)) {
            newUriPath = path.resolve(currentFilePath.replace(/\\[^\\/]+$/, ""), modulePath);
        } else {
            newUriPath = path.resolve(vscode.workspace.rootPath, vscode.workspace.getConfiguration("requireModuleSupport").get("modulePath"), modulePath);
        }
        if (!newUriPath.match(/\.js$/i)) newUriPath += ".js";

        const newUri = vscode.Uri.file(newUriPath);

        const doc = await vscode.workspace.openTextDocument(newUri);
        const newFullText = doc.getText();
        const test = new RegExp("(\\b" + searchFor + "\\b)", "g");
        let searchResult;
        let found = false;

        const onlyNavigateToFile = vscode.workspace.getConfiguration("requireModuleSupport").get("onlyNavigateToFile");

        if (!onlyNavigateToFile) {
            do {
                searchResult = test.exec(newFullText);

                if (searchResult) {
                    found = true;
                    const newPosition = doc.positionAt(searchResult.index);

                    // If not inside a comment, continue at this reference
                    const simpleComment = /^\s*\*/gm;
                    if (!simpleComment.test(doc.lineAt(newPosition.line).text)) {
                        if (stopSearchingFurther) {
                            return new vscode.Location(newUri, newPosition);
                        } else {
                            // Invoke a new providerbeginning from the new location
                            const refs = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", newUri, newPosition) as any;
                            if (refs.length > 0) {
                                return refs;
                            } else {
                                return new vscode.Location(newUri, newPosition);
                            }
                        }
                    }
                }
            } while (searchResult && searchFor);
        }

        // Only navigate to the file
        if (!found || onlyNavigateToFile) {
            return new vscode.Location(newUri, new vscode.Position(0, 0));
        }
        return undefined;
    }

    /**
     * returns the string literal's contents in document covering range
     * @param {TextDocument} document Document to extract the string
     * @param {Range} range Seed range
     */
    private extractString(document: TextDocument, range: Range): string {
        let char;

        const line = document.lineAt(range.start.line).text;

        let startOffset = 0;

        while (char = line[range.start.character - startOffset], char !== "'" && char !== "\"" && range.start.character - startOffset >= 0) {
            startOffset++;
        }

        let endOffset = 0;
        while (char = line[range.start.character + endOffset], char !== "'" && char !== "\"" && range.start.character + endOffset < line.length) {
            endOffset++;
        }
        return document.getText(new vscode.Range(
            new vscode.Position(range.start.line, range.start.character - startOffset + 1),
            new vscode.Position(range.start.line, range.start.character + endOffset),
        ));
    }

    /**
     * Searches for a character backwards inside fullText discarding spaces, tabs and newlines
     * Returns the found index or false if not found.
     * @param {number} offset offset at which we start the search from
     * @param {string} searchFor a single character to search for
     * @param {string} fullText text of the document
     * @return {number} offset of the found index or false if not index is found
     */
    private doBackwardsSearch(offset: number, searchFor: string, fullText: string): number | boolean {
        let currentChar;
        let found = false;

        // Do backwards search
        do {
            currentChar = fullText[offset];
            if (currentChar === searchFor) {
                found = true;
            }
            offset--;
            if (found)
                return offset;
        } while (offset >= 0 && (currentChar === " " || currentChar === "\t" || currentChar === "\n" || currentChar === "\r"));
        return false;
    }
}