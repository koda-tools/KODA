import { randomUUID } from "node:crypto";
import {
  methods,
  type AgentContext,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type { BootstrapPolicies } from "@koda-tools/core";

const MAX_DESCRIPTION = 240;
const ALLOW_ID = "allow";

const PERMISSION_OPTIONS = [
  { optionId: ALLOW_ID, name: "Allow once", kind: "allow_once" as const },
  { optionId: "reject", name: "Reject", kind: "reject_once" as const },
];

const SECRET_KEY = String.raw`(?:token|password|passwd|secret|api[_-]?key)`;

/** Ordem importa: padrões mais específicos primeiro. */
const SECRET_PATTERNS: readonly (readonly [RegExp, string])[] = [
  // Credenciais em URL: scheme://user:senha@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi, "$1[redacted]@"],
  [/\bBearer\s+\S+/gi, "Bearer [redacted]"],
  // Formatos conhecidos de token
  [/\bsk-[\w-]{12,}/gi, "[redacted]"],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,})/g, "[redacted]"],
  [/\bxox[abprs]-[\w-]{10,}/g, "[redacted]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted]"],
  // chave=valor, inclusive com prefixo (GITHUB_TOKEN=...) e valor entre aspas
  [
    new RegExp(
      `(${SECRET_KEY}[\\w-]*\\s*[=:]\\s*)("[^"]*"|'[^']*'|\\S+)`,
      "gi",
    ),
    "$1[redacted]",
  ],
  // Flags: --token valor
  [new RegExp(`(--[\\w-]*${SECRET_KEY}[\\w-]*\\s+)\\S+`, "gi"), "$1[redacted]"],
];

/** Corta sem partir um par substituto e sinaliza o corte com "…". */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

/**
 * Texto seguro para exibir ao usuário: uma linha só, sem caracteres de
 * controle/bidi (que podem falsificar o prompt), com segredos comuns
 * removidos e truncamento sempre visível.
 */
export function safeDescription(value: string): string {
  let text = value.replace(/[\p{Cc}\p{Cf}\s]+/gu, " ").trim();
  for (const [pattern, replacement] of SECRET_PATTERNS)
    text = text.replace(pattern, replacement);
  return truncate(text, MAX_DESCRIPTION);
}

/** Resolve `false` assim que o sinal abortar; `dispose` remove o listener. */
function denyOnAbort(signal: AbortSignal) {
  let dispose = (): void => {};
  const promise = new Promise<false>((resolve) => {
    const listener = () => resolve(false);
    signal.addEventListener("abort", listener, { once: true });
    dispose = () => signal.removeEventListener("abort", listener);
  });
  return { promise, dispose };
}

export class PermissionBridge {
  private turn: { client: AgentContext; signal: AbortSignal } | undefined;

  public constructor(
    private readonly sessionId: string,
    private readonly shutdownSignal: AbortSignal,
  ) {}

  public begin(client: AgentContext, signal: AbortSignal): void {
    this.turn = { client, signal };
  }

  public end(): void {
    this.turn = undefined;
  }

  /** Fail-closed: qualquer erro, cancelamento ou ausência de turno nega. */
  public async ask(
    kind: "edit" | "execute" | "other",
    description: string,
  ): Promise<boolean> {
    const turn = this.turn;
    if (turn === undefined) return false;

    const signal = AbortSignal.any([turn.signal, this.shutdownSignal]);
    if (signal.aborted) return false;

    const aborted = denyOnAbort(signal);
    try {
      return await Promise.race([
        aborted.promise,
        this.requestApproval(turn.client, kind, description, signal),
      ]);
    } finally {
      aborted.dispose();
    }
  }

  private async requestApproval(
    client: AgentContext,
    kind: "edit" | "execute" | "other",
    description: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    try {
      const response = await client.request<RequestPermissionResponse>(
        methods.client.session.requestPermission,
        {
          sessionId: this.sessionId,
          toolCall: {
            toolCallId: randomUUID(),
            title: safeDescription(description),
            kind,
            status: "pending",
          },
          options: PERMISSION_OPTIONS,
        },
        { cancellationSignal: signal },
      );
      return (
        !signal.aborted &&
        response.outcome.outcome === "selected" &&
        response.outcome.optionId === ALLOW_ID
      );
    } catch {
      return false;
    }
  }

  public policies(): BootstrapPolicies {
    return {
      writePolicy: {
        confirm: ({ filePath }) => this.ask("edit", `Write ${filePath}`),
      },
      commandPolicy: {
        // cwd primeiro: se houver truncamento, o corte cai no fim do comando.
        confirm: ({ command, cwd }) =>
          this.ask("execute", `Run in ${cwd}: ${command}`),
      },
      approve: (title) => this.ask("other", title),
    };
  }
}
