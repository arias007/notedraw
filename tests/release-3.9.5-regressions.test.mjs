import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);
const versionsUrl = new URL("../versions.json", import.meta.url);

test("a released doodle remains protected until its serialized write finishes", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const completion = source.slice(source.indexOf("  completeDragTransaction("), source.indexOf("  clearSelectedStrokeDragState("));
  const active = source.slice(source.indexOf("  applyActiveState("), source.indexOf("  controlsShouldBeVisible("));

  assert.match(completion, /this\.plugin\.publishDrawingDragTransaction\(this, transactionId\);/);
  assert.doesNotMatch(completion.slice(0, completion.indexOf("this\.plugin\.completeDrawingDragTransaction")), /dragTransactionPending = false/);
  assert.match(completion, /completeDrawingDragTransaction\(this, transactionId\)\.then\([\s\S]*dragTransactionPending = false/);
  assert.match(completion, /completeDrawingDragTransaction\(this, transactionId\)\.then\([\s\S]*\.catch\([\s\S]*dragTransactionPending = false/);
  assert.match(active, /pendingReleasedDragCommit = Boolean\([\s\S]*this\.dragTransactionPending[\s\S]*!this\.pointerDown/);
  assert.match(active, /preserveDragCommit = awaitingMarkdownCommit \|\| releasedDragCommit \|\| pendingReleasedDragCommit/);
});

test("release metadata advances to 3.9.5", async () => {
  const [manifest, versions] = await Promise.all([
    readFile(manifestUrl, "utf8").then(JSON.parse),
    readFile(versionsUrl, "utf8").then(JSON.parse)
  ]);
  assert.equal(manifest.version, "3.9.5");
  assert.equal(versions["3.9.5"], manifest.minAppVersion);
});
