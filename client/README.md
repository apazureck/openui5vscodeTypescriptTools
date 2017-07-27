# ui5ts Extension

> **Important Note**<br/>
> In Version `0.4.0` The settings were restructured. This did not work, as vscode could not display it this way in the contribution section. Please check your workspace settings and adjust it accordingly. I am sorry for the inconvenience.

This extension improves the experience using UI5 with typescript. It is also targeted to give a quicker start in developing UI5, but also more experieced users may have a profit.

It is currently work in progress. It also may benefit js programming, as I try to keep all filesearches to both, ts and js file endings. Please let me know on github, if something mentioned below does not work for js.

Since version 0.4.0, though, the typescript compiler and its language server are part of the extension to improve the editing experience. goto providers, refactoring, linting and other editing features are exclusive to typescript development in the future.

## Disclaimer

> This extension is not officially supported by SAP or the openUi5 team. It is currently in an early development phase, so [please report any issues](https://github.com/apazureck/openui5vscodeTypescriptTools/issues) you have. If you want to contribute, feel free to conatct me via [Github](https://github.com/apazureck/openui5vscodeTypescriptTools/issues). I will also update it quite frequently for the next time, which may cause some new bugs.

## What is new in Version 0.5.0

* ID Completion when using byId() method of controller class
* GoTo Event callback from fragment (+ improved navigation with typescript language service)
* Check for missing controller files in xml views

## Features

* **Code snippets** see also snippet section under Usage, will automatically updated if new snippets are available. Contribution welcome!
  * generate views and controllers in typescript (ts only)
* **Navigation** between views and controllers
  * Navigation between views and controllers using `CTRL+F7` _(view)_ or `CTRL+SHIFT+F7` _(controller)_.
  * Navigation between fragments and controllers  using `CTRL+F7` _(fragment)_
  * Go to event handlers by pressing `F12`.
* **i18n** support
  * Code completion for labels in XML views
  * Autogeneration for labels (via Command and CodeAction)
  * Peek and Goto i18n label definition (XML view)
* **manifest.json** support
  * JSON Schema
  * Autocomplete for routings
  * Check if target views exist
* **XML** support
  * Code completion for XML views (Attributes, Elements and Attribute Values (Enum))
  * Simple check for well-formed xml files
  * Check for double attributes
  * Hover support for Elements and Attributes
  * Check for missing controller
* **Project Template** with auto compile, bower support and browser sync
  * [Check out this repo for now](https://github.com/apazureck/UI5TypescriptDeclarations/tree/master/generator)
  * Will be included in one of the next releases, if stable enough
* **Code Lens**
  * Code lens for events referenced in XML views (on Typescript Controllers)
* **Typescript**
  * Autocompletion for ID (works only for byId() method and will be improved in future releases)

## Requirements

Get the typescript declarations:

1. [Typescript definitions](https://github.com/apazureck/UI5TypescriptDeclarations) (based on UI5 Version 1.42.6) for UI5 from the repository or check out the [typescript generator](https://github.com/apazureck/openui5TypescriptGenerator) (currently C#/.NET).
1. There are also other Typescript declarations on dt, so check out these, if you like: `typings install openui5`. These are also used by vscode when writing js code.
1. There is [another generator](https://github.com/maylukas/openui5-typescript-definition-parser) written in typescript. This generator may be included in this extension in a later release, if the author is ok with that.

I can reccomend using the first generator, as it also respects the UI5 version you want to use, but feel free to experiment on that topic for now.

## Usage

This extension will start if you open any xml file or your workspace contains any manifest.json file. Check if the XML Language server gets started in the output window.

From Version `0.3.0` on you should be informed either

1. no manifest.json is found.
1. multiple manifest.json files were found (Quickpick to choose).
1. exactly 1 manifest.json file is found.

After that the manifest.json location will be added to your workspace settings. All search for views, controllers, etc. will be done in the folders below this manifest.json, so make sure you have one in your project. [Use this template to get started](https://github.com/apazureck/UI5TypescriptDeclarations/tree/master/generator) (will be included in this extension in the near future).

You may also manually set the manifest.json, even if you do not have any. It may work this way, too. Just set it manually in the settings.json

### Commands

1. Go to controller `CTRL + F7` (works only in xml views (maybe also in json views, not tested so far))
1. Go to view `CTRL + Shift + F7` (works only in js,ts controllers)
1. Go to from view or fragment to fragment, view or controller: Put cursor on line with view/fragment/controller and press `F12`

### i18n

1. Set up your relative model file path in your workspace settings `ui5ts.lang.i18n.modelfilelocation` (default `<manifest.json location>/i18n/i18n.properties`).
1. Set up your model name in your workspace settings `ui5ts.lang.i18n.modelname` (default `i18n`)

After that the xml files should be checked for missing labels. Check your Problems window on that. If a missing label is found a code action will allow you to add it to your i18n file. It will always be appended (no sorting so far).

### Tell me more...

Check out for more detail at the [Wiki on Github](https://github.com/apazureck/openui5vscodeTypescriptTools/wiki). Contribution very welcome here!

## Snippets

If you have useful snippets to share please [let me know](https://github.com/apazureck/openui5vscodeTypescriptTools/issues).

### Typescript

<!--TYPESCRIPTSNIPPETS-->

* `ui5controller`: Inserts a new UI5 typescript controller

<!--TYPESCRIPTSNIPPETS-->

### XML

<!--XMLSNIPPETS-->

* `i18n`: Creates a model reference with i18n address
* `labeli18n`: Creates a label with i18n address
* `titlei18n`: Creates a title with i18n address
* `sapmodel`: Creates a sap.m.Text element with text property
* `ui5xmlview`: Inserts a new UI5 XML page

<!--XMLSNIPPETS-->

## Known Issues

This is a early release, therefore, functionallity is very limited and the functions provided are not stable and may not work in all circumstances. If you confront any problems let me know by [creating an issue](https://github.com/apazureck/openui5vscodeTypescriptTools/issues) on github.

1. The extension always bothers that no manifest.json is found. This may be an activation issue and will be addressed in the future.
1. XML autocomplete is sometimes not working (for example at closing brackets) and insertion of completed code is causing some brackets to be double. This will be addressed in the future.

## Contribution welcome

I am currently doing this project as a kind of a hobby and I am always glad, if I can get feedback. Rate and review this extension or support it by contributing some code.

* [Fork on Github](https://github.com/apazureck/openui5vscodeTypescriptTools)
* [Report a bug or request a Features](https://github.com/apazureck/openui5vscodeTypescriptTools/issues)
* [Share your knowledge and extend the wiki](https://github.com/apazureck/openui5vscodeTypescriptTools/wiki)

## Insiders Mode

The insiders mode is for publishing instable or not tested features released for a first beta test. Activate this to get the latest features.

### Activate Insiders Mode

To get to the Insiders Mode just go to your **User Settings** and set `"ui5ts.insiders": true`. Please don't forget to [Report Bugs](https://github.com/apazureck/openui5vscodeTypescriptTools/issues).

### Currently Available in Insiders Mode

* Go to Module and function (javascript)
* Rename Callback (This will prevent typescript to proceed rename, if callback is found in xml view)

## Special Thanks to

* [anacierdem](https://github.com/anacierdem) for letting me use some code of his [Require Module Support Provider](https://marketplace.visualstudio.com/items?itemName=lici.require-js)!