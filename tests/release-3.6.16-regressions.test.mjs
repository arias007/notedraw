import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("connector and NoteFlow handwriting groups are persisted selectable units", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /syncConnectorElementGroups\(\)/);
  assert.match(source, /relationOwned: true/);
  assert.match(source, /relationKey/);
  assert.match(source, /isNoteFlowInkStroke\(item\)/);
  assert.match(source, /this\.syncConnectorElementGroups\(\);[\s\S]*this\.recordDrawingHistory\(historyBefore\)/);
  assert.doesNotMatch(source, /expandRelatedSelection/);
  assert.doesNotMatch(source, /key: "selectRelatedElements"/);
});

test("typing stages ordinary preview edits and keeps button command setup deferred", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("  startTextEdit(");
  const end = source.indexOf("  focusSourceEditorAt(", start);
  const edit = source.slice(start, end);
  assert.match(edit, /this\.plugin\.stageTextSave\(this\.currentEditorFile, original, edited, element, this\)/);
  assert.doesNotMatch(edit, /this\.plugin\.scheduleTextSave\(this\.currentEditorFile, original, edited, element, this\)/);
  assert.match(source, /this\.pendingButtonCommandPicker = item\.id === "button"/);
  assert.match(source, /openButtonCommandPicker\(this, insertedIndex\)/);
});

test("reading view keeps command buttons and boxed embeds visible without the active canvas", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const styles = await readFile(stylesUrl, "utf8");
  assert.match(source, /node\.toggleClass\("is-boxed", Boolean\(stroke\.boxed\)\)/);
  assert.match(source, /if \(!this\.active && this\.surfaceType === "preview"[\s\S]*executeElementCommand\(commandTarget\)/);
  assert.match(source, /drawElementGroups\(this\.staticCtx\)/);
  assert.match(source, /clampCanvasFrameForDisplay/);
  assert.match(styles, /\.notedraw-embed\.is-boxed[\s\S]*border: 1\.25px solid/);
});

test("metadata properties remain native editable targets", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /const metadataTarget = Array\.from\(activeDocument\.elementsFromPoint/);
  assert.match(source, /activateMetadataPropertyEditor\(metadataProperty, clientPoint\)/);
  assert.match(source, /const value = property\.querySelector\?\.\("\.metadata-property-value, \.metadata-input-longtext, input, textarea, select"\)/);
});
