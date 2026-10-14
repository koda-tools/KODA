import type { InitResult } from "@koda-tools/core";

export function formatInitResult(result: InitResult): string {
  const lines = [
    ...result.created.map((folder) => `Created  ${folder}`),
    ...result.existing.map((folder) => `Exists   ${folder}`),
  ];
  return result.created.length === 0
    ? `${lines.join("\n")}\nNothing to do: .koda is already set up.`
    : lines.join("\n");
}
