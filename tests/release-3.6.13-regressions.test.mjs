import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

test("startup defers global surface work and skips irrelevant embed hydration", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const onload = source.slice(source.indexOf("  async onload()"), source.indexOf("  onunload()"));
  const scheduler = source.slice(source.indexOf("  scheduleSurfaceSync("), source.indexOf("  scheduleMindMapFilePicker("));

  assert.doesNotMatch(onload, /this\.runSurfaceSync\(\)/);
  assert.match(onload, /this\.scheduleSurfaceSync\(24\)/);
  assert.match(onload, /el\.matches\?\.\("img,video,audio,source,a,\.internal-embed"\)/);
  assert.match(onload, /el\.matches\?\.\(MARKDOWN_EMBED_SELECTOR\)/);
  assert.match(scheduler, /this\.surfaceSyncDueAt <= dueAt/);
  assert.match(scheduler, /window\.clearTimeout\(this\.surfaceSyncTimer\)/);
});

test("properties and text editing retain native interaction and local history", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const startEdit = source.slice(source.indexOf("  startTextEdit("), source.indexOf("  focusSourceEditorAt("));
  const history = source.slice(source.indexOf("  async undoLastStroke()"), source.indexOf("  deleteSelectedStroke()"));

  assert.match(source, /var METADATA_PROPERTY_SELECTOR = "\.metadata-property"/);
  assert.match(source, /activateMetadataPropertyEditor\(metadataProperty, clientPoint\)/);
  assert.match(source, /dispatchMouseClickThroughOverlay\(this\.canvas, point\)/);
  assert.match(startEdit, /this\.isTextEditingControlTarget\(active\)/);
  assert.match(startEdit, /\}, 120\)/);
  assert.match(history, /this\.applyActiveTextHistory\("undo"\)/);
  assert.match(history, /this\.applyActiveTextHistory\("redo"\)/);
  assert.match(history, /activeDocument\.execCommand\?\.\(direction/);
});

test("DOM replacement rebinds the active Markdown selection", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const presentation = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  ensureReadingHeadingCollapseIndicators()"));
  const rebind = source.slice(source.indexOf("  rebindMarkdownSelectionActivation()"), source.indexOf("  markdownSelectionCanEditOrDrag("));

  assert.match(presentation, /selectedElementChanged[\s\S]*this\.rebindMarkdownSelectionActivation\(\)/);
  assert.match(rebind, /this\.markdownBlockElements\.get\(activation\.id\)/);
  assert.match(rebind, /this\.captureSelectionFrameSnapshot\(\{ force: true \}\)/);
});

test("ink geometry, cross-view grouping, and text highlights preserve their anchors", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /preserveAspectRatio: !isTextLikeStroke\(stroke\) && !isEmbedStroke\(stroke\)/);
  assert.match(source, /captureElementRelations\(items, \{[\s\S]*nearDistance: 0/);
  assert.match(source, /filter\(\(relation\) => relation\.kind === "intersection"\)/);
  assert.match(source, /captureTextHighlightAnchor\(stroke, lineRect\)/);
  assert.match(source, /restoreTextHighlightAnchors\(\)/);
  assert.match(source, /textAnchor: normalizeTextHighlightAnchor\(stroke\?\.textAnchor\)/);
});

test("editing view defaults to Edit MD and command buttons execute only in reading mode", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pending = source.slice(source.indexOf("  applyPendingSelectionTap("), source.indexOf("  executeButtonCommand("));

  assert.match(source, /defaultSourceEditMarkdown: true/);
  assert.match(source, /this\.surfaceType === "source" && this\.runtimeSettings\.defaultSourceEditMarkdown[\s\S]*TOOL_EDIT_MD/);
  assert.match(source, /this\.applySharedToolbarState\(this\.plugin\.controllerToolbarState\(this\)\);[\s\S]*this\.surfaceType === "source" && this\.runtimeSettings\.defaultSourceEditMarkdown[\s\S]*this\.toolMode = TOOL_EDIT_MD/);
  assert.match(source, /createSettingDefinition\("defaultSourceEditMarkdown"/);
  assert.doesNotMatch(pending, /executeButtonCommand/);
  assert.match(source, /!isCommandButton \|\| this\.active \|\| this\.surfaceType !== "preview"/);
});

test("adjacent boxed inline elements share one non-overlapping frame boundary", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /elementGroupFrameRect\(groupId\)/);
  assert.match(source, /markdownInlineSelectionClientLimits\(element, elementRect, \{ includeSelectedPeers: true \}\)/);
  assert.match(source, /roundRect\(this\.ctx, frame\.x, frame\.y, frame\.width, frame\.height, this\.frameCornerRadius\(\)\)/);
  assert.match(source, /roundRect\(\s*this\.underlayCtx,\s*frame\.x,\s*frame\.y,\s*frame\.width,\s*frame\.height,/s);
});
