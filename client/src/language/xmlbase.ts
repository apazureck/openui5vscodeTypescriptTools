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

function traverse(o: any, func: (key: string, value: string) => void) {
    for (let i in o) {
        func.apply(this, [i, o[i]]);
        if (o[i] !== null && typeof (o[i]) == "object") {
            //going on step down in the object tree!!
            traverse(o[i], func);
        }
    }
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