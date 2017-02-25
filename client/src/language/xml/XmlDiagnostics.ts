import { IDiagnose } from '../../extension';
import { Message } from '_debugger';
import * as vscode from 'vscode';
import * as path from 'path';
import {
    CancellationToken,
    Diagnostic,
    DiagnosticCollection,
    DiagnosticSeverity,
    ExtensionContext,
    Range,
    TextDocument,
    TextDocumentChangeEvent,
    TextLine,
    Uri
} from 'vscode';
import * as extension from '../../extension';
import * as xml2js from 'xml2js';
import { getNamespaces, XmlError, XmlCheckerError } from '../xmlbase'
import * as fs from 'fs';
var xmlChecker = require('xmlChecker');
import { File } from '../../helpers/filehandler';

export interface I18nLabel {
    text: string
    line: number
}
export class I18nLabelStorage {
    constructor() {
        this.create();
    }

    labels: { [label: string]: I18nLabel }
    modelfilename: string
    modelfile: Uri
    linecount: number;
    create() {
        this.labels = {};
        this.modelfilename = <string>vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelfilelocation") || "./i18n/i18n.properties";
        this.modelfile = Uri.parse("file:///"+path.join(vscode.workspace.rootPath, this.modelfilename));
        let content = fs.readFileSync(this.modelfile.fsPath, "utf-8").split("\n");
        this.linecount  = 0;
        for (let line of content) {
            let match = line.match("^(.*?)=(.*)");
            if (match)
                this.labels[match[1]] = {
                    text: match[2],
                    line: this.linecount
                }
            this.linecount++;
        }
    }

    addNewLabel(label: string, text: string) {
        if (this.labels[label])
            throw new Error("Label already exists");

        let modelfilename = <string>vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelfilelocation") || "./i18n/i18n.properties";
        fs.appendFileSync(path.join(vscode.workspace.rootPath, this.modelfilename), "\n" + label + "=" + text);
        this.labels[label] = {
            line: this.linecount++,
            text: text
         };
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
    export const i18n: I18nLabelStorage = new I18nLabelStorage();
}

export class XmlDiagnostics implements IDiagnose {
    constructor(public diagnosticCollection: DiagnosticCollection, private context: ExtensionContext) {

    }

    async diagnose(document: TextDocument) {
        if (!document.fileName.endsWith(".xml"))
            return;
        this.diagnosticCollection.delete(document.uri);
        let items = await this.diagXml2Js(document);
        items = items.concat(this.diagXmlChecker(document));
        items = items.concat(await this.getNamespaces(document));
        items = items.concat(await this.diagi18n(document))
        if (items.length > 0)
            this.diagnosticCollection.set(document.uri, items);
    }

    diagi18n(document: TextDocument): Diagnostic[] {
        try {
            let text = document.getText();
            let i18nreg = new RegExp("\"\\s*?{\\s*?" + vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelname") + "\\s*?>\\s*?(.*?)\\s*?}\\s*?\"", "g");
            let match: RegExpMatchArray;
            let ret: I18nDiagnostic[] = []
            while (match = i18nreg.exec(text))
                if (!Storage.i18n.labels[match[1]]) {
                    ret.push({
                        range: this.getRange(document, match.index, match[0].length),
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
    diagXmlChecker(document: TextDocument): Diagnostic[] {
        try {
            xmlChecker.check(document.getText());
            return [];
        } catch (error) {
            let err = error as XmlCheckerError;
            err.line--;
            err.column--;
            console.log(JSON.stringify(error));
            return [new Diagnostic(new Range(err.line, err.column, err.line, document.lineAt(err.line).text.length - 1), err.message, DiagnosticSeverity.Warning)];
        }
    }

    diagXml2Js(document: TextDocument): Promise<Diagnostic[]> {
        return new Promise((resolve, reject) => {
            xml2js.parseString(document.getText(), { xmlns: true }, (error, result) => {
                if (error) {
                    // let namespaces = getNamespaces(result);
                    let errorlines = error.message.split("\n");
                    error.message = errorlines[0];
                    error.Line = Number(errorlines[1].match(/\d+/));
                    error.Column = Number(errorlines[2].match(/\d+/));
                    let char = errorlines[3].split(":")[1];
                    if (char)
                        error.message += "Character: '" + char + "'";
                    resolve([new Diagnostic(new Range(error.Line, error.Column, document.lineCount, document.lineAt(document.lineCount - 1).text.length - 1), error.message, DiagnosticSeverity.Error)])
                }
                resolve([]);
            });
        });


    }

    async getNamespaces(document: TextDocument): Promise<Diagnostic[]> {
        let match: RegExpMatchArray;
        // Group 1: namespace abbrevation
        // Group 2: namespace name
        let xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g
        let doc: string = document.getText();
        if (!Storage.schemastore)
            Storage.schemastore = new Schemastore(this.context.asAbsolutePath("schemastore"));
        let hits: Diagnostic[] = []
        while (match = xmlnsregex.exec(doc)) {
            if (Storage.schemastore.schemas.findIndex((val) => val.targetNamespace === match[2]) < 0) {
                hits.push(new Diagnostic(new Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length)), "Could not find definition file in storage. Add using the add to storage command.", vscode.DiagnosticSeverity.Warning));
            }
        }
        return hits;
    }
}

