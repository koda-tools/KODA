import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  createSkillTool,
  loadCatalog,
  type AgentCatalog,
} from "../src/agents/index.js";
import { withWorkspace, type WorkspaceFiles } from "./helpers/workspace.js";

/** Workspace in `ws/` (a git root), fake home and global config dirs. */
async function withCatalog(
  files: WorkspaceFiles,
  body: (catalog: AgentCatalog, root: string) => Promise<void> | void,
): Promise<void> {
  await withWorkspace({ "ws/.git": "gitdir: x", ...files }, async (root) => {
    const catalog = await loadCatalog({
      workspaceRoot: path.join(root, "ws"),
      globalKodaRoot: path.join(root, "global", "koda"),
      globalOpenCodeRoot: path.join(root, "global", "opencode"),
      homeDir: path.join(root, "home"),
    });
    await body(catalog, root);
  });
}

const agent = (catalog: AgentCatalog, name: string) =>
  catalog.agents.find((candidate) => candidate.name === name);

test("built-in agents are available without any file", async () => {
  await withCatalog({}, (catalog) => {
    assert.deepEqual(
      catalog.agents.map((item) => item.name),
      ["build", "plan", "general", "explore"],
    );
    assert.deepEqual(agent(catalog, "plan")?.permission, {
      edit: "deny",
      bash: "ask",
    });
    assert.deepEqual(catalog.diagnostics, []);
  });
});

test(".koda wins over .opencode and global agents", async () => {
  await withCatalog(
    {
      "ws/.koda/agents/review.md":
        "---\ndescription: Koda review\nmode: subagent\n---\nReview from koda.",
      "ws/.opencode/agents/review.md":
        "---\ndescription: OpenCode review\n---\nReview from opencode.",
      "global/koda/agents/review.md":
        "---\ndescription: Global review\n---\nGlobal.",
      "global/opencode/agents/docs.md":
        "---\ndescription: Docs writer\nmodel: anthropic/claude-x\n---\nWrite docs.",
    },
    (catalog) => {
      const review = agent(catalog, "review");
      assert.equal(review?.description, "Koda review");
      assert.equal(review?.mode, "subagent");
      assert.equal(review?.prompt, "Review from koda.");
      assert.match(review?.source ?? "", /\.koda/);
      assert.equal(agent(catalog, "docs")?.model, "anthropic/claude-x");
      assert.equal(agent(catalog, "docs")?.mode, "all");
    },
  );
});

test("a file customizes a built-in field by field", async () => {
  await withCatalog(
    {
      "ws/.koda/agents/plan.md":
        '---\ntemperature: 0.1\npermission:\n  bash:\n    "*": ask\n    "git status*": allow\n---\nPlan carefully.',
    },
    (catalog) => {
      const plan = agent(catalog, "plan");
      assert.equal(plan?.temperature, 0.1);
      assert.equal(plan?.prompt, "Plan carefully.");
      assert.equal(plan?.mode, "primary");
      assert.equal(
        plan?.description,
        "Analyzes code and proposes plans without changing files.",
      );
      // edit stays denied; bash is replaced by the file's rules.
      assert.equal(plan?.permission.edit, "deny");
      assert.deepEqual(plan?.permission.bash, {
        "*": "ask",
        "git status*": "allow",
      });
    },
  );
});

test("JSONC agents support {file:} prompts and disable", async () => {
  await withCatalog(
    {
      "ws/.koda/koda.jsonc": `{
        // project agents
        "agent": {
          "security": {
            "description": "Security reviewer",
            "mode": "subagent",
            "prompt": "{file:./prompts/security.md}",
            "tools": { "write": false },
          },
          "explore": { "disable": true },
        },
      }`,
      "ws/.koda/prompts/security.md": "Look for vulnerabilities.",
    },
    (catalog) => {
      const security = agent(catalog, "security");
      assert.equal(security?.prompt, "Look for vulnerabilities.");
      assert.equal(security?.permission.edit, "deny");
      assert.equal(agent(catalog, "explore"), undefined);
    },
  );
});

test("invalid agent files become diagnostics, not failures", async () => {
  await withCatalog(
    {
      "ws/.koda/agents/broken.md": "---\ndescription: [unclosed\n---\nx",
      "ws/.koda/agents/nodesc.md": "---\nmode: subagent\n---\nNo description.",
      "ws/.koda/agents/badperm.md":
        "---\ndescription: Bad\npermission:\n  edit: maybe\n---\nx",
      "ws/.koda/agents/good.md": "---\ndescription: Good one\n---\nFine.",
    },
    (catalog) => {
      assert.equal(agent(catalog, "broken"), undefined);
      assert.equal(agent(catalog, "nodesc"), undefined);
      assert.equal(agent(catalog, "badperm"), undefined);
      assert.ok(agent(catalog, "good"));
      assert.equal(catalog.diagnostics.length, 3);
      assert.ok(catalog.diagnostics.some((d) => /broken\.md.*YAML/.test(d)));
      assert.ok(
        catalog.diagnostics.some((d) => /description is required/.test(d)),
      );
      assert.ok(catalog.diagnostics.some((d) => /allow, ask or deny/.test(d)));
    },
  );
});

test("discovers skills in .koda, .opencode, .claude and .agents up to the git root", async () => {
  const skill = (name: string, description = `Skill ${name}`) =>
    `---\nname: ${name}\ndescription: ${description}\n---\nSteps for ${name}.`;
  await withCatalog(
    {
      "ws/.koda/skills/git-release/SKILL.md": skill(
        "git-release",
        "Koda release",
      ),
      "ws/.opencode/skills/git-release/SKILL.md": skill("git-release", "Other"),
      "ws/.claude/skills/pdf/SKILL.md": skill("pdf"),
      "ws/.agents/skills/docs/SKILL.md": skill("docs"),
      "home/.claude/skills/home-skill/SKILL.md": skill("home-skill"),
      "global/koda/skills/global-skill/SKILL.md": skill("global-skill"),
      // Above the git root: never read.
      ".koda/skills/outside/SKILL.md": skill("outside"),
    },
    (catalog) => {
      assert.deepEqual(
        catalog.skills.map((item) => item.name),
        ["docs", "git-release", "global-skill", "home-skill", "pdf"],
      );
      const release = catalog.skills.find(
        (item) => item.name === "git-release",
      );
      assert.equal(release?.description, "Koda release");
      assert.ok(catalog.diagnostics.some((d) => /already defined/.test(d)));
    },
  );
});

test("skills with a bad name are skipped with a diagnostic", async () => {
  await withCatalog(
    {
      "ws/.koda/skills/mismatch/SKILL.md":
        "---\nname: other\ndescription: x\n---\nBody",
      "ws/.koda/skills/Bad--Name/SKILL.md":
        "---\nname: Bad--Name\ndescription: x\n---\nBody",
      "ws/.koda/skills/no-desc/SKILL.md": "---\nname: no-desc\n---\nBody",
    },
    (catalog) => {
      assert.deepEqual(catalog.skills, []);
      assert.equal(catalog.diagnostics.length, 3);
      assert.ok(
        catalog.diagnostics.some((d) => /must match its folder/.test(d)),
      );
      assert.ok(catalog.diagnostics.some((d) => /single hyphens/.test(d)));
      assert.ok(
        catalog.diagnostics.some((d) => /description must have/.test(d)),
      );
    },
  );
});

test("the skill tool lists allowed skills and returns body and base dir", async () => {
  await withCatalog(
    {
      "ws/.koda/skills/git-release/SKILL.md":
        "---\nname: git-release\ndescription: Create releases\n---\nRun the release steps.",
      "ws/.koda/skills/internal-docs/SKILL.md":
        "---\nname: internal-docs\ndescription: Internal\n---\nSecret steps.",
    },
    async (catalog, root) => {
      const tool = createSkillTool(catalog.skills, [
        { skill: { "*": "allow", "internal-*": "deny" } },
      ]);
      assert.ok(tool);
      assert.match(tool.definition.description, /<name>git-release<\/name>/);
      assert.doesNotMatch(tool.definition.description, /internal-docs/);
      const loaded = await tool.execute({ name: "git-release" }, undefined);
      assert.equal(loaded.ok, true);
      assert.match(loaded.content, /Run the release steps\./);
      assert.ok(
        loaded.content.includes(
          path.join(root, "ws", ".koda", "skills", "git-release"),
        ),
      );
      const unknown = await tool.execute({ name: "internal-docs" }, undefined);
      assert.equal(unknown.ok, false);
    },
  );
});
