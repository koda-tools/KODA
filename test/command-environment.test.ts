import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEnv } from "../src/tools/command/environment.js";

test("forwards safe variables from the parent", () => {
  const env = buildEnv({ PATH: "/bin", LANG: "en_US.UTF-8", NODE_ENV: "test" });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.LANG, "en_US.UTF-8");
  assert.equal(env.NODE_ENV, "test");
});

test("drops unknown variables from the parent", () => {
  const env = buildEnv({ PATH: "/bin", RANDOM_THING: "x" });
  assert.equal("RANDOM_THING" in env, false);
});

test("never forwards credential-looking variables", () => {
  const env = buildEnv({
    PATH: "/bin",
    OPENAI_API_KEY: "secret",
    GH_TOKEN: "secret",
    DB_PASSWORD: "secret",
    AWS_SECRET_ACCESS_KEY: "secret",
  });
  assert.equal("OPENAI_API_KEY" in env, false);
  assert.equal("GH_TOKEN" in env, false);
  assert.equal("DB_PASSWORD" in env, false);
  assert.equal("AWS_SECRET_ACCESS_KEY" in env, false);
});

test("extras are added but secrets among them are dropped", () => {
  const env = buildEnv(
    { PATH: "/bin" },
    { CI: "1", MY_API_KEY: "secret" },
  );
  assert.equal(env.CI, "1");
  assert.equal("MY_API_KEY" in env, false);
});

test("proxy variables reach the child", () => {
  const env = buildEnv({ PATH: "/bin", HTTPS_PROXY: "http://proxy:8080" });
  assert.equal(env.HTTPS_PROXY, "http://proxy:8080");
});
