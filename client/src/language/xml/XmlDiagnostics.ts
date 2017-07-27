import { Settings } from '../../Settings';
import { Message } from "_debugger";
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
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
import * as xml2js from 'xml2js';
import * as xmlChecker from 'xmlChecker';
import { IDiagnose, ui5tsglobal } from "../../extension";
import * as extension from '../../extension';
import { File } from "../../helpers/filehandler";
import { getController } from "../searchFunctions";

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
        this.linecount = 0;
        this.labels = {};
        try {
            this.modelfilename = ui5tsglobal.config["lang.i18n.modelfilelocation"] as string || "./i18n/i18n.properties";
            const root = ui5tsglobal.core.absoluteRootPath;
            this.modelfile = Uri.file(path.join(root, this.modelfilename));
            const content = fs.readFileSync(this.modelfile.fsPath, "utf-8").split("\n");

            for (const line of content) {
                const match = line.match(/^(.*?)\s*=\s*(.*)/);
                if (match)
                    this.Labels[match[1]] = {
                        line: this.linecount,
                        text: match[2],
                    };
                this.linecount++;
            }
        } catch (error) {
            // Do nothing
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

    private diagi18n(document: TextDocument): Diagnostic[] {
        try {
            const text = document.getText();
            const i18nreg = new RegExp("\"\\s*?{\\s*?" + ui5tsglobal.config["lang.i18n.modelname"] + "\\s*?>\\s*?(.*?)\\s*?}\\s*?\"", "g");
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

    private getRange(document: TextDocument, startIndex: number, length: number): Range {
        return new Range(document.positionAt(startIndex), document.positionAt(startIndex + length));
    }
}

export class ControllerDiagnosticsProvider implements IDiagnose {
    constructor(public diagnosticCollection: DiagnosticCollection) {
    }

    public async diagnose(document: TextDocument) {
        this.diagnosticCollection.delete(document.uri);
        this.diagnosticCollection.set(document.uri, await this.diagController(document));
    }

    private async diagController(document: TextDocument): Promise<Diagnostic[]> {
        const text = document.getText();
        // 1: text before controller name
        // 2: quotes
        // 2: controller name as namespace
        const mController = text.match(/(\bcontrollerName\b\s*=\s*("|'))([\w\.]+?)\2/);
        if (mController) {
            const controllers = await getController(document);
            if ((!controllers) || controllers.length < 1) {
                return [new Diagnostic(this.getRange(document, mController.index + mController[1].length, mController[3].length), "Could not find corresponding controller", vscode.DiagnosticSeverity[ui5tsglobal.config["lang.xml.linter.controller"]])];
            }
        }
        return [];
    }

    private getRange(document: TextDocument, startIndex: number, length: number): Range {
        return new Range(document.positionAt(startIndex), document.positionAt(startIndex + length));
    }
}
