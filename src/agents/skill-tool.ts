import type { ToolObservation } from "../core/index.js";
import { resolvePermission } from "./permissions.js";
import type { AgentTool, Permissions, SkillDefinition } from "./types.js";

export const SKILL_TOOL = "skill";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function describeSkills(skills: readonly SkillDefinition[]): string {
  const entries = skills.map(
    (skill) =>
      `  <skill>\n    <name>${skill.name}</name>\n    <description>${escapeXml(skill.description)}</description>\n  </skill>`,
  );
  return [
    "Load a skill: reusable instructions for a specific kind of task. Call it when the task matches a skill's description, then follow the returned instructions.",
    "<available_skills>",
    ...entries,
    "</available_skills>",
  ].join("\n");
}

function load(skill: SkillDefinition): ToolObservation {
  return {
    ok: true,
    content: [
      `<skill name="${skill.name}">`,
      `Base directory: ${skill.directory}`,
      "Relative paths in this skill resolve against the base directory.",
      "",
      skill.body,
      "</skill>",
    ].join("\n"),
  };
}

/**
 * The `skill` tool, listing only the skills the layers don't deny; undefined
 * when none is available.
 */
export function createSkillTool(
  skills: readonly SkillDefinition[],
  layers: readonly Permissions[],
): AgentTool | undefined {
  const available = skills.filter(
    (skill) => resolvePermission(layers, "skill", skill.name) !== "deny",
  );
  if (available.length === 0) return undefined;
  const byName = new Map(available.map((skill) => [skill.name, skill]));
  return {
    statusLabel: "Loading skill...",
    definition: {
      name: SKILL_TOOL,
      description: describeSkills(available),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
            description: "Name of the skill to load, from <available_skills>",
          },
        },
        required: ["name"],
      },
    },
    execute: (args) => {
      const name = typeof args.name === "string" ? args.name.trim() : "";
      const skill = byName.get(name);
      return Promise.resolve(
        skill === undefined
          ? { ok: false, content: `Tool error: Unknown skill '${name}'.` }
          : load(skill),
      );
    },
  };
}
