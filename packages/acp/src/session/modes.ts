export type KodaMode = "build" | "plan";

export const MODES = [
  {
    id: "build",
    name: "Build",
    description: "Edit files and run approved commands",
  },
  { id: "plan", name: "Plan", description: "Read-only analysis" },
];

export function isKodaMode(value: string): value is KodaMode {
  return value === "build" || value === "plan";
}
