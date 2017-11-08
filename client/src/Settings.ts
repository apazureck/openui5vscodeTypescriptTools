import { workspace } from "vscode";

export enum LogLevel {
    Debug, Information, Warning, Error, None,
}

export type VsCodeSeverityLevel = "Error" | "Information" | "Warning" | "Hint";

export class Settings {
    private config = workspace.getConfiguration("ui5ts");
    get Manifestlocation() : string {
        return this.config.get("manifestlocation", null);
    }
    get Modelname_i18n(): string {
        return this.config.get("lang.i18n.modelname", "i18n");
    }
    get Modelfilelocation_i18n(): string {
        return this.config.get("lang.i18n.modelfilelocation", "./i18n/i18n.properties");
    }
    get LogLevel_xml(): LogLevel {
        return this.config.get("lang.xml.LogLevel", 4);
    }
    get Insiders(): boolean {
        return this.config.get("insiders", false);
    }
    get Linter_Controller_xml(): VsCodeSeverityLevel {
        return this.config.get("lang.xml.linter.controller", "Error");
    }
}