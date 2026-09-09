import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);
const contributingUrl = new URL("../CONTRIBUTING.md", import.meta.url);
const architectureUrl = new URL("../docs/architecture.md", import.meta.url);

test("viewport zoom changes do not preserve stale CSS-pixel placement", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const resize = source.slice(source.indexOf("  onResize() {"), source.indexOf("  onReadingVirtualScrollCapture() {"));
  const viewportZoom = source.slice(source.indexOf("  currentViewportZoomFactor() {"), source.indexOf("  scheduleResponsiveProjectionSettle("));
  const preserve = source.slice(source.indexOf("  preserveAbsoluteStrokePlacement("), source.indexOf("  initializeAndProjectResponsivePoints(", source.indexOf("  preserveAbsoluteStrokePlacement(")));

  assert.match(resize, /this\.noteViewportZoomChange\(\)/);
  assert.match(viewportZoom, /window\.devicePixelRatio/);
  assert.match(viewportZoom, /window\.visualViewport\?\.scale/);
  assert.match(viewportZoom, /getBoundingClientRect\?\.\(\)/);
  assert.match(viewportZoom, /offsetWidth/);
  assert.match(viewportZoom, /this\.responsiveProjectionPending = null/);
  assert.match(preserve, /if \(this\.isViewportZoomInteractionActive\(\)\) \{\s*return;/);
});

test("drawing history is applied to the live controller before persistence", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const apply = source.slice(source.indexOf("  applyHistoryDrawingData("), source.indexOf("  async applyControllerHistoryEntry("));
  const history = source.slice(source.indexOf("  async applyControllerHistoryEntry("), source.indexOf("  setControllerActivation("));

  assert.match(apply, /controller\.drawingData = data/);
  assert.match(apply, /controller\.rebuildElementRelations\(\)/);
  assert.match(history, /applyHistoryDrawingData\(controller, drawingFile, data\)[\s\S]*scheduleDrawingSave/);
  assert.match(history, /applyHistoryDrawingData\(controller, entry\.file, data\)[\s\S]*scheduleDrawingSave/);
  assert.match(history, /vault\.cachedRead\(markdownFile\)/);
  assert.match(history, /vault\.cachedRead\(file\)/);
});

test("Markdown history refreshes are frame-batched instead of waiting on a fixed timer", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const refresh = source.slice(source.indexOf("  refreshControllerAfterMarkdownHistory("), source.indexOf("  applyHistoryDrawingData(", source.indexOf("  refreshControllerAfterMarkdownHistory(")));

  assert.match(refresh, /controller\.historyRefreshFrameId/);
  assert.match(refresh, /window\.requestAnimationFrame\(refresh\)/);
  assert.doesNotMatch(refresh, /setTimeout\(.*48/);
});

test("rapid undo and redo requests are serialized per controller", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const history = source.slice(source.indexOf("  enqueueHistoryNavigation("), source.indexOf("  applyActiveTextHistory("));

  assert.match(history, /const previous = this\.historyNavigationPromise \|\| Promise\.resolve\(\)/);
  assert.match(history, /this\.historyNavigationPromise = queued/);
  assert.match(history, /this\.runHistoryNavigation\("undo"\)/);
  assert.match(history, /this\.runHistoryNavigation\("redo"\)/);
});

test("release 3.7.9 metadata and contributor documentation are present", async () => {
  const [manifest, pkg, contributing, architecture] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    readFile(packageUrl, "utf8"),
    readFile(contributingUrl, "utf8"),
    readFile(architectureUrl, "utf8")
  ]);

  assert.match(manifest, /"version": "3\.7\.9"/);
  assert.match(pkg, /"version": "3\.7\.9"/);
  assert.match(contributing, /项目结构/);
  assert.match(contributing, /npm run verify/);
  assert.match(contributing, /Issue #2/);
  assert.match(contributing, /Issue #3/);
  assert.match(architecture, /Coordinate contracts/);
  assert.match(architecture, /History and persistence/);
});
