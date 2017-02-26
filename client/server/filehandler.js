"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const rrd = require('recursive-readdir');
const fs = require('fs');
const server_1 = require('./server');
/**
 * File interface
 *
 * @export
 * @class File
 */
class File {
    /**
     * async file search method.
     *
     * @static
     * @param {(string|RegExp)} pattern to search for.
     * @param {string} [startdir] to start search at. default: workspace root path
     * @returns {Promise<string>}
     *
     * @memberOf File
     */
    static findAsync(pattern, startdir) {
        return __awaiter(this, void 0, void 0, function* () {
            startdir = startdir ? startdir : server_1.Global.workspaceRoot;
            let matcher = typeof pattern === "string" ? new RegExp(pattern) : pattern;
            return new Promise((resolve, reject) => {
                rrd(startdir, (err, files) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    let result = files.filter(x => x.match(matcher) != null);
                    if (result)
                        resolve(result);
                    else
                        reject();
                });
            });
        });
    }
    /**
     *
     * @static
     * @param {(RegExp|string)} pattern Filepattern to search for
     * @param {string} [startdir] dir to start (if none is given workspace is taken)
     * @returns {string[]} files
     *
     * @memberOf File
     */
    static find(pattern, startdir) {
        startdir = startdir ? startdir : server_1.Global.workspaceRoot;
        let regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
        return findFilesSync(regex, startdir);
    }
    static getFileName(path) {
        return path.split("\\").pop();
    }
    static open(path, encoding) {
        encoding = encoding ? encoding : "utf-8";
        return fs.readFileSync(path, encoding);
    }
}
exports.File = File;
function findFilesSync(pattern, startdir) {
    let results = [];
    let list = fs.readdirSync(startdir);
    for (let file of list) {
        file = startdir + '\\' + file;
        var stat = fs.statSync(file);
        if (stat && stat.isDirectory())
            results = results.concat(findFilesSync(pattern, file));
        else if (file.match(pattern))
            results.push(file);
    }
    return results;
}
//# sourceMappingURL=filehandler.js.map