import assert from "node:assert/strict";
import test from "node:test";

import {
  DRAWING_STORAGE_CONFIG,
  DRAWING_STORAGE_EMBEDDED,
  DRAWING_STORAGE_NOTE_FOLDER,
  DRAWING_STORAGE_NOTE_SUBFOLDER,
  appendNotedrawDataBlock,
  decodeNotedrawDataBlock,
  findNotedrawDataBlock,
  normalizeDrawingStorageMode,
  resolveDrawingStoragePath,
  stripNotedrawDataBlocks
} from "../src/portable-notedraw.mjs";

test("drawing storage paths preserve the config default and support note-local data", () => {
  const input = {
    filePath: "Projects/示例.md",
    configDir: ".obsidian",
    pluginId: "notedraw",
    encodedName: "Projects___.md.json"
  };

  assert.equal(resolveDrawingStoragePath(input), ".obsidian/plugins/notedraw/drawings/Projects___.md.json");
  assert.equal(resolveDrawingStoragePath({ ...input, mode: DRAWING_STORAGE_NOTE_SUBFOLDER }), "Projects/notedraw/示例.notedraw.json");
  assert.equal(resolveDrawingStoragePath({ ...input, mode: DRAWING_STORAGE_NOTE_FOLDER }), "Projects/示例.notedraw.json");
  assert.equal(resolveDrawingStoragePath({ ...input, mode: DRAWING_STORAGE_EMBEDDED }), "Projects/示例.md#NOTEDRAW_DATA_BEGIN");
  assert.equal(resolveDrawingStoragePath({ ...input, filePath: "Root.md", mode: DRAWING_STORAGE_NOTE_SUBFOLDER }), "notedraw/Root.notedraw.json");
  assert.equal(resolveDrawingStoragePath({ ...input, filePath: "Root.md", mode: DRAWING_STORAGE_NOTE_FOLDER }), "Root.notedraw.json");
  assert.equal(normalizeDrawingStorageMode("unknown"), DRAWING_STORAGE_CONFIG);
});

test("portable NoteDraw blocks round-trip Unicode drawings and binary resources", async () => {
  const bundle = {
    format: "notedraw-portable",
    version: 1,
    purpose: "share",
    sourcePath: "项目/示例.md",
    drawing: { version: 3, strokes: [{ text: "标题 ✅", points: [{ x: 0.2, y: 0.4 }] }] },
    resources: [{ id: "r1", name: "图.png", mime: "image/png", dataBase64: "AAECAwQ=" }]
  };
  const markdown = await appendNotedrawDataBlock("# 可阅读正文\n\n普通阅读器只显示这里。", bundle);

  assert.match(markdown, /<!-- NOTEDRAW_DATA_BEGIN (?:gzip-)?base64/);
  assert.ok(findNotedrawDataBlock(markdown));
  assert.deepEqual(await decodeNotedrawDataBlock(markdown), bundle);
  assert.equal(stripNotedrawDataBlocks(markdown), "# 可阅读正文\n\n普通阅读器只显示这里。");
});

test("writing a portable block replaces an older hidden block instead of stacking data", async () => {
  const first = await appendNotedrawDataBlock("Body", { version: 1, drawing: { strokes: [1] } }, { compress: false });
  const second = await appendNotedrawDataBlock(first, { version: 1, drawing: { strokes: [2] } }, { compress: false });

  assert.equal(second.match(/NOTEDRAW_DATA_BEGIN/g)?.length, 1);
  assert.deepEqual(await decodeNotedrawDataBlock(second), { version: 1, drawing: { strokes: [2] } });
  assert.equal(stripNotedrawDataBlocks(second), "Body");
});
