/** Never write raw errors, prompts, or credentials to the protocol stream. */
export function logDiagnostic(
  stderr: Pick<NodeJS.WriteStream, "write">,
  area: "prompt" | "transport",
  error: unknown,
): void {
  stderr.write(
    `KODA ACP ${area} failed: ${error instanceof Error ? error.name : "Error"}\n`,
  );
}
