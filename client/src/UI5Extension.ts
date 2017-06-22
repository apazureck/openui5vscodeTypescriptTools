import * as path from "path";
import { window } from "vscode";
import { ui5tsglobal } from "./extension";

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
    public GetRelativePath(namespace: string): string {
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

    /**
     * Returns the full namespace of a project file by using the filename
     *
     * @param {string} file file to get namespace from
     * @returns {string} namespace of the file
     * @memberof Ui5Extension
     */
    public GetNamespaceFromFilePath(file: string): string {
        const m = ui5tsglobal.core.absoluteRootPath;
        const fn = path.dirname(file);
        const rel = "./" + path.relative(m, fn).replace("\\", "/") + "/" + path.basename(window.activeTextEditor.document.fileName);
        // rel = rel.replace(/\.controller\.(ts|fs)$/, "").replace(/[\/\\]/g, ".");
        const sources: { k: string, v: string }[] = [];
        for (const ns in ui5tsglobal.core.namespacemappings) {
            if (ns) {
                const relsource = ui5tsglobal.core.namespacemappings[ns];
                if (rel.startsWith(relsource))
                    sources.push({ k: relsource, v: ns });
            }
        }
        let bestmatch;
        if (sources.length > 1) {
            bestmatch = sources.sort((a, b) => a.k.length - b.k.length).pop();
        } else
            bestmatch = sources[0];
        return bestmatch.v + "." + rel.substring(2).replace(/\.controller\.(ts|js)$/, "").replace(/[\/\\]/g, ".");
    }
}