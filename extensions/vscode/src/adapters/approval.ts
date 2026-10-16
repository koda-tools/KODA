import * as vscode from "vscode";

export async function approveInVsCode(title: string, prompt: string): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(`${title}: ${prompt}`, "Allow", "Reject");
  return choice === "Allow";
}
