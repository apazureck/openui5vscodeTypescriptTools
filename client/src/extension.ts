"use strict";
import { CallbackRenameProvider } from './language/ui5/Ui5RenameProviders';
import * as fs from 'fs';
import * as path from 'path';
import {
    commands,
    DiagnosticCollection,
    DocumentFilter,
    ExtensionContext,
    languages,
    QuickPickItem,
    TextDocument,
    TextDocumentChangeEvent,
    Uri,
    window,
    workspace,
    WorkspaceConfiguration,
} from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, SettingMonitor, TransportKind } from "vscode-languageclient";
import { AddI18nLabel, AddSchemaToStore, ResetI18nStorage, SwitchToController, SwitchToView } from "./commands";
import * as file from './helpers/filehandler';
import * as log from './helpers/logging';
import { ModuleReferenceProvider } from "./language/js/ModuleReferenceProvider";
import { I18NCompletionItemProvider } from "./language/ui5/Ui5CompletionProviders";
import {
    EventCallbackDefinitionProvider,
    I18nDfinitionProvider,
    Ui5ViewDefinitionProvider,
    ViewControllerDefinitionProvider,
    ViewFragmentDefinitionProvider,
} from "./language/ui5/Ui5DefinitionProviders";
import * as defprov from './language/ui5/Ui5DefinitionProviders';
import { ManifestCompletionItemProvider } from "./language/ui5/Ui5ManifestCompletionProviders";
import { ManifestDiagnostics } from "./language/ui5/Ui5ManifestDiagnostics";
import { Ui5EventHandlerCodeLensProvider } from "./language/ui5/Ui5TsCodeLensProviders";
import { I18nCodeActionprovider } from "./language/xml/XmlActionProviders";
import { I18nDiagnosticProvider } from "./language/xml/XmlDiagnostics";
import { Settings } from "./Settings";
import { Ui5Extension } from "./UI5Extension";

export interface IDiagnose {
    diagnosticCollection: DiagnosticCollection;
    diagnose(document: TextDocument);
}

// tslint:disable-next-line:no-namespace
export namespace ui5tsglobal {
    export const name = "ui5-ts";
    export const core: Ui5Extension = new Ui5Extension();
    export let config: Settings = new Settings();
}

const ui5JsonViews: DocumentFilter = { language: "json", scheme: "file", pattern: "*.view.json" };

const ui5TsControllers: DocumentFilter = { language: "typescript", scheme: "file", pattern: "**/*.controller.ts" };
const ui5JsControllers: DocumentFilter = { language: "javascript", scheme: "file", pattern: "**/*.controller.js" };
const ui5JsonFragments: DocumentFilter = { language: "json", scheme: "file", pattern: "**/*.{fragment,view}.json" };

const ui5Xml: DocumentFilter = { language: "xml", scheme: "file", pattern: "**/*.{fragment,view}.xml" };
const ui5View: DocumentFilter = { language: "xml", scheme: "file", pattern: "**/*.view.xml" };
const ui5Fragment: DocumentFilter = { language: "xml", scheme: "file", pattern: "**/*.fragment.xml" };

const ui5Manifest: DocumentFilter = { language: "json", scheme: "file", pattern: "**/manifest.json" };

const javascript: DocumentFilter = { language: "javascript", scheme: "file" };

export let channel = window.createOutputChannel("UI5 TS Extension");
let context: ExtensionContext;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(c: ExtensionContext) {
    context = c;
    ui5tsglobal.core.extensionPath = c.extensionPath;
    ui5tsglobal.core.schemaStoragePath = c.asAbsolutePath("schemastore");
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log("Activating UI5 extension.");

    // Subscribe to workspace config changed configuration
    workspace.onDidChangeConfiguration(e => onDidChangeConfiguration());
    onDidChangeConfiguration();

    startXmlViewLanguageServer(context);
    // startManifestLanguageServer();

    // Hook the commands
    // context.subscriptions.push(commands.registerCommand('ui5ts.SetupUi5', commands.SetupUi5));
    c.subscriptions.push(commands.registerTextEditorCommand("ui5ts.SwitchToView", SwitchToView.bind(context)));
    c.subscriptions.push(commands.registerTextEditorCommand("ui5ts.SwitchToController", SwitchToController.bind(context)));
    c.subscriptions.push(commands.registerCommand("ui5ts.AddSchemaToStorage", AddSchemaToStore.bind(context)));
    c.subscriptions.push(commands.registerCommand("ui5ts.CreateNewI18nLabel", AddI18nLabel.bind(context)));
    c.subscriptions.push(commands.registerCommand("ui5ts.ResetI18NStorage", ResetI18nStorage.bind(context)));

    // Setup Language Providers
    console.log("Creating I18N Provider!");
    c.subscriptions.push(languages.registerCodeActionsProvider(ui5Xml, new I18nCodeActionprovider()));

    // c.subscriptions.push(languages.registerCompletionItemProvider([ui5_xmlviews, ui5_xmlfragments], new Ui5i18nCompletionItemProvider));

    const diags: IDiagnose[] = [new ManifestDiagnostics(languages.createDiagnosticCollection("json")), new I18nDiagnosticProvider(languages.createDiagnosticCollection("i18n"))];

    createDiagnosticSubscriptions(c, diags);

    workspace.onDidSaveTextDocument((doc) => {
        if (!doc.fileName.endsWith(".properties"))
            return;

        ResetI18nStorage();
        for (const otd of workspace.textDocuments)
            for (const diag of diags)
                diag.diagnose(otd);
    });

    // Completionitemproviders
    c.subscriptions.push(languages.registerCompletionItemProvider(ui5Manifest, new ManifestCompletionItemProvider()));
    c.subscriptions.push(languages.registerCompletionItemProvider(ui5Xml, new I18NCompletionItemProvider()));

    // Definitionproviders
    c.subscriptions.push(languages.registerDefinitionProvider(ui5View, new ViewFragmentDefinitionProvider()));
    c.subscriptions.push(languages.registerDefinitionProvider(ui5View, new ViewControllerDefinitionProvider()));
    c.subscriptions.push(languages.registerDefinitionProvider(ui5Xml, new I18nDfinitionProvider()));
    c.subscriptions.push(languages.registerDefinitionProvider(ui5Xml, new Ui5ViewDefinitionProvider()));
    c.subscriptions.push(languages.registerDefinitionProvider(ui5Xml, new EventCallbackDefinitionProvider()));

    // CodeLens Providers
    c.subscriptions.push(languages.registerCodeLensProvider(ui5TsControllers, new Ui5EventHandlerCodeLensProvider()));

    // Rename Providers
    if (ui5tsglobal.config.insiders) {
        c.subscriptions.push(languages.registerRenameProvider(ui5TsControllers, new CallbackRenameProvider()));
    }

    if (ui5tsglobal.config.insiders) {
        c.subscriptions.push(languages.registerReferenceProvider(javascript, new ModuleReferenceProvider()));
    }
}

function onDidChangeConfiguration() {
    getManifestLocation();
    getAllNamespaceMappings();
    ResetI18nStorage();
}

function createDiagnosticSubscriptions(c: ExtensionContext, diags: IDiagnose[]) {
    for (const diag of diags) {
        c.subscriptions.push(diag.diagnosticCollection);
        workspace.onDidChangeTextDocument((changes: TextDocumentChangeEvent) => {
            diag.diagnose(changes.document);
        });
        workspace.onDidOpenTextDocument(diag.diagnose.bind(diag));
    }
    for (const otd of workspace.textDocuments)
        for (const diag of diags)
            diag.diagnose(otd);
}

async function getManifestLocation() {
    try {
        // Get manifest location if not set in workspace settings.
        if (!ui5tsglobal.config.manifestlocation) {
            const workspaceroot = workspace.rootPath;
            const manifest = await workspace.findFiles("**/manifest.json", "");
            let val: string;
            if (manifest.length < 1) {
                window.showWarningMessage("Could not find any manifest.json in your project. Please set the path to your manifest.json file in the workspace settings.");
                return;
            } else if (manifest.length > 1) {
                window.showInformationMessage("Multiple manifests found");
                val = (await window.showQuickPick(manifest.map(x => ({ label: path.relative(workspace.rootPath, x.fsPath), description: x.fsPath })) as QuickPickItem[], { ignoreFocusOut: true })).label;
                window.showInformationMessage("Set manifest.json path to workspace settings");
            } else {
                val = manifest[0].fsPath;
            }
            ui5tsglobal.config.manifestlocation = val;
        }
        if (ui5tsglobal.config.manifestlocation) {
            // window.showInformationMessage("UI5ts is using '" + (path.dirname(ui5tsglobal.config.get("manifestlocation") as string).length > 0 ? path.dirname(ui5tsglobal.config.get("manifestlocation") as string) : "./") + "' as project location. You can change that in your workspace settings.");
            ui5tsglobal.core.absoluteRootPath = path.dirname(path.join(workspace.rootPath, ui5tsglobal.config.manifestlocation));
            ui5tsglobal.core.relativeRootPath = path.dirname(ui5tsglobal.config.manifestlocation as string);
        }

    } catch (error) {
        // Do nothing
    }
}

async function getAllNamespaceMappings() {
    ui5tsglobal.core.namespacemappings = {};
    // search all html files
    const docs = await (workspace as any).findFiles("**/*.{html,htm}");
    for (const doc of docs) {
        try {
            const text = (await workspace.openTextDocument(doc)).getText();
            // get script html tag with data-sap-ui-resourceroots
            const scripttag = text.match(/<\s*script[\s\S]*sap-ui-core[\s\S]*data-sap-ui-resourceroots[\s\S]*?>/m)[0];
            if (!scripttag)
                continue;
            const resourceroots = scripttag.match(/data-sap-ui-resourceroots.*?['"][\s\S]*?{([\s\S]*)}[\s\S]*['"]/m)[1];
            if (!resourceroots)
                continue;
            for (const rr of resourceroots.split(",")) {
                const entry = rr.split(":");
                const key = entry[0].trim();
                const val = entry[1].trim();
                log.printInfo("Found " + key + " to replace with " + val);
                ui5tsglobal.core.namespacemappings[key.substr(1, key.length - 2)] = val.substr(1, val.length - 2);
            }
        } catch (error) {
            // Do nothing;
        }
    }
    console.info(ui5tsglobal.core.namespacemappings);
}

// this method is called when your extension is deactivated
// export function deactivate() {
// }

function startXmlViewLanguageServer(c: ExtensionContext): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        // The server is implemented in node
        log.printInfo("Staring XML View language server");
        const serverModule = c.asAbsolutePath(path.join("server", "server.js"));
        // The debug options for the server
        const debugOptions = { storagepath: c.asAbsolutePath("schemastore"), execArgv: ["--nolazy", "--debug=6009"] };

        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        const serverOptions: ServerOptions = {
            debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
            run: { module: serverModule, transport: TransportKind.ipc },
        };

        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for xml decuments documents
            diagnosticCollectionName: "xmlDiagnostics",
            documentSelector: ["xml", "xsd"],
            initializationOptions: { storagepath: c.asAbsolutePath("schemastore") },
            synchronize: {
                // Synchronize the setting section "languageServerExample" to the server
                configurationSection: "ui5ts",
                // Notify the server about file changes to '.clientrc files contain in the workspace
                fileEvents: workspace.createFileSystemWatcher("**/*.{xml,xsd}", false, false, false),
            },
        };

        // Create the language client and start the client.
        const disposable = new LanguageClient("XmlLangServer", serverOptions, clientOptions);
        // Push the disposable to the context's subscriptions so that the
        // client can be deactivated on extension deactivation
        c.subscriptions.push(disposable.start());
    });

}

/**
 * Initialization options for the xml language server
 *
 * @interface XmlInitOptions
 */
interface IXmlInitOptions {
    /**
     * asolute path to the folder of the xsd files
     *
     * @type {string}
     * @memberOf XmlInitOptions
     */
    storagepath: string;
}
