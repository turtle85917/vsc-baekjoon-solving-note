import * as vscode from "vscode";

export class NoteEditor implements vscode.CustomTextEditorProvider{
  public static register(context:vscode.ExtensionContext):vscode.Disposable{
    const provider = new NoteEditor(context);
    return vscode.window.registerCustomEditorProvider("solving-note.customEditor", provider);
  }
  public async resolveCustomTextEditor(document:vscode.TextDocument, webviewPanel:vscode.WebviewPanel, _token:any):Promise<void>{
    webviewPanel.webview.options = {enableScripts: true};
    webviewPanel.webview.html = this.getHtml();
    const updateWebview = ():void => {
      webviewPanel.webview.postMessage({
        type: "update",
        text: document.getText()
      });
    };
    updateWebview();
    webviewPanel.onDidChangeViewState(event => {
      if(event.webviewPanel.visible) updateWebview();
    });
    // webviewPanel.webview.onDidReceiveMessage(event => {
    //   if(event.type === "edit"){
    //   }
    // });
  }

  constructor(private readonly context:vscode.ExtensionContext){}

  private getHtml():string{
    return `
      <!DOCTYPE html>
      <html>
      <body>
        <textarea id="editor"></textarea>
        <script>
          const vscode = acquireVsCodeApi();
          window.addEventListener("message", event => {
            const {type, text} = event.data;
            if(type === "update"){
              document.getElementById("editor").value = text;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
