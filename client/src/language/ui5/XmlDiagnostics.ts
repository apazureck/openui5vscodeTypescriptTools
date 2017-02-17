import { Message } from '_debugger';
import * as vscode from 'vscode'
import * as path from 'path';
import { DiagnosticCollection, TextDocumentChangeEvent, Diagnostic, DiagnosticSeverity, Range, TextLine } from 'vscode';
import * as extension from '../../extension';
import * as xml2js from 'xml2js'
import { getNamespaces, XmlError, XmlCheckerError } from '../xmlbase'
var xmlChecker = require('xmlChecker');

export class XmlDiagnostics {
    constructor(public diagnosticCollection: DiagnosticCollection) {

    }

    async diagnose(changes: TextDocumentChangeEvent) {
        if (!changes.document.fileName.endsWith(".xml"))
            return;
        this.diagnosticCollection.delete(changes.document.uri);
        let items = await this.diagXml2Js(changes);
        items = items.concat(this.diagXmlChecker(changes));
        if(items.length>0)
            this.diagnosticCollection.set(changes.document.uri, items);
    }

    diagXmlChecker(changes: TextDocumentChangeEvent): Diagnostic[] {
        try {
            xmlChecker.check(changes.document.getText());
            return [];
        } catch (error) {
            let err = error as XmlCheckerError;
            err.line--;
            err.column--;
            console.log(JSON.stringify(error));
            return [new Diagnostic(new Range(err.line, err.column, err.line, changes.document.lineAt(err.line).text.length - 1), err.message, DiagnosticSeverity.Warning)];
        }
    }

    diagXml2Js(changes: TextDocumentChangeEvent): Promise<Diagnostic[]> {
        return new Promise((resolve, reject) => {
            xml2js.parseString(changes.document.getText(), { xmlns: true }, (error, result) => {
                if (error) {
                    // let namespaces = getNamespaces(result);
                    let errorlines = error.message.split("\n");
                    error.message = errorlines[0];
                    error.Line = Number(errorlines[1].match(/\d+/));
                    error.Column = Number(errorlines[2].match(/\d+/));
                    let char = errorlines[3].split(":")[1];
                    if (char)
                        error.message += "Character: '" + char + "'";
                    resolve([new Diagnostic(new Range(error.Line, error.Column, changes.document.lineCount, changes.document.lineAt(changes.document.lineCount - 1).text.length - 1), error.message, DiagnosticSeverity.Error)])
                }
                resolve([]);
            });
        });


    }
}