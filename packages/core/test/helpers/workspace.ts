import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Files to create, keyed by workspace-relative POSIX path. */
export type WorkspaceFiles = Readonly<Record<string, string | Buffer>>;

/**
 * Creates a temporary workspace, runs `body` with its root, and removes it.
 * Parent directories are created automatically.
 */
export async function withWorkspace<T>(
  files: WorkspaceFiles,
  body: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), "koda-ws-"));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(root, ...relative.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    return await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
