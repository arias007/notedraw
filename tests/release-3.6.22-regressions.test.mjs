import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);
const versionsUrl = new URL("../versions.json", import.meta.url);

test("parallel row borders stay left of task controls and element drags are not row-scroll gestures", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const pointer = source.slice(source.indexOf("  onPointerDown("), source.indexOf("  onPointerMove("));
  const pending = source.slice(source.indexOf("  updatePendingSelectionTap("), source.indexOf("  applyPendingSelectionTap("));

  assert.ok(styles.includes("left: -12px"));
  assert.ok(pointer.includes('type: "scroll-row"'));
  assert.ok(!pointer.includes('type: "drag-selection"'));
  assert.ok(pending.includes('pending.type === "scroll-row"'));
  assert.ok(pending.includes("pending.scrollRow.scrollLeft"));
  assert.ok(pending.includes('"enter-stroke-group"'));
  assert.ok(pending.includes('"enter-markdown-group"'));
});

test("locked group members can be manipulated after entering the group while frame selection remains group-wide", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const drag = source.slice(source.indexOf("  startSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag("));
  const resize = source.slice(source.indexOf("  startSelectedStrokeResize("), source.indexOf("  moveSelectedStrokeResize("));
  const handle = source.slice(source.indexOf("  findSelectionHandleAt("), source.indexOf("  selectedStrokeFrameContains("));

  assert.ok(source.includes("canManipulateGroupedElement(item)"));
  assert.ok(source.includes("this.enteredElementGroupIds.has(groupId)"));
  assert.ok(drag.includes("this.canManipulateGroupedElement(stroke)"));
  assert.ok(drag.includes("this.canManipulateGroupedElement(block)"));
  assert.ok(resize.includes("this.canManipulateGroupedElement(this.drawingData.strokes[index])"));
  assert.ok(resize.includes("this.canManipulateGroupedElement(block)"));
  assert.ok(handle.includes("const canResize = (item) => this.canManipulateGroupedElement(item)"));
});

test("reading checkbox mutations reapply the frozen parallel row widths", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const mutation = source.slice(source.indexOf("  rememberMarkdownIdentityMutation("), source.indexOf("  restorePendingMarkdownIdentityPresentation("));
  const restore = source.slice(source.indexOf("  restorePendingMarkdownIdentityWidths("), source.indexOf("  ensureReadingHeadingCollapseIndicators("));

  assert.ok(mutation.includes("for (const delay of [0, 48, 180])"));
  assert.ok(mutation.includes("restorePendingMarkdownIdentityPresentation()"));
  assert.ok(restore.includes("block.span = span"));
  assert.ok(restore.includes("block.widthScale = widthScale"));
  assert.ok(restore.includes("applyMarkdownBlockWidthPresentation(block, element)"));
});

test("hidden previews are destroyed and NoteDraw wrappers are ignored by mutation scans", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const modeSync = source.slice(source.indexOf("  syncMarkdownControllerModes()"), source.indexOf("  syncEmbeddedMarkdownControllers()"));
  const owned = source.slice(source.indexOf("var NOTEDRAW_OWNED_MUTATION_SELECTOR"), source.indexOf("var NoteDrawFileSuggestModal"));

  assert.ok(modeSync.includes("controller.destroy();"));
  assert.ok(owned.includes(".notedraw-md-grid-row"));
  assert.ok(owned.includes(".notedraw-md-line-block"));
});

test("release metadata matches the current release", async () => {
  const [manifest, versions] = await Promise.all([
    readFile(manifestUrl, "utf8").then(JSON.parse),
    readFile(versionsUrl, "utf8").then(JSON.parse)
  ]);
  assert.equal(manifest.version, "3.7.2");
  assert.equal(versions["3.7.2"], manifest.minAppVersion);
});
