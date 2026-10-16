const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

// VS Code supplies this module at runtime. Everything else must be bundled.
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  return request === "vscode" ? {} : originalLoad.call(this, request, ...args);
};

try {
  const extension = require(path.join(__dirname, "..", "dist", "extension.cjs"));
  assert.equal(typeof extension.activate, "function");
  assert.equal(typeof extension.deactivate, "function");
  process.stdout.write("Standalone bundle loads successfully.\n");
} finally {
  Module._load = originalLoad;
}
