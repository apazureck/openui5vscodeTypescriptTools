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
        this.modelfile = Uri.parse("file:///" + path.join(vscode.workspace.rootPath, this.modelfilename));
        let content = fs.readFileSync(this.modelfile.fsPath, "utf-8").split("\n");
        this.linecount = 0;
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

export interface I18nDiagnostic extends Diagnostic {
    label: string;
}

export namespace Storage {
    export const i18n: I18nLabelStorage = new I18nLabelStorage();
}

export class I18nDiagnosticProvider implements IDiagnose {
    constructor(public diagnosticCollection: DiagnosticCollection) {

    }

    public diagnose(document: TextDocument) {
        this.diagnosticCollection.delete(document.uri);
        this.diagnosticCollection.set(document.uri, this.diagi18n(document));
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
} 