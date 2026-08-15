import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  coalesceDrawingSaveRequest,
  materializeDrawingSaveRequest,
  mergeControllerDrawingSnapshot
} from "../src/drawing-persistence.mjs";

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
  assert.match(layout, /this\.noteFlowPersistencePending && \(aligned \|\| migratedAnchor \|\| updatedNoteFlowMetadata \|\| frozenLayoutChanged\)/);
  assert.match(layout, /userOperation: this\.noteFlowPersistencePending/);
  assert.match(schedule, /if \(options\.operation === true && this\.active\)[\s\S]*this\.noteFlowPersistencePending = true;/);
  assert.match(schedule, /if \(options\.defer === true\) \{\s*return;\s*\}/);
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

test("repeated saves from one controller coalesce before normalization", () => {
  const file = { path: "note.md" };
  const data = { strokes: [{ elementId: "stroke-a", width: 1 }], markdownBlocks: [], elementGroups: [] };
  const first = coalesceDrawingSaveRequest(null, { file, data });
  data.strokes[0].width = 4;
  const second = coalesceDrawingSaveRequest(first, { file, data });
  let normalizeCount = 0;

  const materialized = materializeDrawingSaveRequest(null, second, (value) => {
    normalizeCount += 1;
    return structuredClone(value);
  });

  assert.equal(second.generation, 2);
  assert.equal(second.entries.length, 1);
  assert.equal(normalizeCount, 1);
  assert.equal(materialized.strokes[0].width, 4);
});

test("coalesced saves retain distinct controller changes and a replacement resets older entries", () => {
  const file = { path: "note.md" };
  const firstData = { strokes: [{ elementId: "stroke-a", width: 2 }], markdownBlocks: [], elementGroups: [] };
  const secondData = { strokes: [{ elementId: "stroke-b", width: 3 }], markdownBlocks: [], elementGroups: [] };
  let request = coalesceDrawingSaveRequest(null, { file, data: firstData });
  request = coalesceDrawingSaveRequest(request, { file, data: secondData });

  const merged = materializeDrawingSaveRequest(null, request, structuredClone);
  assert.deepEqual(merged.strokes.map((stroke) => stroke.elementId), ["stroke-a", "stroke-b"]);

  request = coalesceDrawingSaveRequest(request, { file, data: secondData, replace: true });
  assert.equal(request.entries.length, 1);
  assert.equal(request.entries[0].replace, true);
  assert.deepEqual(materializeDrawingSaveRequest(merged, request, structuredClone).strokes, secondData.strokes);
});

test("pointer release queues lightweight saves and defers canonical work to idle flush", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const schedule = source.slice(source.indexOf("  scheduleDrawingSave(file, data, options = {})"), source.indexOf("  cancelScheduledDrawingSave(path)"));
  const flush = source.slice(source.indexOf("  async flushDrawingSave(path)"), source.indexOf("  async writeDrawings(file, data, options = {})"));
  const drag = source.slice(source.indexOf("  finishSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag("));

  assert.match(schedule, /coalesceDrawingSaveRequest/);
  assert.match(schedule, /requestIdleCallback\(run, \{ timeout: 800 \}\)/);
  assert.doesNotMatch(schedule, /normalizeDrawingDataForStorage|refreshControllersForFile|mergeControllerDrawingSnapshot/);
  assert.match(flush, /materializeDrawingSaveRequest/);
  assert.match(flush, /this\.drawingStateCache\.set\(path, canonical\)/);
  assert.match(flush, /refreshControllersForFile\(request\.file, canonical/);
  assert.match(flush, /normalized: true, refresh: false, updateCache: false/);
  assert.match(drag, /recordDrawingHistory\(drawingHistoryBefore, \{ knownChanged: true \}\)/);
});
