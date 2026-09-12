import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);
const versionsUrl = new URL("../versions.json", import.meta.url);

test("drag persistence is guarded per Markdown file and publishes one final snapshot", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const refresh = source.slice(source.indexOf("  refreshControllersForFile("), source.indexOf("  async handleVaultFileDelete("));
  const read = source.slice(source.indexOf("  async readDrawings("), source.indexOf("  async loadPortableBundle("));
  const transaction = source.slice(source.indexOf("  beginDrawingDragTransaction("), source.indexOf("  scheduleMindMapFilePicker("));

  assert.match(source, /this\.drawingDragTransactions = .*new Map\(\)/);
  assert.match(refresh, /drawingDragTransactions\?\.get\(this\.drawingDragTransactionKey\(file\)\)/);
  assert.match(refresh, /options\.dragTransactionCommit !== true/);
  assert.match(read, /dragTransaction\?\.controller\?\.drawingData/);
  assert.match(read, /preferCommittedDrawingSnapshot\(file, candidates\[0\] \|\| null\)/);
  assert.match(transaction, /transaction\.finalData = controller\?\.drawingData/);
  assert.match(transaction, /completionStarted: false/);
  assert.match(transaction, /cancelScheduledDrawingSave\(storageKey\)/);
  assert.match(transaction, /scheduleDrawingSave\(file, finalData, \{ userOperation: true, replace: true \}\)/);
  assert.match(transaction, /await this\.flushDrawingSave\(storageKey\)/);
  assert.match(transaction, /this\.drawingDragTransactions\.delete\(key\)/);
});

test("local drawing commits survive toolbar and tab refresh races", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const lifecycle = source.slice(source.indexOf("  rememberDrawingCommitSnapshot("), source.indexOf("  drawingDragTransactionKey("));
  const save = source.slice(source.indexOf("  scheduleDrawingSave("), source.indexOf("  cancelScheduledDrawingSave("));
  const write = source.slice(source.indexOf("  async writeDrawings("), source.indexOf("  async writeAttachmentLinkBlock("));

  assert.match(source, /this\.drawingCommitSnapshots = .*new Map\(\)/);
  assert.match(lifecycle, /this\.drawingStateCache\.set\(storageKey, normalized\)/);
  assert.match(lifecycle, /selectedAt <= committedAt/);
  assert.match(source, /const committed = storageKey \? this\.drawingCommitSnapshots\?\.get\(storageKey\) : null/);
  assert.match(source, /data = committed\.data/);
  assert.match(save, /this\.rememberDrawingCommitSnapshot\(file, data\)/);
  assert.match(write, /normalized\.updatedAt = updatedAt[\s\S]*this\.rememberDrawingCommitSnapshot\(file, normalized\)/);
  assert.match(source, /this\.drawingCommitSnapshots\.clear\(\)/);
});

test("controller drag completion releases the local lock only after plugin finalization starts", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const completion = source.slice(source.indexOf("  completeDragTransaction("), source.indexOf("  clearSelectedStrokeDragState("));

  assert.match(completion, /this\.plugin\.publishDrawingDragTransaction\(this, transactionId\)/);
  assert.match(completion, /this\.dragTransactionPending = false/);
  assert.match(completion, /this\.plugin\.completeDrawingDragTransaction\(this, transactionId\)/);
  assert.match(completion, /completeDrawingDragTransaction\(this, transactionId\)\.then\([\s\S]*scheduleExternalDrawingRefresh\(this\.file\?\.path, 0\)/);
});

test("closing the toolbar does not cancel an asynchronous Markdown drop", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const active = source.slice(source.indexOf("  applyActiveState("), source.indexOf("  controlsShouldBeVisible("));
  const cancel = source.slice(source.indexOf("  cancelSelectedStrokeDrag("), source.indexOf("  restoreDragTransactionSnapshot("));

  assert.match(active, /awaitingMarkdownCommit = Boolean\([\s\S]*dragTransactionPending[\s\S]*selectionFrameAwaitingMarkdownSync/);
  assert.match(active, /preserveTransaction: preserveDragCommit/);
  assert.match(cancel, /preserveTransaction = options\.preserveTransaction === true/);
  assert.match(cancel, /preserveMarkdownDom: options\.preserveMarkdownDom === true/);
  assert.match(cancel, /if \(!preserveTransaction\) \{[\s\S]*completeDragTransaction/);
});

test("release metadata advances to 3.9.5", async () => {
  const [manifest, versions] = await Promise.all([
    readFile(manifestUrl, "utf8").then(JSON.parse),
    readFile(versionsUrl, "utf8").then(JSON.parse)
  ]);
  assert.equal(manifest.version, "3.9.5");
  assert.equal(versions["3.9.5"], manifest.minAppVersion);
});
