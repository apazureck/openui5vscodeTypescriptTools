var gulp = require('gulp'),
    fs = require('fs'),
    gutil = require('gulp-util'),
    sequence = require('run-sequence');

gulp.task('default', function() {
    return sequence('updatereadmetssnippets', 'updatereadmexmlsnippets');
});

gulp.task('updatereadmetssnippets', function() {
    var txt = fs.readFileSync('snippets/typescript.json', 'utf-8');
    gutil.log(txt.substring(990, 1000));
    var snippets = JSON.parse(txt);
    var snippetlist = "\n";
    for (var sname in snippets) {
        var snippet = snippets[sname];
        snippetlist += "* `" + snippet.prefix + "`: " + snippet.description + "\n";
    }
    snippetlist += "\n";
    var readme = fs.readFileSync('README.md', 'utf-8');
    readme = readme.replace(/<!--TYPESCRIPTSNIPPETS-->[\s\S]*<!--TYPESCRIPTSNIPPETS-->/, "<!--TYPESCRIPTSNIPPETS-->" + snippetlist + "<!--TYPESCRIPTSNIPPETS-->");
    return fs.writeFileSync('README.md', readme);
});

gulp.task('updatereadmexmlsnippets', function() {
    var txt = fs.readFileSync('snippets/xml.json', 'utf-8');
    var snippets = JSON.parse(txt);
    var snippetlist = "\n\n";
    for (var sname in snippets) {
        var snippet = snippets[sname];
        snippetlist += "* `" + snippet.prefix + "`: " + snippet.description + "\n";
    }
    snippetlist += "\n";
    var readme = fs.readFileSync('README.md', 'utf-8');
    readme = readme.replace(/<!--XMLSNIPPETS-->[\s\S]*<!--XMLSNIPPETS-->/, "<!--XMLSNIPPETS-->" + snippetlist + "<!--XMLSNIPPETS-->");
    return fs.writeFileSync('README.md', readme);
});