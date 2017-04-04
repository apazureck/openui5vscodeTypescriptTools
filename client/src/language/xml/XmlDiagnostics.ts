import { Message } from "_debugger";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
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
    Uri,
} from "vscode";
import * as xml2js from "xml2js";
import * as xmlChecker from "xmlChecker";
import { IDiagnose, ui5tsglobal } from "../../extension";
import * as extension from "../../extension";
import { File } from "../../helpers/filehandler";

export interface I18nLabel {
    text: string;
    line: number;
}
export class I18nLabelStorage {
    public get Labels(): { [label: string]: I18nLabel } {
        if (!this.labels) {
            this.create();
        } else {
            return this.labels;
        }
    }
    public modelfilename: string;
    public modelfile: Uri;
    public linecount: number;
    private labels: { [label: string]: I18nLabel };

    constructor() {
        try {
            this.create();
        } catch (error) {
            console.log(error.toString());
            // do nothing
        }
    }

    public create() {
        this.modelfilename = vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelfilelocation") as string || "./i18n/i18n.properties";
        const root = ui5tsglobal.core.absoluteRootPath;
        this.modelfile = Uri.file(path.join(root, this.modelfilename));
        const content = fs.readFileSync(this.modelfile.fsPath, "utf-8").split("\n");
        this.linecount = 0;
        this.labels = {};
        for (const line of content) {
            const match = line.match(/^(.*?)\s*=\s*(.*)/);
            if (match)
                this.Labels[match[1]] = {
                    line: this.linecount,
                    text: match[2],
                };
            this.linecount++;
        }
    }

    public addNewLabel(label: string, text: string) {
        if (this.Labels[label])
            throw new Error("Label already exists");

        const modelfilename = vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelfilelocation") as string || "./i18n/i18n.properties";
        fs.appendFileSync(path.join(ui5tsglobal.core.absoluteRootPath, this.modelfilename), "\n" + label + "=" + text);
        this.Labels[label] = {
            line: this.linecount++,
            text,
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

    public diagi18n(document: TextDocument): Diagnostic[] {
        try {
            const text = document.getText();
            const i18nreg = new RegExp("\"\\s*?{\\s*?" + vscode.workspace.getConfiguration("ui5ts").get("lang.i18n.modelname") + "\\s*?>\\s*?(.*?)\\s*?}\\s*?\"", "g");
            let match: RegExpMatchArray;
            const ret: I18nDiagnostic[] = [];
            while (match = i18nreg.exec(text))
                if (!Storage.i18n.Labels[match[1]]) {
                    ret.push({
                        code: "i18nLabelMissing",
                        label: match[1],
                        message: "Label " + match[1] + " does not exist",
                        range: this.getRange(document, match.index, match[0].length),
                        severity: DiagnosticSeverity.Warning,
                        source: "ui5ts",
                    });
                }
            return ret;
        } catch (error) {
            // Do nothing
        }
    }

    public getRange(document: TextDocument, startIndex: number, length: number): Range {
        return new Range(document.positionAt(startIndex), document.positionAt(startIndex + length));
    }
}