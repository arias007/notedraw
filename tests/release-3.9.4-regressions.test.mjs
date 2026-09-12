import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);
const versionsUrl = new URL("../versions.json", import.meta.url);

test("background reading surfaces cannot reproject or restore NoteFlow", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /isCurrentReadingSurface\(\)/);
  assert.match(source, /if \(this\.surfaceType === "preview" && !this\.isCurrentReadingSurface\(\)\) \{[\s\S]*setReadingSurfaceSettling\(true\)[\s\S]*return false;/);
  assert.match(source, /reconcileSettledReadingSurface\(\)[\s\S]*!this\.isCurrentReadingSurface\(\)[\s\S]*this\.dragTransactionPending/);
  assert.match(source, /prepareFrozenNoteFlowLayout\(options = \{\}\)[\s\S]*!this\.isCurrentReadingSurface\(\)/);
  assert.match(source, /restoreFrozenNoteFlowLayout\(\)[\s\S]*!this\.isCurrentReadingSurface\(\)/);
  assert.match(source, /onResize\(\)[\s\S]*!this\.isCurrentReadingSurface\(\)[\s\S]*return;/);
  assert.match(source, /scheduleReadingSurfaceVisibilityRecovery\(\)[\s\S]*!this\.isCurrentReadingSurface\(\)/);
});

test("tab return cancels stale NoteFlow restore before one visibility recovery", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const sync = source.slice(source.indexOf("  runSurfaceSync()"), source.indexOf("  syncMarkdownModeSurfaces()"));
  assert.match(sync, /if \(becameVisible \|\| becameCurrentLeaf\) \{[\s\S]*cancelFrozenNoteFlowLayoutRestore\(\);[\s\S]*scheduleReadingSurfaceVisibilityRecovery\(\);/);
  assert.match(source, /setSurfaceAuthorityCurrent\(current\)[\s\S]*setReadingSurfaceSettling\(!next \|\| !this\.isCurrentReadingSurface\(\)\)/);
});

test("closing the wand preserves a released drag while its transaction is flushing", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const active = source.slice(source.indexOf("  applyActiveState("), source.indexOf("  controlsShouldBeVisible("));
  assert.match(active, /releasedDragCommit = Boolean\([\s\S]*dragTransactionPending[\s\S]*dragStrokeMoved[\s\S]*!this\.pointerDown/);
  assert.match(active, /preserveDragCommit = awaitingMarkdownCommit \|\| releasedDragCommit/);
  assert.match(active, /cancelSelectedStrokeDrag\(!preserveDragCommit, \{[\s\S]*preserveTransaction: preserveDragCommit/);
});

test("release metadata advances to 3.9.4", async () => {
  const [manifest, versions] = await Promise.all([
    readFile(manifestUrl, "utf8").then(JSON.parse),
    readFile(versionsUrl, "utf8").then(JSON.parse)
  ]);
  assert.equal(manifest.version, "3.9.4");
  assert.equal(versions["3.9.4"], manifest.minAppVersion);
});
