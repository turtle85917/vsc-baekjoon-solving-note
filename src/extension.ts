import * as vscode from "vscode";
import {NoteEditor} from "./noteEditor";

export function activate(context:vscode.ExtensionContext){
	console.log("Congratulations, your extension \"solving-note\" is now active!");
	context.subscriptions.push(NoteEditor.register(context));
}
export function deactivate() {}
