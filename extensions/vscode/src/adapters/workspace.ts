import type { WorkspaceContext } from "../contracts.js";
const MAX_SELECTION = 8_000;
const MAX_DIAGNOSTICS = 20;
export interface EditorSnapshot {
  readonly fileName?: string; readonly selection?: string; readonly languageId?: string;
  readonly diagnostics?: readonly string[]; readonly references?: readonly string[];
}
export function boundedContext(workspaceUri: string, snapshot: EditorSnapshot): WorkspaceContext {
  return {
    workspaceUri,
    ...(snapshot.fileName === undefined ? {} : { activeFile: snapshot.fileName }),
    ...(snapshot.selection === undefined ? {} : { selection: snapshot.selection.slice(0, MAX_SELECTION) }),
    ...(snapshot.languageId === undefined ? {} : { language: snapshot.languageId }),
    ...(snapshot.diagnostics === undefined ? {} : { diagnostics: snapshot.diagnostics.slice(0, MAX_DIAGNOSTICS) }),
    ...(snapshot.references === undefined ? {} : { references: snapshot.references.slice(0, MAX_DIAGNOSTICS) }),
  };
}
export function contextPrompt(context: WorkspaceContext | undefined): string {
  if (context === undefined) return "";
  const lines = [
    `Workspace: ${context.workspaceUri}`,
    context.activeFile === undefined ? undefined : `Active file: ${context.activeFile}`,
    context.language === undefined ? undefined : `Language: ${context.language}`,
    context.selection === undefined ? undefined : `Selection:\n${context.selection}`,
    context.diagnostics?.length ? `Diagnostics:\n${context.diagnostics.join("\n")}` : undefined,
    context.references?.length ? `Referenced files:\n${context.references.join("\n")}` : undefined,
  ].filter((line): line is string => line !== undefined);
  return lines.length === 0 ? "" : `\n\nEditor context (use only as relevant):\n${lines.join("\n")}`;
}
