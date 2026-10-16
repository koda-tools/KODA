import type { KodaMode, KodaChatRequest, WorkspaceContext } from "../contracts.js";
import { canonicalWorkspaceUri } from "../adapters/identity.js";
export interface ParticipantInput { readonly prompt: string; readonly workspaceUri: string; readonly conversationKey: string; readonly context?: WorkspaceContext; }
export type ParsedParticipantRequest = KodaChatRequest;
export function parseParticipantRequest(input: ParticipantInput): ParsedParticipantRequest {
  const raw = input.prompt.trim();
  const match = /^\/(build|plan)(?:\s+([\s\S]*))?$/i.exec(raw);
  const mode = (match?.[1]?.toLowerCase() as KodaMode | undefined) ?? "build";
  if (match !== null && match[2] === undefined) throw new Error("A non-empty prompt is required.");
  const prompt = (match?.[2] ?? raw).trim();
  if (prompt === "") throw new Error("A non-empty prompt is required.");
  return { ...input, workspaceUri: canonicalWorkspaceUri(input.workspaceUri), mode, prompt };
}
