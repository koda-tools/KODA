import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { SecurityError } from "./errors.js";

const SENSITIVE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
]);
const SENSITIVE_DIRECTORIES = new Set([
  ".git",
  ".ssh",
  ".aws",
  ".azure",
  ".gnupg",
]);

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function assertNotSensitive(relativePath: string): void {
  const segments = relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  if (
    segments.some((segment) => SENSITIVE_DIRECTORIES.has(segment)) ||
    segments.some(
      (segment) => SENSITIVE_NAMES.has(segment) || segment.startsWith(".env."),
    )
  ) {
    throw new SecurityError("Access to sensitive files is denied.");
  }
}

export async function resolveSafeExistingPath(
  workspaceRoot: string,
  requestedPath: string,
): Promise<string> {
  if (requestedPath.trim() === "" || path.isAbsolute(requestedPath)) {
    throw new SecurityError(
      "Only non-empty relative project paths are allowed.",
    );
  }
  assertNotSensitive(requestedPath);
  const realRoot = await realpath(path.resolve(workspaceRoot));
  const lexicalTarget = path.resolve(realRoot, requestedPath);
  if (!isContained(realRoot, lexicalTarget)) {
    throw new SecurityError("Access outside the project root is denied.");
  }
  const realTarget = await realpath(lexicalTarget);
  if (!isContained(realRoot, realTarget)) {
    throw new SecurityError("Access outside the project root is denied.");
  }
  return realTarget;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveSafeParent(
  root: string,
  target: string,
): Promise<string> {
  if (!isContained(root, target)) {
    throw new SecurityError("Access outside the project root is denied.");
  }
  const relative = path.relative(root, target);
  if (relative === "") return root;
  const segments = relative.split(path.sep).filter(Boolean);
  let realBase = root;
  let lastExistingIndex = -1;
  for (let index = 0; index < segments.length; index += 1) {
    const candidate = path.join(root, ...segments.slice(0, index + 1));
    if (await pathExists(candidate)) {
      const realCandidate = await realpath(candidate);
      if (!isContained(root, realCandidate)) {
        throw new SecurityError("Access outside the project root is denied.");
      }
      realBase = realCandidate;
      lastExistingIndex = index;
    } else {
      break;
    }
  }
  const missing = segments.slice(lastExistingIndex + 1);
  return path.join(realBase, ...missing);
}

export async function resolveSafeWritePath(
  workspaceRoot: string,
  requestedPath: string,
): Promise<string> {
  if (requestedPath.trim() === "" || path.isAbsolute(requestedPath)) {
    throw new SecurityError(
      "Only non-empty relative project paths are allowed.",
    );
  }
  assertNotSensitive(requestedPath);
  const realRoot = await realpath(path.resolve(workspaceRoot));
  const lexicalTarget = path.resolve(realRoot, requestedPath);
  if (!isContained(realRoot, lexicalTarget)) {
    throw new SecurityError("Access outside the project root is denied.");
  }
  const lexicalParent = path.dirname(lexicalTarget);
  const realParent = await resolveSafeParent(realRoot, lexicalParent);
  const realTarget = path.join(realParent, path.basename(lexicalTarget));
  if (await pathExists(realTarget)) {
    const metadata = await stat(realTarget);
    if (metadata.isDirectory()) {
      throw new SecurityError("Cannot overwrite a directory with a file.");
    }
    const resolvedTarget = await realpath(realTarget);
    if (!isContained(realRoot, resolvedTarget)) {
      throw new SecurityError("Access outside the project root is denied.");
    }
    return resolvedTarget;
  }
  return realTarget;
}
