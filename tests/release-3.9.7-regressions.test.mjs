import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

test("Markdown selection falls back to the concrete owner under renderer layers", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointer = source.slice(source.indexOf("  onPointerDown(event"), source.indexOf("  startConnectorGesture("));
  const resolver = source.slice(source.indexOf("  markdownBlockElementAtClientPoint("), source.indexOf("  markdownBlockElementForTarget(", source.indexOf("  markdownBlockElementAtClientPoint(")));
  assert.match(pointer, /markdownBlockElementForTarget\(metadataTarget, clientPoint\)[\s\S]*markdownBlockElementAtClientPoint\(clientPoint\)/);
  assert.match(resolver, /markdownBlockCandidateElements\(this\.previewEl\)[\s\S]*markdownElementContainsClientPoint/);
  assert.match(resolver, /hits\.sort\([\s\S]*left\.area - right\.area/);
});

test("a freehand stroke captures only its own canonical projection during insertion", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const capture = source.slice(source.indexOf("  captureResponsiveAnchorsForIndexes("), source.indexOf("  captureNoteFlowResponsiveAnchors(", source.indexOf("  captureResponsiveAnchorsForIndexes(")));
  const finish = source.slice(source.indexOf("      this.captureResponsiveAnchorsForIndexes([insertedIndex]"), source.indexOf("      this.syncConnectorElementGroups(", source.indexOf("      this.captureResponsiveAnchorsForIndexes([insertedIndex]")));
  assert.match(capture, /options\.isolated !== true[\s\S]*this\.rebuildElementRelations\(\);[\s\S]*this\.captureCanonicalProjectionSource\(\);/);
  assert.match(capture, /options\.isolated !== true[\s\S]*captureCanonicalProjectionSource\(\{ indexes \}\)/);
  assert.match(finish, /captureResponsiveAnchorsForIndexes\(\[insertedIndex\], \{ isolated: !insertedNoteFlow \}\)/);
});

test("resize projection yields to an in-progress pen stroke", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const resize = source.slice(source.indexOf("  resizeCanvas("), source.indexOf("  onPointerDown(", source.indexOf("  resizeCanvas(")));
  assert.match(resize, /const drawingGeometryAuthoritative = Boolean\(this\.currentStroke\);/);
  assert.match(resize, /if \(drawingGeometryAuthoritative\) \{[\s\S]*this\.responsiveProjectionPending = null;/);
  assert.match(resize, /else if \(this\.drawingsLoaded && refreshLayout && !dragGeometryAuthoritative\)/);
});
