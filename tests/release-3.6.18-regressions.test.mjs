import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("selection and contextual locked-group frames are dashed and use configurable square corners", async () => {
  const [source, styles] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  const selection = source.slice(source.indexOf("  drawSelection()"), source.indexOf("  drawSelectionDragRect("));
  const groups = source.slice(source.indexOf("  drawElementGroups("), source.indexOf("  drawStaticStrokeBoxOn("));

  assert.match(source, /frameCornerRadius: 0/);
  assert.match(selection, /setLineDash\(\[3, 2\]\)/);
  assert.match(groups, /group\.boxed \? \[\] : \[3, 2\]/);
  assert.match(source, /frameCornerRadius\(\)/);
  assert.match(source, /--notedraw-frame-radius/);
  assert.match(styles, /border-radius: var\(--notedraw-frame-radius, 0\)/);
});

test("visible locked-group frame lines select the whole group before member hit testing", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerDown = source.slice(source.indexOf("  onPointerDown(event"), source.indexOf("  startConnectorGesture("));

  assert.ok(pointerDown.indexOf("const lockedGroupFrameHit") < pointerDown.indexOf("if (canEditMarkdownText)"));
  assert.match(pointerDown, /type: "select-group"[\s\S]*groupId: lockedGroupFrameHit\.id/);
  assert.match(source, /findLockedElementGroupFrameAtPoint\(point\)[\s\S]*groupFrameShouldBeVisible/);
});

test("hard text watercolor bindings follow stable Markdown owners and prune only without text evidence", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const capture = source.slice(source.indexOf("  captureTextHighlightAnchor("), source.indexOf("  restoreTextHighlightAnchors("));
  const restore = source.slice(source.indexOf("  restoreTextHighlightAnchors("), source.indexOf("  scheduleDeletedTextHighlightPrune("));
  const prune = source.slice(source.indexOf("  scheduleDeletedTextHighlightPrune("), source.indexOf("  detachTextHighlightAnchors("));

  assert.match(capture, /mode: "hard"[\s\S]*ownerId: owner\.id/);
  assert.ok(restore.indexOf("anchor.ownerId && rect.blockId === anchor.ownerId") < restore.indexOf("rect.lineStart === anchor.lineStart"));
  assert.match(prune, /textBindingEvidenceTokens\(hint\)[\s\S]*!evidence\.some/);
  assert.match(source, /detachTextHighlightAnchors\(indexes\)/);
});

test("parallel rows scroll horizontally and keep their shared border away from task controls", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /\.notedraw-md-grid-row[\s\S]*overflow-x: auto[\s\S]*overscroll-behavior-x: contain/);
  assert.match(styles, /\.notedraw-md-grid > \.notedraw-md-grid-item \+ \.notedraw-md-grid-item::before[\s\S]*left: -9px/);
});

test("existing floating text edits in place and commits when focus leaves", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const styles = await readFile(stylesUrl, "utf8");
  const openEditor = source.slice(source.indexOf("  openFloatingTextInput("), source.indexOf("  updateFloatingTextInputPosition("));

  assert.match(openEditor, /contenteditable: "plaintext-only"/);
  assert.match(openEditor, /addEventListener\("blur", \(\) => editorWindow\.setTimeout\(commit, 0\)\)/);
  assert.match(source, /state\.inPlace \? state\.element\.innerText : state\.element\.value/);
  assert.match(styles, /\.notedraw-floating-text-input\.is-in-place/);
});

test("boxed Markdown and element frames are connector targets with stable relationship groups", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const targets = source.slice(source.indexOf("  collectSnapTargets()"), source.indexOf("  connectorTargetBoundsById("));
  const sync = source.slice(source.indexOf("  syncBoundConnectors("), source.indexOf("  drawBoundConnectorOn("));
  const groups = source.slice(source.indexOf("  syncConnectorElementGroups("), source.indexOf("  elementGroup("));

  assert.match(source, /Boolean\(stroke\?\.boxed\)/);
  assert.match(targets, /id: `md:\$\{block\.id\}`[\s\S]*id: `group:\$\{group\.id\}`/);
  assert.match(sync, /needsExternalTargetBounds[\s\S]*\^\(\?:md\|group\):/);
  assert.match(groups, /markdownNodes[\s\S]*relationOwned: true/);
  assert.match(source, /markdownConnectorIds[\s\S]*syncBoundConnectors\(\{ elementIds: markdownConnectorIds, syncGroups: false \}\)/);
});

test("public drawing-data API remains additive and exposes normalized compatibility data", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /apiVersion: "1\.0"/);
  assert.match(source, /dataSchemaVersion: 2/);
  assert.match(source, /drawingDataExchange: \["read", "parse", "normalize", "inspect", "serialize"\]/);
  assert.match(source, /getElementById:[\s\S]*getConnections:[\s\S]*getTextBindings:/);
  assert.match(source, /normalizeDrawingData:[\s\S]*inspectDrawingData:/);
  assert.match(source, /typeof value\?\.ownerId === "string"[\s\S]*typeof value\?\.blockId === "string"/);
});
