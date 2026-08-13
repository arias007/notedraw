import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];

async function readText(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch (error) {
    errors.push(`${relativePath}: ${error.code === "ENOENT" ? "missing" : error.message}`);
    return "";
  }
}

async function collectFiles(relativeDir) {
  const result = [];
  const entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectFiles(relativePath));
    } else {
      result.push(relativePath);
    }
  }
  return result;
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

function parseJson(relativePath, source) {
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON (${error.message})`);
    return {};
  }
}

const requiredFiles = ["README.md", "LICENSE", "manifest.json", "versions.json", "main.js", "styles.css"];
const requiredSources = Object.fromEntries(
  await Promise.all(requiredFiles.map(async (file) => [file, await readText(file)]))
);
const packageSource = await readText("package.json");
const manifest = parseJson("manifest.json", requiredSources["manifest.json"]);
const versions = parseJson("versions.json", requiredSources["versions.json"]);
const packageJson = parseJson("package.json", packageSource);

const requiredManifestFields = {
  id: "string",
  name: "string",
  version: "string",
  minAppVersion: "string",
  description: "string",
  author: "string",
  isDesktopOnly: "boolean"
};
for (const [key, type] of Object.entries(requiredManifestFields)) {
  check(typeof manifest[key] === type, `manifest.json: ${key} must be ${type}`);
}

check(/^[a-z0-9][a-z0-9-]*$/.test(manifest.id || ""), "manifest.json: id must contain only lowercase letters, numbers, and hyphens");
check(!/(obsidian|plugin)/i.test(manifest.id || ""), "manifest.json: id must not contain Obsidian or plugin");
check(!/(obsidian|plugin)/i.test(manifest.name || ""), "manifest.json: name must not contain Obsidian or plugin");
check(/^\d+\.\d+\.\d+$/.test(manifest.version || ""), "manifest.json: version must be x.y.z");
check(/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion || ""), "manifest.json: minAppVersion must be x.y.z");
check(manifest.version === packageJson.version, "manifest.json and package.json versions must match");
check(versions[manifest.version] === manifest.minAppVersion, "versions.json must map the release version to minAppVersion");
check((manifest.description || "").length >= 10 && manifest.description.length <= 250, "manifest.json: description must contain 10-250 characters");
check(/^[A-Z]/.test(manifest.description || "") && /\.$/.test(manifest.description || ""), "manifest.json: description must start with a capital letter and end with a period");
check(!/[\r\n]/.test(manifest.description || ""), "manifest.json: description must be a single line");
check(manifest.author === "Murat", "manifest.json: author must match the project owner");
check(/^https:\/\/github\.com\/arias007\/?$/.test(manifest.authorUrl || ""), "manifest.json: authorUrl must identify the project owner");
check(/Copyright \(c\) \d{4} Murat/.test(requiredSources.LICENSE), "LICENSE: copyright owner must be Murat");
check(packageJson.scripts?.lint, "package.json: lint script is required");
check(packageJson.scripts?.verify?.includes("npm run review"), "package.json: verify must run the community review");

const sourceFiles = await collectFiles("src");
const scanFiles = [...sourceFiles, "main.js", "README.md", "styles.css"];
const forbiddenPatterns = [
  [/\.(?:innerHTML|outerHTML)\b/, "unsafe HTML property"],
  [/\.insertAdjacentHTML\b/, "insertAdjacentHTML"],
  [/\bdocument\.write\b/, "document.write"],
  [/\beval\s*\(/, "eval"],
  [/\bnew\s+Function\s*\(/, "Function constructor"],
  [/\.activeLeaf\b/, "workspace.activeLeaf"],
  [/notedraw-settings-codes|supportCodeAlipay|supportCodeBinance|code-1\.jpg|code-2\.png/i, "removed support-code UI"]
];
for (const file of scanFiles) {
  const source = await readText(file);
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(source)) errors.push(`${file}: contains ${label}`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`Community review failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Community review passed (${scanFiles.length} files scanned).\n`);
}
