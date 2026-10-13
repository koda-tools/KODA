import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

const KODA_FOLDER = ".koda";
const SUBFOLDERS = ["commands", "skills", "agents"] as const;

export interface InitResult {
  readonly root: string;
  readonly created: readonly string[];
  readonly existing: readonly string[];
}

async function isDirectory(target: string): Promise<boolean | undefined> {
  try {
    return (await stat(target)).isDirectory();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Create `.koda/commands`, `.koda/skills` and `.koda/agents` under `root`.
 * Never touches what is already there; fails if `.koda` is not a directory.
 */
export async function initWorkspace(root: string): Promise<InitResult> {
  const koda = path.join(root, KODA_FOLDER);
  if ((await isDirectory(koda)) === false)
    throw new Error(`${koda} exists but is not a directory.`);
  const created: string[] = [];
  const existing: string[] = [];
  for (const name of SUBFOLDERS) {
    const folder = path.join(koda, name);
    const relative = `${KODA_FOLDER}/${name}`;
    if ((await isDirectory(folder)) === true) existing.push(relative);
    else {
      await mkdir(folder, { recursive: true });
      created.push(relative);
    }
  }
  return { root, created, existing };
}

export function formatInitResult(result: InitResult): string {
  const lines = [
    ...result.created.map((folder) => `Created  ${folder}`),
    ...result.existing.map((folder) => `Exists   ${folder}`),
  ];
  return result.created.length === 0
    ? `${lines.join("\n")}\nNothing to do: .koda is already set up.`
    : lines.join("\n");
}
