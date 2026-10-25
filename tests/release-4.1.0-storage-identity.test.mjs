import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  drawingFileName,
  drawingPathHash,
  drawingRecordBelongsToPath,
  legacyDrawingFileName
} from "../src/drawing-file-identity.mjs";
import {
  shouldDeselectOnBlankPress,
  shouldShowSelectionFrame
} from "../src/selection-draw-gesture.mjs";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

test("drawing storage names stay unique for same-length non-ASCII titles", () => {
  // Pre-4.1 both notes became "____________.md.json" and shared one file, so
  // ink from one note appeared on the other.
  const first = "生活/身体/舞蹈.md";
  const second = "生活/身体/运动.md";
  assert.equal(legacyDrawingFileName(first), legacyDrawingFileName(second));
  assert.notEqual(drawingFileName(first), drawingFileName(second));
  assert.match(drawingFileName(first), /^[A-Za-z0-9._-]+\.json$/);
});

test("drawing storage names are stable, path-sensitive and collision free", () => {
  assert.equal(drawingFileName("笔记/职场.md"), drawingFileName("笔记/职场.md"));
  assert.notEqual(drawingFileName("笔记/职场.md"), drawingFileName("笔记/职场 .md"));
  assert.notEqual(drawingFileName("a/内容.md"), drawingFileName("b/内容.md"));
  assert.equal(drawingPathHash("x.md"), drawingPathHash("x.md"));
  assert.equal(drawingPathHash("x.md").length, 14);

  const names = new Set();
  const paths = [];
  for (let index = 0; index < 4000; index += 1) {
    paths.push(`分类${index % 37}/笔记${index}.md`);
  }
  for (const path of paths) {
    names.add(drawingFileName(path));
  }
  assert.equal(names.size, paths.length);
});

test("a stored drawing only belongs to the note its sourcePath names", () => {
  assert.equal(drawingRecordBelongsToPath({ sourcePath: "生活/身体/舞蹈.md" }, "生活/身体/舞蹈.md"), true);
  assert.equal(drawingRecordBelongsToPath({ sourcePath: "生活/身体/舞蹈.md" }, "生活/身体/运动.md"), false);
  assert.equal(drawingRecordBelongsToPath({ sourcePath: "" }, "生活/身体/运动.md"), true);
  assert.equal(drawingRecordBelongsToPath({}, "生活/身体/运动.md"), true);
});

test("the element frame belongs to the select tool, not to inking", () => {
  assert.equal(shouldShowSelectionFrame({ toolMode: "select" }), true);
  assert.equal(shouldShowSelectionFrame({ toolMode: "draw" }), false);
  assert.equal(shouldShowSelectionFrame({ toolMode: "draw", dragging: true }), true);
  assert.equal(shouldShowSelectionFrame({ toolMode: "draw", dragging: false }), false);
});

test("a blank press deselects while the same press keeps drawing", () => {
  const base = { toolMode: "draw", hasSelection: true };
  assert.equal(shouldDeselectOnBlankPress(base), true);
  assert.equal(shouldDeselectOnBlankPress({ ...base, hasSelection: false }), false);
  assert.equal(shouldDeselectOnBlankPress({ ...base, toolMode: "select" }), false);
  assert.equal(shouldDeselectOnBlankPress({ ...base, toolMode: "text" }), false);
  assert.equal(shouldDeselectOnBlankPress({ ...base, hitStrokeIndex: 3, hitIsSelected: true }), false);
  assert.equal(shouldDeselectOnBlankPress({ ...base, hitStrokeIndex: 3, hitIsSelected: false }), true);
  assert.equal(shouldDeselectOnBlankPress({ ...base, insideSelectionFrame: true }), false);
});

test("the controller hides frames, handles and legacy sharing", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /encodedDrawingNameForFile\(file\) \{\s*return drawingFileName\(file\?\.path \|\| ""\);/);
  assert.match(source, /legacyEncodedDrawingNameForFile\(file\) \{\s*return legacyDrawingFileName\(file\?\.path \|\| ""\);/);
  // Draw mode must bail out before painting the dashed frame or its handles.
  assert.match(source, /drawSelection\(\) \{[\s\S]*if \(!this\.selectionFrameVisible\(\)\) \{/);
  assert.match(source, /let resizeHandle = noteFlowPenActive \|\| !this\.selectionFrameVisible\(\) \? null : this\.findSelectionHandleAt\(point\);/);
  // Legacy names are only adopted when the record proves the ownership.
  assert.match(source, /if \(!data \|\| !drawingRecordBelongsToPath\(data, file\?\.path \|\| ""\)\) \{\s*continue;/);
  assert.match(source, /const legacyMigration = Boolean\(selected[\s\S]*selected\.kind === "legacy-name"[\s\S]*await this\.writeDrawings\(file, data, \{ refresh: false \}\);/);
  // Renaming a note must carry its ink instead of stranding it.
  assert.match(source, /this\.app\.vault\.on\("rename"/);
  assert.match(source, /async handleVaultFileRename\(file, oldPath\) \{[\s\S]*await this\.flushPendingDrawingSavesForPath\(oldNormalized\)[\s\S]*await adapter\.rename\(fromPath, toPath\)[\s\S]*stored\.sourcePath = file\.path;/);
  // The old path no longer exists during a rename, so mode resolution must not
  // fall back to config three times.
  assert.match(source, /rawDrawingPathForFile\(filePath, mode = this\.noteDrawSettings\?\.drawingStorageMode\)/);
});
