import { runAcpServer } from "../../src/server.js";
import { fakeRuntimeFactory } from "./fake-runtime.js";

void runAcpServer(
  {
    env: process.env,
    cwd: process.cwd(),
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  },
  fakeRuntimeFactory,
).then((code) => {
  process.exitCode = code;
});
