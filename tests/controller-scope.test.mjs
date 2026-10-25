import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

// Methods the controller inherits from Obsidian's Component / plain Object.
// Everything else the controller calls through `this` has to come from its own
// class body: a helper parked in NoteDrawPlugin instead is a TypeError at the
// first pointer event, which takes every tool down at once.
const INHERITED = new Set([
  "register", "registerEvent", "registerDomEvent", "registerInterval",
  "unload", "onload", "addChild", "removeChild", "children",
  "toString", "hasOwnProperty", "valueOf", "constructor"
]);

function classBody(source, header) {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `missing class header: ${header}`);
  const bodyStart = start + header.length;
  const next = source.indexOf("\nvar ", bodyStart);
  return source.slice(bodyStart, next < 0 ? source.length : next);
}

function definedMembers(body) {
  const names = new Set();
  for (const match of body.matchAll(/^ {2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    names.add(match[1]);
  }
  for (const match of body.matchAll(/^ {2}get\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
    names.add(match[1]);
  }
  for (const match of body.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) {
    names.add(match[1]);
  }
  return names;
}

test("the drawing controller never calls a helper that lives on the plugin", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pluginBody = classBody(source, "var NoteDrawPlugin = class extends Plugin {");
  const controllerBody = classBody(source, "var PreviewDrawingController = class {");
  const controllerMembers = definedMembers(controllerBody);
  const pluginOnly = [...definedMembers(pluginBody)].filter((name) => !controllerMembers.has(name));

  const missing = new Set();
  for (const match of controllerBody.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = match[1];
    if (controllerMembers.has(name) || INHERITED.has(name) || !pluginOnly.includes(name)) {
      continue;
    }
    missing.add(name);
  }
  assert.deepEqual([...missing], [], "controller calls plugin-only methods");
});
