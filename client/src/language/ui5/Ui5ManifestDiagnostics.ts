import { IDiagnose } from '../../extension';
import * as vscode from 'vscode'
import { Ui5ManifestBase } from '../../baseclasses';
import * as path from 'path';
import { DiagnosticCollection, TextDocumentChangeEvent, Diagnostic, DiagnosticSeverity, Range } from 'vscode';
import { ui5tsglobal } from '../../extension';

export class ManifestDiagnostics extends Ui5ManifestBase implements IDiagnose {
    constructor(public diagnosticCollection: DiagnosticCollection) {
        super();
    }

    public diagnose(document: vscode.TextDocument) {
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
                            code: "newCode123",
                            message: "Target '" + route.target + "' could not be found. Check your 'sap.ui5.targets' section for the correct key or define the target there.",
                            range: this.getRange(text, new RegExp("\"target\"\\s*:\\s*[\"']?(" + route.target + ")"), 1)[0],
                            severity: DiagnosticSeverity.Error,
                            source: route.name
                        });
                } catch (error) {
                    // Do nothing
                }
            }

            const views = this.getViews();

            // tslint:disable-next-line:forin
            for (const tname in jcontent["sap.ui5"].routing.targets) {
                const targetview = jcontent["sap.ui5"].routing.targets[tname];
                const fullname = jcontent["sap.ui5"].routing.config.viewPath + "." + targetview.viewName;
                if (!views.find(x => x.name === fullname))
                    try {
                        diag.push({ range: this.getRange(text, new RegExp("\"viewName\"\\s*:\\s*[\"']?(" + targetview.viewName + ")"), 1)[0], message: "TargetView not found.", severity: vscode.DiagnosticSeverity.Error, code: "newCode234", source: tname });
                    } catch (error) {
                        // Do nothing
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