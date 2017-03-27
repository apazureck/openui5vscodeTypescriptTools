'use strict';
import { I18nDiagnosticProvider } from './language/xml/XmlDiagnostics';
import {
    I18nDfinitionProvider,
    Ui5ViewDefinitionProvider,
    ViewControllerDefinitionProvider,
    ViewFragmentDefinitionProvider
} from './language/ui5/Ui5DefinitionProviders';
import { AddI18nLabel, AddSchemaToStore, ResetI18nStorage, SwitchToController, SwitchToView } from './commands';
import {
    commands,
    DiagnosticCollection,
    DocumentFilter,
    ExtensionContext,
    languages,
    TextDocument,
    TextDocumentChangeEvent,
    Uri,
    window,
    workspace,
    WorkspaceConfiguration
} from "vscode";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as file from './helpers/filehandler';
import * as fs from 'fs';
import * as log from './helpers/logging';
import * as defprov from './language/ui5/Ui5DefinitionProviders';
// import * as mcp from './language/ui5/ManifestCompletionItemProvider';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';
import * as path from 'path';
import { ManifestDiagnostics } from './language/ui5/Ui5ManifestDiagnostics'
import { I18NCompletionItemProvider } from './language/ui5/Ui5CompletionProviders'
import { ManifestCompletionItemProvider } from './language/ui5/Ui5ManifestCompletionProviders'
import { I18nCodeActionprovider } from './language/xml/XmlActionProviders'

export interface IDiagnose {
    diagnosticCollection: DiagnosticCollection;
    diagnose(document: TextDocument);
}

export class Ui5Extension {
    public namespacemappings?: { [id: string]: string; };
    public manifest?: Manifest;
    public extensionPath?: string;
    public schemaStoragePath?: string;
    /**
     * Relative path to the ui5 project root (level of manifest.json)
     * @type {string}
     * @memberOf Ui5Extension
     */
    public relativeRootPath: string;
    /**
     * Absolute path to the ui5 project root
     * @type {string}
     * @memberOf Ui5Extension
     */
    public absoluteRootPath: string;

    /**
     * Creates a relative workspace path to manifest.json file from the namespace
     *
     * @param {string} path
     * @returns {string}
     *
     * @memberOf Ui5Extension
     */
    public CreateRelativePath(namespace: string): string {
        for (const map in this.namespacemappings) {
            if (namespace.startsWith(map)) {
                const relpath = path.normalize(path.join(ui5tsglobal.core.relativeRootPath, namespace.replace(map, this.namespacemappings[map]).replace(/\./g, "/").replace(/\/\/+/g, "/")));
                if (relpath.startsWith("/") || relpath.startsWith("\\"))
                    return relpath.substring(1).replace(/\\/g, "/");
                else
                    return relpath.replace(/\\/g, "/");
            }
        }
    }

    public GetFullNameByFile(file: string): string {
        const m = path.dirname(ui5tsglobal.core.absoluteRootPath);
        const fn = path.dirname(file);
        const rel = "./" + path.relative(m, fn).replace("\\", "/") + "/" + path.basename(window.activeTextEditor.document.fileName);
        // rel = rel.replace(/\.controller\.(ts|fs)$/, "").replace(/[\/\\]/g, ".");
        const sources: { k: string, v: string }[] = [];
        for (const ns in ui5tsglobal.core.namespacemappings) {
            let relsource = ui5tsglobal.core.namespacemappings[ns];
            if (rel.startsWith(relsource))
                sources.push({ k: relsource, v: ns });
        }
        let bestmatch;
        if (sources.length > 1) {
            bestmatch = sources.sort((a, b) => a.k.length - b.k.length).pop();
        } else
            bestmatch = sources[0];
        return bestmatch.v + "." + rel.substring(2).replace(/\.controller\.(ts|fs)$/, "").replace(/[\/\\]/g, ".");
    }
}

// tslint:disable-next-line:no-namespace
export namespace ui5tsglobal {
    export const name = "ui5-ts";
    export const core: Ui5Extension = new Ui5Extension();

    export var config: WorkspaceConfiguration;

}

const ui5_jsonviews: DocumentFilter = { language: 'json', scheme: 'file', pattern: "*.view.json" };

const ui5_tscontrollers: DocumentFilter = { language: 'typescript', scheme: 'file', pattern: "**/*.controller.ts" };
const ui5_jscontrollers: DocumentFilter = { language: 'javascript', scheme: 'file', pattern: "**/*.controller.js" };
const ui5_jsonfragments: DocumentFilter = { language: 'json', scheme: 'file', pattern: "**/*.{fragment,view}.json" };

const ui5_xml: DocumentFilter = { language: "xml", scheme: 'file', pattern: "**/*.{fragment,view}.xml" };
const ui5_view: DocumentFilter = { language: "xml", scheme: "file", pattern: "**/*.view.xml" };
const ui5_fragment: DocumentFilter = { language: "xml", scheme: "file", pattern: "**/*.fragment.xml" };

const ui5_manifest: DocumentFilter = { language: "json", scheme: 'file', pattern: "**/manifest.json" };

export var channel = window.createOutputChannel("UI5 TS Extension");
var context: ExtensionContext;

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
    c.subscriptions.push(languages.registerCodeActionsProvider(ui5_xml, new I18nCodeActionprovider()));

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
    c.subscriptions.push(languages.registerCompletionItemProvider(ui5_manifest, new ManifestCompletionItemProvider()));
    c.subscriptions.push(languages.registerCompletionItemProvider(ui5_xml, new I18NCompletionItemProvider()));

    // Definitionproviders
    c.subscriptions.push(languages.registerDefinitionProvider(ui5_view, new ViewFragmentDefinitionProvider()));
    c.subscriptions.push(languages.registerDefinitionProvider(ui5_view, new ViewControllerDefinitionProvider()));
    c.subscriptions.push(languages.registerDefinitionProvider(ui5_xml, new I18nDfinitionProvider()));
    c.subscriptions.push(languages.registerDefinitionProvider(ui5_xml, new Ui5ViewDefinitionProvider()));
}

function onDidChangeConfiguration() {
    ui5tsglobal.config = workspace.getConfiguration("ui5ts");
    getManifestLocation();
    getAllNamespaceMappings();
    ResetI18nStorage();
}

function createDiagnosticSubscriptions(c: ExtensionContext, diags: IDiagnose[]) {
    for (let diag of diags) {
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
        if (!ui5tsglobal.config.get("manifestlocation")) {
            const workspaceroot = workspace.rootPath;
            const manifest = await workspace.findFiles("**/manifest.json", "").then(async (value) => {
                let val: string;
                if (value.length < 1) {
                    window.showWarningMessage("Could not find any manifest.json in your project. Please set the path to your manifest.json file in the workspace settings.");
                    return;
                } else if (value.length > 1) {
                    val = await window.showQuickPick(value.map(x => x.fsPath));
                } else {
                    val = value[0].fsPath;
                }
                await (ui5tsglobal.config as any).update("manifestlocation", workspace.asRelativePath(val));
            });
        }
        if (ui5tsglobal.config.get("manifestlocation")) {
            ui5tsglobal.core.absoluteRootPath = path.dirname(path.join(workspace.rootPath, ui5tsglobal.config.get("manifestlocation") as string));
            ui5tsglobal.core.relativeRootPath = path.dirname(ui5tsglobal.config.get("manifestlocation") as string);
        }

    } catch (error) {
        // Do nothing
    }
}

async function getAllNamespaceMappings() {
    ui5tsglobal.core.namespacemappings = {};
    // search all html files
    const docs = await file.File.find(".*\\.(html|htm)$");
    for (const doc of docs) {
        try {
            const text = (await workspace.openTextDocument(Uri.parse("file:///" + doc))).getText();
            // get script html tag with data-sap-ui-resourceroots
            const scripttag = text.match(/<\s*script[\s\S]*sap-ui-core[\s\S]*data-sap-ui-resourceroots[\s\S]*?>/m)[0];
            if (!scripttag)
                continue;
            const resourceroots = scripttag.match(/data-sap-ui-resourceroots.*?['"][\s\S]*?{([\s\S]*)}[\s\S]*['"]/m)[1];
            if (!resourceroots)
                continue;
            for (let rr of resourceroots.split(",")) {
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
export function deactivate() {

}

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
            initializationOptions: { storagepath: c.asAbsolutePath("schemastore") } as XmlInitOptions,
            synchronize: {
                // Synchronize the setting section "languageServerExample" to the server
                configurationSection: "ui5ts",
                // Notify the server about file changes to '.clientrc files contain in the workspace
                fileEvents: workspace.createFileSystemWatcher("**/*.{xml,xsd}", false, false, false)
            }
        };

        // Create the language client and start the client.
        const disposable = new LanguageClient("XmlLangServer", serverOptions, clientOptions);
        // Push the disposable to the context's subscriptions so that the
        // client can be deactivated on extension deactivation
        c.subscriptions.push(disposable.start());
    })

}

/**
 * Initialization options for the xml language server
 * 
 * @interface XmlInitOptions
 */
interface XmlInitOptions {
    /**
     * asolute path to the folder of the xsd files
     * 
     * @type {string}
     * @memberOf XmlInitOptions
     */
    storagepath: string;
}