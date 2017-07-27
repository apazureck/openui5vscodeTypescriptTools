# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

### Add

* Typescript AMD declaration generator
* Project generator (with browser sync)
* CodeLens for fragments
* Custom Typescript compiler to get better UI5 Syntax
* XML Diagnostics for Elements, Attributes and their values
* Autocomplete for XML base types (boolean)
* JSON view JSON schemas
* Show I18n label text on hover (XML view)
* I18n multiple files support from manifest json (no setting needed anymore)

## [0.5.0] - 2017-07-28 - Productivity update

### Added

* Goto Event Callback from fragment
* Rename event callbacks in typescript files will also rename them in views / fragments (Insiders - buggy - wait for vscode team)
* Check for missing controller in xml view
* GoTo Controller(s) from Fragments

### Changed

* CodeLens Callback provider does not show up when no callbacks are given
* Settings structure back to old scheme (not compatible with contributions site)

### Fixed

* I18n Label linter stopped working
* Goto i18n Label stopped working (#27)
* Callback display does not work when callback is in fragment (#29)
* Goto event handler does not work on async methods (#28)
* Extension startup does not create namespace mappings and manifest location
* Path resolving in manifest.json (Router section)
* Views not found in targets section of manifest.json

## [0.4.1] - 2017-06-30 - XML Server Fix

### Fixed

* XML Server crashed when no lang.xml settings is present in workspace config

## [0.4.0] - 2017-06-26 - Major XML Improvements

### Added

* Completion for Enumeration
* Insider Mode for review procedure
* [Insider] Goto Module -> Credit & thanks to [anacierdem](https://github.com/anacierdem) for letting me use the code of his [Require Module Support Provider](https://marketplace.visualstudio.com/items?itemName=lici.require-js)
* XML Hover Provider
* CodeLens for event handlers (callacks)
* GoTo Event from View

### Changed

* XML elements on parent element are now displayed as properties
* Layout of the config section

### Fixed

* Fixed element finding in XML Language Server
* Fixed wrong types for elements in XML Language Server
* Fixed attribute showing up when in attribute value section (part in quotes)
* Fixed annoying manifest location found message, if manifest is set in workspace settings

## [0.3.1] - 2017-04-04

### Fixed

* I18N file was not found due to wrong relative path

## [0.3.0] - 2017-03-28

### Added

* Relative source path to source project (in preparation to the project template)
* Extension listens to workspace config changes

### Changed

* Switch to controller and view commands are now using relative root path (location of manifest.json)
* I18n file is now resolved relative to the manifest.json path (default still ./i18n/i18n.properties)
* Improved readme

## [0.2.8] - 2017-03-23

### Fixed

* XML View was in ts file
* typescript.json was not referenced correctly in project json
* Updated README to provide help which snippets are available

## [0.2.7] - 2017-03-20

### Fixed

* Root element was not recognized
* Autocomplete crashed when Elements were in subattributes of their parent element

## [0.2.6] - 2017-03-15

### Fixed

* Goto fragments, controllers and other views from views and fragments

## [0.2.5] - 2017-03-09

### Fixed

* xml2js linting did not work

## [0.2.4] - 2017-03-04

### Added

* I18n diagnostic will automatically updated when i18n.properties file is changed
* XML Diagnostic attribute check (double attributes)
* XML CodeCompletion for SimpleForm (`sap.ui.layout.form`) and Views (`sap.ui.core.mvc`)

### Fixed

* XML Attribute search improved

## [0.2.3] - 2017-02-25

### Added

* I18n Diagnostic provider for existing labels
* Create new I18n Label via command or CodeAction
* Go to definition of i18n label

### Fixed

* Code completion for i18n label
* Improved Element Crawling in language server, can now resolve subelements properly
* Split some ui5 specific features from xml language server

## [0.2.2] - 2017-02-23

### Fixed

* Fixed false auto delete empty tag closing wrong element.

## [0.2.1] - 2017-02-23

### Fixed

* Completion Items for i18n model weren't generated
* Removed wrong feature in Readme.md

## [0.2.0] - 2017-02-22

### Added

* Autoclose on empty XML Elements when putting / at the end.
* Context menu entries for switch to controller and switch to view

### Fixed

* Replaced document crawling algorithm for code completion with a much more stable one

## [0.1.4] - 2017-02-21

### Fixed

* Extension did not start due to missing modlue

## [0.1.1] - 2017-02-21

### Added

* Added Changelog

## [0.1.0] - 2017-02-21

### Added

* Initial Release