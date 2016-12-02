import * as vscode from 'vscode';
import * as extension from '../extension';

export function showerror(message: string) {
    vscode.window.showErrorMessage(extension.name + ": " + message);
}
export function showinfo(message: string) {
    vscode.window.showInformationMessage(extension.name + ": " + message);
}
export function showWarning(message: string) {
    vscode.window.showWarningMessage(extension.name + ": " + message);
}
export function printInfo(message: string) {
    console.info(extension.name + ": "+message);
}
export function printError(message: string) {
    console.error(extension.name + ": "+message);
}
export function printWarning(message: string) {
    console.warn(extension.name + ": "+message);
}
