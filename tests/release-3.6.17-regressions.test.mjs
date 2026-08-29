import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { dedupeMarkdownBlockRecords } from "../src/markdown-block-records.mjs";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("view changes synchronize source geometry immediately without projecting hidden reading DOM", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const onload = source.slice(source.indexOf("  async onload()"), source.indexOf("  onunload()"));
  const initialLoad = source.slice(source.indexOf("  async ensureDrawingsLoaded()"), source.indexOf("  async ensurePortableDrawingLoaded()"));

  assert.match(onload, /layout-change[\s\S]*this\.syncMarkdownModeSurfaces\(\)[\s\S]*requestAnimationFrame\(\(\) => this\.syncMarkdownModeSurfaces\(\)\)[\s\S]*scheduleSurfaceSync\(120\)/);
  assert.match(source, /syncMarkdownModeSurfaces\(\)[\s\S]*syncSourceControllers\(\)[\s\S]*syncMarkdownControllerModes\(\)[\s\S]*reconcileControllerActivation/);
  assert.match(initialLoad, /resizeCanvas\(\{ layout: false, measure: true \}\)[\s\S]*surfaceType === "source"[\s\S]*resizeCanvas\(\{ layout: true, measure: false \}\)/);
});

test("text watercolor follows its hard Markdown owner before line-number fallback", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const restore = source.slice(source.indexOf("  restoreTextHighlightAnchors()"), source.indexOf("  snapWatercolorStrokeToTextLine("));

  assert.match(source, /mode: "hard"/);
  assert.match(source, /ownerId: owner\.id/);
  assert.match(source, /dataset\.noteDrawMarkdownBlockId/);
  assert.ok(restore.indexOf("anchor.ownerId && rect.blockId === anchor.ownerId") < restore.indexOf("rect.lineStart === anchor.lineStart"));
});

test("selection and locked-group outlines are dashed, aligned, and contextual", async () => {
  const [source, styles] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  const selection = source.slice(source.indexOf("  drawSelection()"), source.indexOf("  drawSelectionDragRect("));

  assert.match(selection, /setLineDash\(\[3, 2\]\)/);
  assert.match(selection, /ctx\.setLineDash\(\[\]\)/);
  assert.match(styles, /\.notedraw-embed\.is-boxed[\s\S]*border: 1\.25px solid/);
  assert.match(source, /selectedOutlineFrameLeft\(\)[\s\S]*elementGroupFrameRect[\s\S]*getStrokeBounds/);
  assert.match(source, /item\.boxed \|\| item\.locked && this\.groupFrameShouldBeVisible\(item\.id\)/);
  assert.match(source, /findLockedElementGroupFrameAtPoint[\s\S]*groupFrameShouldBeVisible\(group\.id\)/);
});

test("commands bind to strokes or Markdown blocks and survive semantic block dedupe", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /selectedCommandTarget\(\)[\s\S]*type: "stroke"[\s\S]*type: "markdown"/);
  assert.match(source, /setSelectedElementCommand\(target, command\)[\s\S]*item\.commandId = String\(command\.id\)/);
  assert.match(source, /executeElementCommand\(element\)[\s\S]*executeCommandById/);

  const records = dedupeMarkdownBlockRecords([
    { id: "old", path: "note.md", lineStart: 3, lineEnd: 3, span: 6, commandId: "app:test", commandName: "Test" },
    { id: "new", path: "note.md", lineStart: 3, lineEnd: 3, span: 12 }
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].commandId, "app:test");
  assert.equal(records[0].commandName, "Test");
});

test("laser pointer strokes fade locally and never enter persistent drawing history", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerUp = source.slice(source.indexOf("  onPointerUp(event)"), source.indexOf("  finishPointerInteraction(event)"));
  const laserBranch = pointerUp.slice(pointerUp.indexOf("this.isLaserPenActive()"), pointerUp.indexOf("    } else {", pointerUp.indexOf("this.isLaserPenActive()")));
  const destroyStart = source.indexOf("  destroy(options = {})");
  const destroy = source.slice(destroyStart, source.indexOf("  async toggle()", destroyStart));

  assert.match(source, /PEN_VARIANT_LASER = "laser"/);
  assert.match(source, /laserPen: "激光笔"/);
  assert.match(laserBranch, /laserExpiresAt: now \+ 3000/);
  assert.match(laserBranch, /this\.laserStrokes\.push/);
  assert.doesNotMatch(laserBranch, /drawingData\.strokes\.push|recordDrawingHistory|scheduleDrawingSave/);
  assert.doesNotMatch(destroy, /laserStrokes\.push/);
  assert.match(source, /remaining >= 700 \? 1 : remaining \/ 700/);
});
