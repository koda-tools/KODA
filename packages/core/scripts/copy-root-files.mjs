import { copyFile } from "node:fs/promises";

// README.md and LICENSE live at the repository root; npm only packs the ones
// in the package folder, so copy them in before `npm pack` / `npm publish`.
const root = new URL("../../../", import.meta.url);
const here = new URL("../", import.meta.url);
for (const name of ["README.md", "LICENSE"])
  await copyFile(new URL(name, root), new URL(name, here));
