import { Log, LogLevel } from '../Log';
import { Diagnostic, Range, DiagnosticSeverity, PublishDiagnosticsParams, IConnection } from 'vscode-languageserver'
import * as xmlChecker from 'xmlchecker';
import { XmlCheckerError } from '../xmltypes'
import * as xml2js from 'xml2js';
import { getLine, Global, getPositionFromIndex, getRange, getLineCount } from '../server'
import * as fs from 'fs';
import * as path from 'path';

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

export class XmlWellFormedDiagnosticProvider extends Log {
    async diagnose(uri: string, text: string): Promise<PublishDiagnosticsParams> {
        let items = await this.diagXml2Js(text);
        items = items.concat(this.diagXmlChecker(text));
        items = items.concat(await this.getNamespaces(text));
        return { uri: uri, diagnostics: items };
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

export class XmlAttributeChecks extends Log {
    async diagnose(uri: string, text: string) {
        // let text = fs.readfile
    }
    
}
interface XmlSchema {
    targetNamespace: string
    file: string
}