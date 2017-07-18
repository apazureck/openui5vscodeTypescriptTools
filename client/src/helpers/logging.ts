import * as vscode from "vscode";
import { ui5tsglobal } from "../extension";

export function showerror(message: string) {
    vscode.window.showErrorMessage(ui5tsglobal.name + ": " + message);
}
export function showinfo(message: string) {
    vscode.window.showInformationMessage(ui5tsglobal.name + ": " + message);
}
export function showWarning(message: string) {
    vscode.window.showWarningMessage(ui5tsglobal.name + ": " + message);
}
export function printInfo(message: string) {
    console.info(ui5tsglobal.name + ": " + message);
}
export function printError(message: string) {
    console.error(ui5tsglobal.name + ": " + message);
}
export function printWarning(message: string) {
    console.warn(ui5tsglobal.name + ": " + message);
}
