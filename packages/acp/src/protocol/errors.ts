export function assertSessionFeatures(params: {
  additionalDirectories?: readonly unknown[] | undefined;
  mcpServers: readonly unknown[];
}): void {
  if ((params.additionalDirectories?.length ?? 0) > 0)
    throw new Error("Additional ACP workspace roots are not supported.");
  if (params.mcpServers.length > 0)
    throw new Error(
      "Client-provided MCP servers are not supported; use KODA's MCP configuration.",
    );
}
