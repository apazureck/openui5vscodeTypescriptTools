import { Log, LogLevel } from './Log';
import { CompletionItem, IConnection } from 'vscode-languageserver'
import * as fs from 'fs'
import * as path from 'path'
import * as xml from 'xml2js'

export class XmlStorage extends Log {
	constructor(public schemastorePath: string, connection: IConnection, loglevel: LogLevel) {
		super(connection, loglevel)
		this.schemas = {};
		this.connection.console.info("Creating Schema storage.")
		for (let file of fs.readdirSync(this.schemastorePath)) {
			try {
				let xmltext = fs.readFileSync(path.join(this.schemastorePath, file)).toString();
					xml.parseString(xmltext, { normalize: true }, (err, res) => {
						if (err)
							throw err;
						let tns = xmltext.match(/targetNamespace\s*?=\s*?["'](.*?)["']/);
						if (tns) {
							let nsregex = /xmlns:(.*?)\s*?=\s*?["'](.*?)["']/g;
							let ns: RegExpMatchArray;
							let schemanamespace: string;
							let namespaces = {}
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

							var start = schemanamespace + ":"
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
								throw new Error("No Schema namespace defined, make sure your schema is compared against 'http://www.w3.org/2001/XMLSchema'")
							return;;
						}
						else
							throw new Error("No Target Namespace found in schema '" + file + "'" );
					});
			} catch (error) {
				this.connection.console.warn("Could not open Schema '" + file + "': " + JSON.stringify(error));
			}
		}
	}
	schemas: {
		[x: string]: StorageSchema
	}
}

export declare interface StorageSchema {
	schemanamespace?: string,
	schema: XmlSchema,
	referencedNamespaces: { [x: string]: string }, 
	targetNamespace: string
}

export declare interface ComplexTypeEx extends ComplexType {
	// Additional properties for navigation
	basetype?: ComplexTypeEx;
	schema: StorageSchema;
}

export declare interface ElementEx extends Element {
	ownerschema?: StorageSchema
}

export function getNamespaces(xmlobject: any): Namespace[] {
    var retns: Namespace[] = [];
    traverse(xmlobject, (key, value) => {
        try {
            if (key.startsWith("xmlns:"))
                retns.push({
                    name: key.split(":")[1],
                    address: value
                });
        } catch (error) {

        }
    });
    return retns;
}

export interface Namespace {
    name: string
    address: string
}

export interface XmlError extends Error {
    message: string;
    Line: number;
    Column: number;
}

export interface XmlCheckerError {
    message: string
    expected: {
        type: string;
        value?: string;
        description: string;
    }[]
    found: string;
    offset: number;
    line: number;
    column: number;
}

/**
 * Replaces the key. Return old key if key should not be renamed.
 * 
 * @param {*} o 
 * @param {(key: string, value: any, parent: {}) => string} func 
 */
export function substitute(o: any, func: (key: string, value: any) => string): {} {
    let build = {};
    for (let i in o) {
        let newkey = func.apply(this, [i, o[i], o]);
        let newobject = o[i];
        if (o[i] !== null && typeof (o[i]) == "object") {
            if (o[i] instanceof Array) {
                newobject = [];
                for (let entry of o[i])
                    newobject.push(substitute({ [i]: entry }, func)[newkey]);
            } else
                newobject = substitute(o[i], func);
        }
        build[newkey] = newobject;
    }
    return build;
}

export function traverse(o: any, func: (key: string, value: any) => void) {
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