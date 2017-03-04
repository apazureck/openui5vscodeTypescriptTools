# ui5ts Extension

This extension improves the experience using UI5 with typescript. It is currently work in progress.

## Disclaimer 
> This extension is not officially supported by SAP or the openUi5 team. It is currently in an early development phase, so [please report any issues](https://github.com/apazureck/openui5vscodeTypescriptTools/issues) you have. If you want to contribute, feel free to conatct me via [Github](https://github.com/apazureck/openui5vscodeTypescriptTools/issues). I will also update it quite frequently for the next time, which may cause some new bugs.

## Features

* **Code snippets**
    * generate views and controllers in typescript
* **Navigation** between views and controllers
    * Navigation between views and controllers using `CTRL+F7` _(view)_ or `CTRL+SHIFT+F7` _(controller)_.
    * Go to event handlers by pressing `F12`.
* **i18n** support
    * Code completion for labels in xml models
    * Autogeneration for labels (via Command and CodeAction)
    * Peek and Goto i18n label definition
* **manifest.json** support
    * JSON Schema
    * Autocomplete for routings
* **XML** support
    * Code completion for XML views (Attributes and Elements)
    * Simple check for well-formed xml files
    * Check for double attributes

## Requirements

[Typescript definitions](https://github.com/apazureck/UI5TypescriptDeclarations) (based on UI5 Version 1.42.6) for UI5 from the repository or check out the [typescript generator](https://github.com/apazureck/openui5TypescriptGenerator/stargazers) (currently C#/.NET)

## Usage

Check out the [Wiki on Github](https://github.com/apazureck/openui5vscodeTypescriptTools/wiki).

> Will be updated in the next weeks (~ 3-20-17)

## Known Issues

This is a early release, therefore, functionallity is very limited and the functions provided are not stable and may not work in all circumstances. If you confront problems let me know by [creating an issue](https://github.com/apazureck/openui5vscodeTypescriptTools/issues) on github.

## Contribution welcome

* [Fork on Github](https://github.com/apazureck/openui5vscodeTypescriptTools)
* [Report a bug or request a Features](https://github.com/apazureck/openui5vscodeTypescriptTools/issues)
* [Share your knowledge and extend the wiki](https://github.com/apazureck/openui5vscodeTypescriptTools/wiki)