import { IDiagnose } from '../../extension';
import * as vscode from 'vscode'
import { Ui5ManifestBase } from '../../baseclasses';
import * as path from 'path';
import { DiagnosticCollection, TextDocumentChangeEvent, Diagnostic, DiagnosticSeverity, Range } from 'vscode';
import * as extension from '../../extension';

export class ManifestDiagnostics extends Ui5ManifestBase implements IDiagnose {
    constructor(public diagnosticCollection: DiagnosticCollection) {
        super();
    }

    diagnose(document: vscode.TextDocument) {
        if(path.basename(document.fileName) != "manifest.json")
            return;

        try {
            this.diagnosticCollection.clear();
            let diag: Diagnostic[] = [];

            let text = document.getText();
            let jcontent: Manifest = JSON.parse(text);
            let targets = this.getTargets(jcontent);
            for(let route of jcontent["sap.ui5"].routing.routes) {
                try {
                    if(!targets.find((val) => val === route.target))
                        diag.push({
                            message: "Target '" + route.target + "' could not be found. Check your 'sap.ui5.targets' section for the correct key or define the target there.",
                            range: this.getRange(text, new RegExp("\"target\"\\s*:\\s*[\"']?(" + route.target + ")"), 1)[0],
                            severity: DiagnosticSeverity.Error,
                            source: route.name,
                            code: "newCode123"
                        });
                } catch (error) {
                    
                }
            }

            let views = this.getViews();

            for(let tname in jcontent["sap.ui5"].routing.targets) {
                let targetview = jcontent["sap.ui5"].routing.targets[tname];
                let fullname = jcontent["sap.ui5"].routing.config.viewPath + "." + targetview.viewName;
                if(!views.find(x => x.name == fullname))
                    try {
                        diag.push({ range: this.getRange(text, new RegExp("\"viewName\"\\s*:\\s*[\"']?(" + targetview.viewName + ")"), 1)[0], message: "TargetView not found.", severity: vscode.DiagnosticSeverity.Error, code: "newCode234", source: tname});
                    } catch (error) {
                        
                    }
            }

            if(diag.length>0)
                this.diagnosticCollection.set(document.uri, diag);
                if(jcontent)
                    extension.core.manifest = jcontent;
        } catch (error) {

        }
    }
}