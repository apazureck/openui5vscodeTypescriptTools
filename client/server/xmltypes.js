"use strict";
const Log_1 = require('./Log');
const fs = require('fs');
const path = require('path');
const xml = require('xml2js');
class XmlStorage extends Log_1.Log {
    constructor(schemastorePath, connection, loglevel) {
        super(connection, loglevel);
        this.schemastorePath = schemastorePath;
        this.schemas = {};
        this.connection.console.info("Creating Schema storage.");
        for (let file of fs.readdirSync(this.schemastorePath)) {
            try {
                let xmltext = fs.readFileSync(path.join(this.schemastorePath, file)).toString();
                xml.parseString(xmltext, { normalize: true }, (err, res) => {
                    if (err)
                        throw err;
                    let tns = xmltext.match(/targetNamespace\s*?=\s*?["'](.*?)["']/);
                    if (tns) {
                        let nsregex = /xmlns:(.*?)\s*?=\s*?["'](.*?)["']/g;
                        let ns;
                        let schemanamespace;
                        let namespaces = {};
                        while (ns = nsregex.exec(xmltext)) {
                            if (ns[2] === "http://www.w3.org/2001/XMLSchema")
                                schemanamespace = ns[1];
                            else
                                namespaces[ns[1]] = ns[2];
                        }
                        this.connection.console.info("Found a valid schema. Renaming namespace abbrevation '" + schemanamespace + " to empty abbrevation to make it more readable for programmers.");
                        if (namespaces[""]) {
                            this.connection.console.error("There is an empty namespace. It will be missinterpreted, as for lazynessreasons of the author the xsd namespace will be removed from all elements.");
                        }
                        var start = schemanamespace + ":";
                        res = substitute(res, (key, value) => {
                            if (key.startsWith(start)) {
                                return key.split(":")[1];
                            }
                            return key;
                        });
                        this.connection.console.info("Converted schema " + schemanamespace);
                        if (schemanamespace)
                            this.schemas[tns[1]] = { schemanamespace: schemanamespace, schema: res.schema, referencedNamespaces: namespaces, targetNamespace: tns[1] };
                        else
                            throw new Error("No Schema namespace defined, make sure your schema is compared against 'http://www.w3.org/2001/XMLSchema'");
                        return;
                        ;
                    }
                    else
                        throw new Error("No Target Namespace found in schema '" + file + "'");
                });
            }
            catch (error) {
                this.connection.console.warn("Could not open Schema '" + file + "': " + JSON.stringify(error));
            }
        }
    }
}
exports.XmlStorage = XmlStorage;
function getNamespaces(xmlobject) {
    var retns = [];
    traverse(xmlobject, (key, value) => {
        try {
            if (key.startsWith("xmlns:"))
                retns.push({
                    name: key.split(":")[1],
                    address: value
                });
        }
        catch (error) {
        }
    });
    return retns;
}
exports.getNamespaces = getNamespaces;
/**
 * Replaces the key. Return old key if key should not be renamed.
 *
 * @param {*} o
 * @param {(key: string, value: any, parent: {}) => string} func
 */
function substitute(o, func) {
    let build = {};
    for (let i in o) {
        let newkey = func.apply(this, [i, o[i], o]);
        let newobject = o[i];
        if (o[i] !== null && typeof (o[i]) == "object") {
            if (o[i] instanceof Array) {
                newobject = [];
                for (let entry of o[i])
                    newobject.push(substitute({ [i]: entry }, func)[newkey]);
            }
            else
                newobject = substitute(o[i], func);
        }
        build[newkey] = newobject;
    }
    return build;
}
exports.substitute = substitute;
function traverse(o, func) {
    for (let i in o) {
        if (func.apply(this, [i, o[i], o]))
            continue;
        if (o[i] !== null && typeof (o[i]) == "object") {
            if (o[i] instanceof Array)
                for (let entry of o[i])
                    traverse({ [i]: entry }, func);
            //going on step down in the object tree!!
            traverse(o[i], func);
        }
    }
}
exports.traverse = traverse;
//# sourceMappingURL=xmltypes.js.map