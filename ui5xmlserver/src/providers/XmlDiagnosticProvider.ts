import { Log, LogLevel } from '../Log';
import { Diagnostic, Range, DiagnosticSeverity, PublishDiagnosticsParams, IConnection, TextDocument } from 'vscode-languageserver'
import * as xmlChecker from 'xmlchecker';
import { FoundAttribute, FoundElementHeader, XmlBaseHandler, XmlCheckerError, XmlStorage } from '../xmltypes';
import * as xml2js from 'xml2js';
import { getLine, Global, getPositionFromIndex, getRange, getLineCount } from '../server'
import * as fs from 'fs';
import * as path from 'path';

enum DiagnosticCodes {
    DoubleAttribute
}

interface IDiagnostic {
    diagnose(doc: TextDocument): Promise<Diagnostic[]>
}

export class DiagnosticCollection {

    diagnostics: {
        [uri: string]: PublishDiagnosticsParams;
    }
    delete(uri: string) {
        this.diagnostics = {};
    }

    set(uri: string, diag: Diagnostic[]) {
        if (this.diagnostics[uri])
            this.diagnostics[uri].diagnostics = this.diagnostics[uri].diagnostics.concat(diag);
        else
            this.diagnostics[uri].diagnostics = diag;
    }
}

export class XmlWellFormedDiagnosticProvider extends Log implements IDiagnostic {
    async diagnose(doc: TextDocument): Promise<Diagnostic[]> {
        let text = doc.getText();
        let items: Diagnostic[] = []
        try {
            items = items.concat(await this.diagXml2Js(text));
        } catch (error) {
            console.log(error.toString())
        }
        try {
            items = items.concat(this.diagXmlChecker(text));
        } catch (error) {
            console.log(error.toString())
        }
        try {
            items = items.concat(await this.getNamespaces(text));
        } catch (error) {
            console.log(error.toString())
        }
        return items;
    }

    diagXmlChecker(text: string): Diagnostic[] {
        try {
            xmlChecker.check(text);
            return [];
        } catch (error) {
            let err = error as XmlCheckerError;
            err.line--;
            err.column--;
            console.log(JSON.stringify(error));
            return [{
                range: {
                    start: {
                        line: err.line,
                        character: err.column
                    },
                    end: {
                        line: err.line,
                        character: getLine(text, (err.line)).length - 1
                    }
                },
                severity: DiagnosticSeverity.Warning,
                message: err.message,
                source: 'xmlLint'
            }];
        }
    }

    diagXml2Js(text: string): Promise<Diagnostic[]> {
        return new Promise<Diagnostic[]>((resolve, reject) => {
            xml2js.parseString(text, { xmlns: true }, (error, result) => {
                if (error) {
                    // let namespaces = getNamespaces(result);
                    let errorlines = error.message.split("\n");
                    error.message = errorlines[0];
                    error.Line = Number(errorlines[1].match(/\d+/));
                    error.Column = Number(errorlines[2].match(/\d+/));
                    let char = errorlines[3].split(":")[1];
                    if (char)
                        error.message += "Character: '" + char + "'";
                    let x: Diagnostic = {
                        range: {
                            start: {
                                line: error.Line as number,
                                character: error.Column as number
                            },
                            end: {
                                line: getLineCount(text),
                                character: getLine(text, getLineCount(text)).length - 1
                            }
                        },
                        message: error.message,
                        severity: DiagnosticSeverity.Error
                    }
                    resolve([]);
                }
                resolve([]);
            });
        });


    }

    async getNamespaces(text: string): Promise<Diagnostic[]> {
        let match: RegExpMatchArray;
        // Group 1: namespace abbrevation
        // Group 2: namespace name
        let xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g
        let doc: string = text;
        let hits: Diagnostic[] = []
        while (match = xmlnsregex.exec(doc)) {
            if (Global.schemastore.schemas[match[2]]) {
                hits.push();
                //new Diagnostic(new Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length)), "Could not find definition file in storage. Add using the add to storage command.", vscode.DiagnosticSeverity.Warning)
            }
        }
        return hits;
    }
}

export class XmlAttributeDiagnosticProvider extends XmlBaseHandler implements IDiagnostic {
    private text: string;
    constructor(schemastorage: XmlStorage, connection: IConnection, logLevel: LogLevel, private diagnostics?: Diagnostic[]) {
        super(schemastorage, connection, logLevel);
        if(!diagnostics)
            diagnostics = []
    }
    async diagnose(doc: TextDocument): Promise<Diagnostic[]> {
        return new Promise<Diagnostic[]>((resolve, reject) => {
            try {
                this.text = doc.getText();
                let baselement = this.textGetElements(this.text);
                this.checkAllElementsForAttributes(baselement);
                resolve(this.diagnostics);
            } catch (error) {
                this.logError("Could not diagnose Attributes: " + error.toString());
                reject(error);
            }
        })
    }

    /**
     * Checks if double attributes are in element header
     * 
     * @param {FoundElementHeader} element 
     * 
     * @memberOf XmlAttributeChecks
     */
    checkDoubleAttributes(element: FoundElementHeader): void {
        let doubles: { [name: string]: FoundAttribute } = {}
        this.logDebug("Checking " + (element.attributes ? element.attributes.length : 0) + " attributes")
        for (let attribute of element.attributes) {
            if (doubles[attribute.name]) {
                this.logDebug(() => "Found double attribute '" + attribute.name + "'")
                this.diagnostics.push({
                    code: DiagnosticCodes.DoubleAttribute,
                    message: "Double attribute '" + attribute.name + "'",
                    range: { start: getPositionFromIndex(this.text, attribute.startpos), end: getPositionFromIndex(this.text, attribute.endpos) },
                    severity: DiagnosticSeverity.Error,
                    source: "xmllint"
                });
            } else {
                this.logDebug(() => "Added attribute '" + attribute.name + "' to the doubles dictionary");
                doubles[attribute.name] = attribute;
            }
        }
    }

    /**
     * Checks all elements for their attributes recursively using the children array
     * 
     * @param {FoundElementHeader} baseelement 
     * 
     * @memberOf XmlAttributeChecks
     */
    checkAllElementsForAttributes(baseelement: FoundElementHeader): void {
        this.checkDoubleAttributes(baseelement);
        if (baseelement.children)
            for (let el of baseelement.children) {
                this.logDebug("Checking element '" + el.fullName + "'");
                this.checkAllElementsForAttributes(el);
            }
    }
}