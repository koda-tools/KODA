export function canonicalWorkspaceUri(value: string): string {
  const uri = value.trim();
  if (uri === "") throw new Error("A workspace URI is required.");
  return uri.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
}
export function sessionKey(workspaceUri: string, conversationKey: string): string {
  const conversation = conversationKey.trim();
  if (conversation === "") throw new Error("A conversation key is required.");
  return `${canonicalWorkspaceUri(workspaceUri)}::${conversation}`;
}
