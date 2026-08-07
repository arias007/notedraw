import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeControllerDrawingSnapshot } from "../src/drawing-persistence.mjs";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

test("controller saves retain Markdown block records missing from a stale view", () => {
  const latest = {
    strokes: [
      { elementId: "stroke-current", width: 1 },
      { elementId: "stroke-keep", width: 2 }
    ],
    markdownBlocks: [
      { id: "block-a", textHint: "old A", groupId: "" },
      { id: "block-b", textHint: "keep B", groupId: "group-b" },
      { id: "block-c", textHint: "keep C", groupId: "" }
    ],
    elementGroups: [{ id: "group-b", boxed: true }]
  };
  const incoming = {
    strokes: [{ elementId: "stroke-current", width: 3 }],
    markdownBlocks: [{ id: "block-a", textHint: "new A", groupId: "" }],
    elementGroups: []
  };

  const merged = mergeControllerDrawingSnapshot(latest, incoming);

  assert.deepEqual(merged.markdownBlocks.map((block) => block.id), ["block-a", "block-b", "block-c"]);
  assert.equal(merged.markdownBlocks[0].textHint, "new A");
  assert.deepEqual(merged.elementGroups, [{ id: "group-b", boxed: true }]);
  assert.deepEqual(merged.strokes, [
    { elementId: "stroke-current", width: 3 },
    { elementId: "stroke-keep", width: 2 }
  ]);
});

test("NoteFlow layout persistence requires an explicit user operation", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const prepare = source.slice(source.indexOf("  prepareNoteFlowForEditing()"), source.indexOf("  syncCurrentBrushFields()"));
  const annotation = source.slice(source.indexOf("  scheduleMarkdownAnnotationRefresh(options"), source.indexOf("  updateFloatingControlsPosition()"));
  const layout = source.slice(source.indexOf("  applyNoteFlowLayout()"), source.indexOf("  markNoteFlowLayoutMutation()"));
  const schedule = source.slice(source.indexOf("  scheduleNoteFlowLayout(options"), source.indexOf("  getSelectedStrokeIndexes()"));

  assert.match(prepare, /this\.noteFlowPersistencePending = false;[\s\S]*this\.noteFlowOperationPending = true;/);
  assert.doesNotMatch(annotation, /scheduleNoteFlowLayout\(\{ operation: true \}\)/);
  assert.match(layout, /frozenLayoutChanged && this\.noteFlowPersistencePending/);
  assert.match(layout, /this\.noteFlowPersistencePending && \(migratedAnchor \|\| updatedNoteFlowMetadata \|\| frozenLayoutChanged\)/);
  assert.match(layout, /userOperation: this\.noteFlowPersistencePending/);
  assert.match(schedule, /if \(options\.operation === true && this\.active\)[\s\S]*this\.noteFlowPersistencePending = true;/);
  assert.match(schedule, /this\.noteFlowOperationPending = false;\s*this\.noteFlowPersistencePending = false;/);
  assert.match(schedule, /cancelNoteFlowLayout\(\) \{\s*this\.noteFlowOperationPending = false;\s*this\.noteFlowPersistencePending = false;/);
  assert.match(schedule, /this\.noteFlowFrameId = window\.requestAnimationFrame\(run\);\s*this\.noteFlowFallbackTimer = window\.setTimeout\(run, 120\)/);
  assert.match(schedule, /window\.clearTimeout\(this\.noteFlowFallbackTimer\)/);
});

test("drawing saves require an explicit user operation and destructive replacement is explicit", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const save = source.slice(source.indexOf("  scheduleDrawingSave(file, data, options = {})"), source.indexOf("  async flushDrawingSave(path)"));
  const deletion = source.slice(source.indexOf("  deleteSelectedStroke()"), source.indexOf("\n};\nexport default NoteDrawPlugin"));

  assert.match(save, /options\.replace !== true && options\.userOperation !== true/);
  assert.match(save, /this\.suppressedDrawingSaves\.push/);
  assert.match(deletion, /userOperation: true, replace: true/);
});
