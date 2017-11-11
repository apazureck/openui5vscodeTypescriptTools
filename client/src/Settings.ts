/*!
 * OpenUI5 Extension for VSCode
 * (c) Copyright 2009-2017 https://github.com/apazureck/
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

import { workspace } from "vscode";

/** Global log level definition */
export enum LogLevel {
    Debug, Information, Warning, Error, None,
}

export type VsCodeSeverityLevel = "Error" | "Information" | "Warning" | "Hint";

export class Settings {
    private config = workspace.getConfiguration("ui5ts");
    /** Filter defines the excluded folders while finding ui5 components. Note: no spaces after comma */
    get Excludefilter() : string {
        return this.config.get("excludefilter", "**/{bower_components,node_modules,resources}/**");
    }
    /** Gets the ui5 manifest.json from the given location */
    get Manifestlocation() : string {
        return this.config.get("manifestlocation", null);
    }
    /** Gets the modelname for translations */
    get Modelname_i18n(): string {
        return this.config.get("lang.i18n.modelname", "i18n");
    }
    /** Gets the location of the modelfile */
    get Modelfilelocation_i18n(): string {
        return this.config.get("lang.i18n.modelfilelocation", "./i18n/i18n.properties");
    }
    /** Gets the log level for the XML-Server */
    get LogLevel_xml(): LogLevel {
        return this.config.get("lang.xml.LogLevel", 4);
    }
    /** Gets exteded function not for production */
    get Insiders(): boolean {
        return this.config.get("insiders", false);
    }
    /** Gets the log level for the linter */
    get Linter_Controller_xml(): VsCodeSeverityLevel {
        return this.config.get("lang.xml.linter.controller", "Error");
    }
}