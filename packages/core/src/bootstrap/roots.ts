import os from "node:os";
import path from "node:path";

export interface GlobalRoots {
  readonly globalKodaRoot: string;
  readonly globalOpenCodeRoot: string;
}

/** Where global KODA and OpenCode files live; KODA's defaults to ~/.config/koda. */
export function globalRoots(configRoot?: string): GlobalRoots {
  return {
    globalKodaRoot: configRoot ?? path.join(os.homedir(), ".config", "koda"),
    globalOpenCodeRoot: path.join(os.homedir(), ".config", "opencode"),
  };
}
