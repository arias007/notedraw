import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("magic wand state follows the stable leaf across Markdown surfaces", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /this\.viewDrawingActive\s*=\s*\/\* @__PURE__ \*\/ new WeakMap\(\)/);
  assert.match(source, /this\.viewToolbarState\s*=\s*\/\* @__PURE__ \*\/ new WeakMap\(\)/);
  assert.match(source, /controllerStateKey\(controller\)\s*\{\s*const view = controller\?\.view;\s*return view\?\.leaf \|\| findOwningLeaf\(this\.app, view\?\.containerEl \|\| controller\?\.previewEl\) \|\| view \|\| controller\?\.previewEl/s);
  assert.match(source, /this\.plugin\.setControllerActivation\(this, nextActive\)/);
  assert.match(source, /candidate\.applySharedToolbarState\(next\)/);
  assert.doesNotMatch(source, /Failed to close source NoteDraw controller/);
});

test("only the active visible surface exposes body-portal controls", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /controlsShouldBeVisible\(\)/);
  assert.match(source, /if \(this\.embeddedSurface \|\| !this\.active/);
  assert.match(source, /activeLeaf && ownerLeaf && activeLeaf !== ownerLeaf/);
  assert.match(source, /element\?\.toggleClass\("is-notedraw-controls-visible", visible\)/);
  assert.match(styles, /\.notedraw-body-control:not\(\.is-notedraw-controls-visible\)\s*\{\s*display:\s*none !important;/s);
  assert.match(styles, /\.notedraw-body-control\.notedraw-toolbar\.is-drawing-active\.is-notedraw-controls-visible/);
});

test("toolbar mode, brush, panels, and text preset are shared", async () => {
  const source = await readFile(sourceUrl, "utf8");

  for (const field of ["brushMode", "toolMode", "paletteOpen", "textPanelOpen", "textPreset"]) {
    assert.match(source, new RegExp(`${field}: this\\.${field}`));
  }
  assert.match(source, /brushSettings:\s*\{\s*\[BRUSH_PEN\]: \{ \.\.\.this\.brushSettings\[BRUSH_PEN\] \}/s);
  assert.match(source, /applySharedToolbarState\(state\)/);
  assert.match(source, /this\.toolMode = state\.toolMode \|\| this\.toolMode/);
  assert.doesNotMatch(source, /drawingsVisible: this\.drawingsVisible/);
  assert.doesNotMatch(source, /this\.drawingsVisible = state\.drawingsVisible !== false/);
  assert.doesNotMatch(source, /this\.surfaceType === "source"\) \{\s*return false;/);
});

test("opening the magic wand reveals drawings while long press and right click toggle visibility", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const nextActive = !this\.active;\s*this\.plugin\.setControllerActivation\(this, nextActive\);\s*if \(!nextActive\) \{\s*return;\s*\}\s*if \(nextActive\) \{\s*await this\.ensureDrawingsLoaded\(\);\s*if \(this\.destroyed \|\| !this\.active\) \{\s*return;\s*\}\s*if \(!this\.drawingsVisible\) \{\s*this\.setDrawingsVisible\(true\)/);
  assert.match(source, /this\.buttonLongPressed = true;\s*this\.toggleDrawingsVisiblePersisted\(\)/);
  assert.match(source, /onButtonContextMenu\(event\)[\s\S]*this\.toggleDrawingsVisiblePersisted\(\)/);
  assert.match(source, /async toggleDrawingsVisiblePersisted\(\) \{\s*await this\.ensureDrawingsLoaded\(\);\s*this\.toggleDrawingsVisible\(\)/);
  assert.match(source, /toggleDrawingsVisible\(\) \{\s*this\.setDrawingsVisible\(!this\.drawingsVisible, \{ persist: true \}\)/);
  assert.match(source, /setDrawingsVisible\(visible, options = \{\}\) \{\s*this\.applyDrawingsVisibility\(visible\);\s*this\.drawingData\.visible = this\.drawingsVisible;\s*if \(options\.persist === true\) \{\s*this\.plugin\.scheduleDrawingSave\(this\.file, this\.drawingData, \{ userOperation: true \}\)/);
  assert.match(source, /visible: data\?\.visible !== false/);
  assert.match(source, /this\.applyDrawingsVisibility\(data\.visible !== false\)/);
  assert.match(source, /controller\.applyDrawingsVisibility\(controller\.drawingData\.visible !== false\)/);
});

test("rebinding the same file rehydrates a controller that mounted before drawing data finished loading", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const setFileStart = source.indexOf("  async setFile(file) {");
  const setFileSource = source.slice(setFileStart, source.indexOf("  resetCanvasSurface()", setFileStart));

  assert.match(setFileSource, /if \(this\.file\?\.path === file\.path\) \{/);
  assert.match(setFileSource, /if \(!this\.drawingsLoaded\) \{\s*await this\.ensureDrawingsLoaded\(\)/);
  assert.match(setFileSource, /this\.requestRender\(true\)/);
});

test("reading settlement is invalidated when the NoteDraw surface changes state", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /this\.surfaceStateGeneration\s*\+=\s*1/);
  assert.match(source, /queueReadingSurfaceSettlement\(\)/);
  assert.match(source, /surfaceGeneration !== this\.surfaceStateGeneration/);
  assert.match(source, /shouldAbort: \(\) => this\.destroyed[\s\S]*this\.active[\s\S]*surfaceGeneration !== this\.surfaceStateGeneration/);
});

test("element migration waits for a stable note lane instead of transition geometry", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /needsElementLayoutMigration\(this\.drawingData\?\.strokes\) && !isStableResponsiveCaptureFrame/);
  assert.match(source, /const stableWideLane = width >= 900 && contentWidth >= 720/);
  assert.match(source, /contentWidth \/ width >= 0\.42 \|\| stableWideLane/);
});

test("laid-out embedded Markdown loads its own editable drawings without scanning unrelated DOM changes", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /this\.embeddedControllers\s*=\s*\/\* @__PURE__ \*\/ new Map\(\)/);
  assert.match(source, /syncEmbeddedMarkdownControllers\(\)/);
  assert.match(source, /isEmbeddedSurfaceSyncMutation\(mutation\)[\s\S]*this\.scheduleEmbeddedMarkdownSync\(\)/);
  assert.match(source, /isElementLaidOut\(surface\)/);
  assert.match(source, /scheduleEmbeddedMarkdownSync\(\)[\s\S]*this\.syncEmbeddedMarkdownControllers\(\)/);
  assert.match(source, /querySelectorAll\("\.markdown-embed-content"\)/);
  assert.match(source, /surfaceType: "embedded",\s*embeddedSurface: true/);
  assert.match(source, /await this\.settleInitialReadingSurface\(generation\);\s*}\s*if \(this\.destroyed \|\| generation !== this\.drawingLoadGeneration \|\| this\.file\?\.path !== file\?\.path\) \{\s*return;\s*}/);
  assert.match(source, /await this\.prepareFrozenNoteFlowLayout\(\)\.catch\(\(error\) => \{\s*void error;\s*return false;\s*}\);\s*if \(this\.destroyed \|\| generation !== this\.drawingLoadGeneration \|\| this\.file\?\.path !== file\?\.path\) \{\s*return;\s*}\s*this\.syncMarkdownBlockPresentation\(\);\s*this\.resizeCanvas\(\{ layout: false, measure: true \}\);[\s\S]{0,500}this\.render\(\)/);
  assert.doesNotMatch(source, /await this\.ensureDrawingsLoaded\(\);\s*this\.resizeCanvas\(\);\s*this\.render\(\)/);
  assert.match(source, /if \(!isElementNearViewport\(surface\)\) \{\s*continue;\s*}\s*activeSurfaces\.add\(surface\)/);
  assert.match(source, /this\.plugin\.scheduleEmbeddedMarkdownSync\(\)/);
  assert.match(source, /this\.plugin\.setInteractionController\(this\)/);
  assert.match(source, /findEmbeddedStrokeControllerAtPoint\(controller, event\)/);
  assert.match(source, /embeddedController\.onPointerDown\(event, true\)/);
  assert.match(source, /this\.routedPointerController\.onPointerMove\(event\)/);
  assert.match(source, /routedController\.onPointerUp\(event\)/);
  assert.match(styles, /is-notedraw-embedded-shell\.is-drawing-active \.notedraw-canvas \{[\s\S]*pointer-events: none/);
  assert.match(styles, /\.notedraw-shell\.is-notedraw-embedded-shell\.is-drawing-active \.notedraw-canvas/);
});
