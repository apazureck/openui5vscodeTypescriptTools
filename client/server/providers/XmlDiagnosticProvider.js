"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const Log_1 = require('../Log');
const vscode_languageserver_1 = require('vscode-languageserver');
const xmlChecker = require('xmlchecker');
const xmltypes_1 = require('../xmltypes');
const xml2js = require('xml2js');
const server_1 = require('../server');
var DiagnosticCodes;
(function (DiagnosticCodes) {
    DiagnosticCodes[DiagnosticCodes["DoubleAttribute"] = 0] = "DoubleAttribute";
})(DiagnosticCodes || (DiagnosticCodes = {}));
class DiagnosticCollection {
    delete(uri) {
        this.diagnostics = {};
    }
    set(uri, diag) {
        if (this.diagnostics[uri])
            this.diagnostics[uri].diagnostics = this.diagnostics[uri].diagnostics.concat(diag);
        else
            this.diagnostics[uri].diagnostics = diag;
    }
}
exports.DiagnosticCollection = DiagnosticCollection;
class XmlWellFormedDiagnosticProvider extends Log_1.Log {
    diagnose(doc) {
        return __awaiter(this, void 0, void 0, function* () {
            let text = doc.getText();
            let items = [];
            try {
                items = items.concat(yield this.diagXml2Js(text));
            }
            catch (error) {
                console.log(error.toString());
            }
            try {
                items = items.concat(this.diagXmlChecker(text));
            }
            catch (error) {
                console.log(error.toString());
            }
            try {
                items = items.concat(yield this.getNamespaces(text));
            }
            catch (error) {
                console.log(error.toString());
            }
            return items;
        });
    }
    diagXmlChecker(text) {
        try {
            xmlChecker.check(text);
            return [];
        }
        catch (error) {
            let err = error;
            err.line--;
            err.column--;
            console.log(JSON.stringify(error));
            return [{
                    range: {
                        start: {
                            line: err.line,
                            character: err.column
                        },
                        end: {
                            line: err.line,
                            character: server_1.getLine(text, (err.line)).length - 1
                        }
                    },
                    severity: vscode_languageserver_1.DiagnosticSeverity.Warning,
                    message: err.message,
                    source: 'xmlLint'
                }];
        }
    }
    diagXml2Js(text) {
        return new Promise((resolve, reject) => {
            xml2js.parseString(text, { xmlns: true }, (error, result) => {
                if (error) {
                    // let namespaces = getNamespaces(result);
                    let errorlines = error.message.split("\n");
                    error.message = errorlines[0];
                    error.Line = Number(errorlines[1].match(/\d+/));
                    error.Column = Number(errorlines[2].match(/\d+/));
                    let char = errorlines[3].split(":")[1];
                    if (char)
                        error.message += "Character: '" + char + "'";
                    let x = {
                        range: {
                            start: {
                                line: error.Line,
                                character: error.Column
                            },
                            end: {
                                line: server_1.getLineCount(text),
                                character: server_1.getLine(text, server_1.getLineCount(text)).length - 1
                            }
                        },
                        message: error.message,
                        severity: vscode_languageserver_1.DiagnosticSeverity.Error
                    };
                    resolve([]);
                }
                resolve([]);
            });
        });
    }
    getNamespaces(text) {
        return __awaiter(this, void 0, void 0, function* () {
            let match;
            // Group 1: namespace abbrevation
            // Group 2: namespace name
            let xmlnsregex = /xmlns:?(.*?)=['"](.*?)['"]/g;
            let doc = text;
            let hits = [];
            while (match = xmlnsregex.exec(doc)) {
                if (server_1.Global.schemastore.schemas[match[2]]) {
                    hits.push();
                }
            }
            return hits;
        });
    }
}
exports.XmlWellFormedDiagnosticProvider = XmlWellFormedDiagnosticProvider;
class XmlAttributeDiagnosticProvider extends xmltypes_1.XmlBaseHandler {
    constructor(schemastorage, connection, logLevel, diagnostics) {
        super(schemastorage, connection, logLevel);
        this.diagnostics = diagnostics;
        if (!diagnostics)
            diagnostics = [];
    }
    diagnose(doc) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                try {
                    this.text = doc.getText();
                    let baselement = this.textGetElements(this.text);
                    this.checkAllElementsForAttributes(baselement);
                    resolve(this.diagnostics);
                }
                catch (error) {
                    this.logError("Could not diagnose Attributes: " + error.toString());
                    reject(error);
                }
            });
        });
    }
    /**
     * Checks if double attributes are in element header
     *
     * @param {FoundElementHeader} element
     *
     * @memberOf XmlAttributeChecks
     */
    checkDoubleAttributes(element) {
        let doubles = {};
        this.logDebug("Checking " + (element.attributes ? element.attributes.length : 0) + " attributes");
        for (let attribute of element.attributes) {
            if (doubles[attribute.name]) {
                this.logDebug(() => "Found double attribute '" + attribute.name + "'");
                this.diagnostics.push({
                    code: DiagnosticCodes.DoubleAttribute,
                    message: "Double attribute '" + attribute.name + "'",
                    range: { start: server_1.getPositionFromIndex(this.text, attribute.startpos), end: server_1.getPositionFromIndex(this.text, attribute.endpos) },
                    severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                    source: "xmllint"
                });
            }
            else {
                this.logDebug(() => "Added attribute '" + attribute.name + "' to the doubles dictionary");
                doubles[attribute.name] = attribute;
            }
        }
    }
    /**
     * Checks all elements for their attributes recursively using the children array
     *
     * @param {FoundElementHeader} baseelement
     *
     * @memberOf XmlAttributeChecks
     */
    checkAllElementsForAttributes(baseelement) {
        this.checkDoubleAttributes(baseelement);
        if (baseelement.children)
            for (let el of baseelement.children) {
                this.logDebug("Checking element '" + el.fullName + "'");
                this.checkAllElementsForAttributes(el);
            }
    }
}
exports.XmlAttributeDiagnosticProvider = XmlAttributeDiagnosticProvider;
//# sourceMappingURL=XmlDiagnosticProvider.js.map