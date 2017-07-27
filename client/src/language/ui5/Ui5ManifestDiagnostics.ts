import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as vscode from "vscode";
import { Diagnostic, DiagnosticCollection, DiagnosticSeverity, Range, TextDocumentChangeEvent } from "vscode";
import { Ui5ManifestBase } from "../../baseclasses";
import { IDiagnose } from "../../extension";
import { ui5tsglobal } from "../../extension";

export class ManifestDiagnostics extends Ui5ManifestBase implements IDiagnose {
    constructor(public diagnosticCollection: DiagnosticCollection) {
        super();
    }

    public async diagnose(document: vscode.TextDocument) {
        if (path.basename(document.fileName) !== "manifest.json")
            return;

        try {
            this.diagnosticCollection.clear();
            const diag: Diagnostic[] = [];

            const text = document.getText();
            const jcontent: Manifest = JSON.parse(text);
            const targets = this.getTargets(jcontent);
            for (const route of jcontent["sap.ui5"].routing.routes) {
                try {
                    if (!targets.find((val) => val === route.target))
                        diag.push({
                            code: "",
                            message: "Target '" + route.target + "' could not be found. Check your 'sap.ui5.targets' section for the correct key or define the target there.",
                            range: this.getRange(text, new RegExp("\"target\"\\s*:\\s*[\"']?(" + route.target + ")"), 1)[0],
                            severity: DiagnosticSeverity.Error,
                            source: route.name,
                        });
                } catch (error) {
                    // Do nothing
                }
            }

            for (const tname in jcontent["sap.ui5"].routing.targets) {
                if (tname) {
                    const targetview = jcontent["sap.ui5"].routing.targets[tname];
                    const fullname = jcontent["sap.ui5"].routing.config.viewPath + "." + targetview.viewName;
                    const vpath = ui5tsglobal.core.GetRelativePath(fullname);
                    if (glob.sync(path.join(vscode.workspace.rootPath, vpath + ".view.{xml,json}")).length < 1) {
                        try {
                            diag.push({ range: this.getRange(text, new RegExp("\"viewName\"\\s*:\\s*[\"']?(" + targetview.viewName + ")"), 1)[0], message: "TargetView not found.", severity: vscode.DiagnosticSeverity.Error, code: "newCode234", source: tname });
                        } catch (error) {
                            // Do nothing
                        }
                    }
                }
            }

            if (diag.length > 0)
                this.diagnosticCollection.set(document.uri, diag);
            if (jcontent)
                ui5tsglobal.core.manifest = jcontent;
        } catch (error) {
            // Do nothing
        }
    }
}
