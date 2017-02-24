import { Message } from '_debugger';
import * as vscode from 'vscode';
import * as path from 'path';
import {
    Diagnostic,
    DiagnosticCollection,
    DiagnosticSeverity,
    ExtensionContext,
    Range,
    TextDocumentChangeEvent,
    TextLine,
    CancellationToken,
    TextDocument
} from 'vscode';
import * as extension from '../../extension';
import * as xml2js from 'xml2js';
import { getNamespaces, XmlError, XmlCheckerError } from '../xmlbase'
import * as fs from 'fs';
var xmlChecker = require('xmlChecker');
import { File } from '../../helpers/filehandler';
export class I18nLabels {
    constructor() {
        this.create();
    }

    labels: { [label: string]: string }
    private modelfilename: string

    create() {
        this.labels = {};
        this.modelfilename = <string>vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelfilelocation") || "./i18n/i18n.properties";
        let content = fs.readFileSync(path.join(vscode.workspace.rootPath, this.modelfilename), "utf-8").split("\n");
        for (let line of content) {
            let match = line.match("^(.*?)=(.*)");
            if (match)
                this.labels[match[1]] = match[2];
        }
    }

    addNewLabel(label: string, text: string) {
        if (this.labels[label])
            throw new Error("Label already exists");

        let modelfilename = <string>vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelfilelocation") || "./i18n/i18n.properties";
        fs.appendFileSync(path.join(vscode.workspace.rootPath, this.modelfilename), "\n" + label + "=" + text);
        this.labels[label] = text;
    }
}

export class Schemastore {
    public schemas: XmlSchema[] = []
    constructor(public path: string) {
        this.initializeStorage();
    }
    initializeStorage() {
        let files = fs.readdirSync(this.path);
        this.schemas = [];
        for (let file of files) {
            let doc = fs.readFileSync(path.join(this.path, file)).toString();
            let tns = doc.match(/targetNamespace\s*?=\s*?["'](.*?)["']/);
            try {
                this.schemas.push({
                    file: file, targetNamespace: tns[1]
                });
            } catch (error) {

            }
        }
    }
}

interface XmlSchema {
    targetNamespace: string
    file: string
}

interface Hit {
    index: number,
    length: number
}

export interface I18nDiagnostic extends Diagnostic {
    label: string;
}

export namespace Storage {

    export var schemastore: Schemastore;
    export const i18n: I18nLabels = new I18nLabels();
}

export class XmlDiagnostics {
    constructor(public diagnosticCollection: DiagnosticCollection, private context: ExtensionContext) {

    }

    async diagnose(changes: TextDocumentChangeEvent) {
        if (!changes.document.fileName.endsWith(".xml"))
            return;
        this.diagnosticCollection.delete(changes.document.uri);
        let items = await this.diagXml2Js(changes);
        items = items.concat(this.diagXmlChecker(changes));
        items = items.concat(await this.getNamespaces(changes));
        items = items.concat(await this.diagi18n(changes))
        if (items.length > 0)
            this.diagnosticCollection.set(changes.document.uri, items);
    }

    diagi18n(changes: TextDocumentChangeEvent): Diagnostic[] {
        try {
            let text = changes.document.getText();
            let i18nreg = new RegExp("\"\s*?{\s*?" + vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelname") + "\s*?>\s*?(.*?)\s*?}\s*?\"", "g");
            let match: RegExpMatchArray;
            let ret: I18nDiagnostic[] = []
            while (match = i18nreg.exec(text))
                if (!Storage.i18n.labels[match[1]]) {
                    ret.push({
                        range: this.getRange(changes.document, match.index, match[0].length),
                        message: "Label " + match[1] + " does not exist",
                        severity: DiagnosticSeverity.Warning,
                        source: "ui5ts",
                        code: "i18nLabelMissing",
                        label: match[1]
                    });
                }
            return ret;
        } catch (error) {

        }
    }

    getRange(document: TextDocument, startIndex: number, length: number): Range {
        return new Range(document.positionAt(startIndex), document.positionAt(startIndex + length));
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

    async getNamespaces(changes: TextDocumentChangeEvent): Promise<Diagnostic[]> {
        let match: RegExpMatchArray;
        // Group 1: namespace abbrevation
        // Group 2: namespace name
        let xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g
        let doc: string = changes.document.getText();
        if (!Storage.schemastore)
            Storage.schemastore = new Schemastore(this.context.asAbsolutePath("schemastore"));
        let hits: Diagnostic[] = []
        while (match = xmlnsregex.exec(doc)) {
            if (Storage.schemastore.schemas.findIndex((val) => val.targetNamespace === match[2]) < 0) {
                hits.push(new Diagnostic(new Range(changes.document.positionAt(match.index), changes.document.positionAt(match.index + match[0].length)), "Could not find definition file in storage. Add using the add to storage command.", vscode.DiagnosticSeverity.Warning));
            }
        }
        return hits;
    }
}

