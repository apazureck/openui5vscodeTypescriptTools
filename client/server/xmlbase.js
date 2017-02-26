"use strict";
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
function traverse(o, func) {
    for (let i in o) {
        func.apply(this, [i, o[i]]);
        if (o[i] !== null && typeof (o[i]) == "object") {
            //going on step down in the object tree!!
            traverse(o[i], func);
        }
    }
}
//# sourceMappingURL=xmlbase.js.map