import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { boundedContext } from "./adapters/workspace.js";
import { sessionKey } from "./adapters/identity.js";
import { approveInVsCode } from "./adapters/approval.js";
import { parseParticipantRequest } from "./chat/participant.js";
import { writeKodaEvent } from "./chat/stream.js";
import { commandPrompt } from "./commands/index.js";
import { SessionRegistry, type SessionEntry } from "./adapters/sessions.js";
import { createKodaRuntime } from "./adapters/core.js";

const sessions = new SessionRegistry();
const conversationIds = new WeakMap<object, string>();

export function activate(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant("koda", async (request, chatContext, stream, token) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) { stream.markdown("KODA requires an open workspace."); return; }
    if (!vscode.workspace.isTrusted) { stream.markdown("KODA requires a trusted workspace before it can run tools."); return; }
    const workspaceUri = folder.uri.toString();
    const conversationKey = conversationIdentity(chatContext) ?? randomUUID();
    const editor = vscode.window.activeTextEditor;
    const parsed = parseParticipantRequest({
      prompt: commandPrompt(request.command, request.prompt), workspaceUri, conversationKey,
      ...(editor === undefined ? {} : { context: boundedContext(workspaceUri, {
        fileName: editor.document.fileName, languageId: editor.document.languageId,
        selection: editor.document.getText(editor.selection),
        diagnostics: vscode.languages.getDiagnostics(vscode.Uri.file(editor.document.fileName)).map((item) => item.message),
      }) }),
    });
    const entry = await ensureSession(parsed.workspaceUri, parsed.conversationKey, folder.uri.fsPath);
    const requestWithHistory = { ...parsed, history: entry.history };
    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    try {
      const turn = await entry.runtime.execute(requestWithHistory, { signal: controller.signal, onEvent: (event) => writeKodaEvent(stream, event) });
      entry.history.push(...turn.history);
    } catch (error) {
      if (!controller.signal.aborted) stream.markdown(`KODA failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally { cancellation.dispose(); }
  });
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "koda.svg");
  context.subscriptions.push(participant, { dispose: () => { void sessions.dispose(); } });
}

async function ensureSession(workspaceUri: string, conversationKey: string, workspaceRoot: string): Promise<SessionEntry> {
  const existing = sessions.get(workspaceUri, conversationKey);
  if (existing !== undefined) return existing;
  const runtime = await createKodaRuntime(workspaceRoot, process.env, approveInVsCode);
  const entry: SessionEntry = { key: sessionKey(workspaceUri, conversationKey), workspaceUri, conversationKey, runtime, history: [] };
  sessions.set(entry);
  return entry;
}

function conversationIdentity(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = (value as { readonly requestId?: unknown }).requestId;
  if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  const history = (value as { readonly history?: unknown }).history;
  if (typeof history !== "object" || history === null) return undefined;
  const existing = conversationIds.get(history);
  if (existing !== undefined) return existing;
  const created = randomUUID();
  conversationIds.set(history, created);
  return created;
}

export function deactivate(): Promise<void> { return sessions.dispose(); }
