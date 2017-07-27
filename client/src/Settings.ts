import { workspace } from "vscode";

export enum LogLevel {
    Debug, Information, Warning, Error, None,
}

export type VsCodeSeverityLevel = "Error" | "Information" | "Warning" | "Hint";
export class Settings {
    private config = workspace.getConfiguration("ui5ts");
    get manifestlocation(): string {
        return this.config.get<string>("manifestlocation", null);
    }
    set manifestlocation(absolutepath: string) {
        (this.config as any).update("manifestlocation", workspace.asRelativePath(absolutepath));
    }
    get "lang.i18n.modelname"(): string {
        return this.config.get("lang.i18n.modelname", "i18n") as string;
    }
    get "lang.i18n.modelfilelocation"(): string {
        return this.config.get("lang.i18n.modelfilelocation", "./i18n/i18n.properties") as string;
    }
    get "lang.xml.LogLevel"(): LogLevel {
        return this.config.get("lang.xml.LogLevel", 4) as LogLevel;
    }
    get insiders(): boolean {
        return this.config.get("insiders", false) as boolean;
    }

    get "lang.xml.linter.controller"(): VsCodeSeverityLevel {
        return this.config.get("lang.xml.linter.controller", "Error") as VsCodeSeverityLevel;
    }
}