import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const previewLifecycleUrl = new URL("../src/preview-lifecycle.mjs", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("canvas layers stay hidden until their backing stores are initialized", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(styles, /\.notedraw-static-canvas,\s*\.notedraw-canvas\s*\{[^}]*display:\s*none;/s);
  assert.match(styles, /\.notedraw-shell\.has-notedraw-canvas \.notedraw-underlay-canvas,[\s\S]*\.notedraw-shell\.has-notedraw-canvas \.notedraw-static-canvas,[\s\S]*\.notedraw-shell\.has-notedraw-canvas \.notedraw-canvas\s*\{[^}]*display:\s*block;/s);
  assert.match(source, /this\.previewEl\.addClass\("has-notedraw-canvas"\)/);
  assert.match(source, /resetCanvasSurface\(\)\s*\{[^}]*removeClass\("has-notedraw-canvas"\)/s);
  assert.match(source, /resetCanvasSurface\(\)[\s\S]*this\.ctx = null;\s*this\.underlayCtx = null;\s*this\.staticCtx = null;/);
  assert.match(source, /this\.staticCanvas\.width = 1;\s*this\.staticCanvas\.height = 1;/s);
  assert.match(source, /this\.canvas\.width = 1;\s*this\.canvas\.height = 1;/s);
});

test("destroyed controllers release canvas backing stores and decoded images", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const destroySource = source.slice(source.indexOf("  destroy(options = {})"), source.indexOf("  async toggle()", source.indexOf("  destroy(options = {})")));

  assert.match(destroySource, /this\.releaseCanvasImageCache\(\);\s*this\.resetCanvasSurface\(\);\s*this\.underlayCanvas\?\.remove\(\)/);
  assert.match(destroySource, /this\.underlayCanvas = null;\s*this\.staticCanvas = null;\s*this\.canvas = null;/);
  assert.match(source, /releaseCanvasImageCache\(\)[\s\S]*image\.onload = null;\s*image\.onerror = null;[\s\S]*image\.removeAttribute\?\.\("src"\)/);
  assert.match(destroySource, /this\.drawingData = null;/);
});

test("late drawing loads cannot revive a destroyed or reassigned controller", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const loadSource = source.slice(source.indexOf("  async ensureDrawingsLoaded()"), source.indexOf("  onResize()", source.indexOf("  async ensureDrawingsLoaded()")));

  assert.match(loadSource, /const generation = \+\+this\.drawingLoadGeneration;/);
  assert.match(loadSource, /this\.destroyed \|\| generation !== this\.drawingLoadGeneration \|\| this\.file\?\.path !== file\?\.path/);
  assert.match(loadSource, /if \(this\.loadingDrawings === loading\) \{\s*this\.loadingDrawings = null;/);
});

test("first reading surface settles after drawings load instead of relying on toolbar toggles", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const loadSource = source.slice(source.indexOf("  async ensureDrawingsLoaded()"), source.indexOf("  onResize()", source.indexOf("  async ensureDrawingsLoaded()")));
  const settleStart = source.indexOf("  async settleInitialReadingSurface(");
  const settleSource = source.slice(settleStart, source.indexOf("  applySettings()", settleStart));
  const initialStart = source.indexOf("  async prepareInitialReadingLayout()");
  const initialSource = source.slice(initialStart, source.indexOf("  applySettings()", initialStart));

  assert.match(initialSource, /!this\.drawingsLoaded/);
  assert.match(initialSource, /const generation = this\.drawingLoadGeneration/);
  assert.match(initialSource, /generation !== this\.drawingLoadGeneration/);
  assert.match(settleSource, /await this\.prepareInitialReadingLayout\(\)/);
  assert.match(settleSource, /this\.resizeCanvas\(\{ layout: true, measure: true \}\)/);
  assert.match(settleSource, /this\.responsivePointsInitialized = false/);
  assert.match(settleSource, /waitForStableReadingLayout/);
  assert.match(settleSource, /this\.initialReadingCommittedSignature = this\.readingSurfaceGeometrySignature\(\)/);
  assert.match(source, /reconcileSettledReadingSurface\(\)[\s\S]*readingSurfaceGeometrySignature\(\)[\s\S]*settleInitialReadingSurface\(generation\)/);
  assert.match(source, /onResize\(\)[\s\S]*this\.reconcileSettledReadingSurface\(\)/);
  assert.match(source, /scheduleMarkdownMutationSync\(\)[\s\S]*this\.reconcileSettledReadingSurface\(\)/);
  assert.match(loadSource, /if \(!this\.active && this\.surfaceType === "preview"\) \{[\s\S]*await this\.settleInitialReadingSurface\(generation\)/);
  assert.match(loadSource, /this\.initialReadingLayoutSettled = false/);
  assert.doesNotMatch(settleSource, /setTimeout\(.*settle/i);
});

test("background tabs cannot leave the initial canvas resize pending forever", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const scheduleSource = source.slice(source.indexOf("  scheduleResize(options = {})"), source.indexOf("  scheduleFloatingControlsPosition()"));

  assert.match(scheduleSource, /this\.resizeFrameId = window\.requestAnimationFrame\(\(\) => this\.flushScheduledResize\(\)\)/);
  assert.match(scheduleSource, /this\.resizeFallbackTimer = window\.setTimeout\(\(\) => this\.flushScheduledResize\(\), 120\)/);
  assert.match(scheduleSource, /flushScheduledResize\(\)[\s\S]*this\.resizeFrameId = null[\s\S]*this\.resizeFallbackTimer = null/);
  assert.match(scheduleSource, /cancelResizeFrame\(\)[\s\S]*window\.cancelAnimationFrame\(this\.resizeFrameId\)[\s\S]*window\.clearTimeout\(this\.resizeFallbackTimer\)/);
});

test("hidden reading controllers are released in source mode while alternate surfaces are cleaned up", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /if \(isSourceMode\(view\) && sourceVisible\) \{[\s\S]*controller\.destroy\(\);/s);
  assert.match(source, /sourceController\?\.syncFloatingControlClasses\(\);\s*if \(!previewVisible\) \{\s*if \(alternateSurfaceVisible\)[\s\S]*controller\.destroy\(\);[\s\S]*continue;/s);
  assert.match(source, /if \(!isMarkdownPreviewVisible\(view, preview\)\) \{[\s\S]*alternateSurfaceVisible && !sourceVisible[\s\S]*existingController\.destroy\(\);[\s\S]*this\.scheduleWebviewSync\(\);[\s\S]*return;/s);
  assert.match(source, /if \(isSourceMode\(view\) && sourceVisible\) \{[\s\S]*controller\.previewEl\?\.isConnected[\s\S]*controller\.destroy\(\);[\s\S]*controller\?\.destroy\?\.\(\);/s);
  assert.match(source, /previewController\?\.plugin === this && view\.file && previewController\.file\?\.path !== view\.file\.path[\s\S]*previewController\.destroy\(\);\s*previewController = null/);
  assert.match(source, /previewController\.file\?\.path !== view\.file\?\.path/s);
  assert.match(source, /previewController = this\.resolveLivePreviewController\(view\)/);
});

test("root reading controllers wait for Markdown and clear only dormant preview geometry", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const initialLayout = source.slice(source.indexOf("  async prepareInitialReadingLayout()"), source.indexOf("  applySettings()"));

  assert.match(source, /if \(!isRootPreviewReady\(view, preview\)\) \{\s*existingController\?\.destroy\?\.\(\);\s*resetDormantRootPreview\(view, preview\);\s*return;/s);
  assert.match(source, /if \(!preview \|\| !view\?\.file\) \{/);
  assert.match(source, /if \(!isRootPreviewReady\(view, preview\)\) \{\s*resetDormantRootPreview\(view, preview\);\s*return null;/s);
  assert.match(source, /for \(const property of \["min-height", "padding-bottom"\]\)/);
  assert.match(source, /shouldResetDormantRootPreview\(rootPreviewLifecycleState\(view, preview\)\)/);
  assert.doesNotMatch(source, /resetDormantRootPreview[\s\S]{0,900}preview\.scrollTop = 0/);
  assert.match(source, /await this\.prepareInitialReadingLayout\(\);\s*if \(this\.destroyed \|\| !this\.previewEl\?\.isConnected\) \{\s*return;/);
  assert.match(source, /waitForStableReadingLayout[\s\S]*this\.responsiveLayoutSignature = "";/);
  assert.doesNotMatch(initialLayout, /await annotateRenderedMarkdownLines/);
});

test("reading virtualizer containers never become NoteFlow grid roots", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const gridSource = source.slice(source.indexOf("  markdownBlockGridContainer("), source.indexOf("  applyMarkdownBlockFlowPresentation("));
  const dragClassSource = source.slice(source.indexOf("  setDraggedNoteFlowDomClass("), source.indexOf("  restoreDraggedNoteFlowDomPreview("));

  assert.match(gridSource, /return isNoteFlowCollectionBlock\(container\) \? null : container/);
  assert.match(dragClassSource, /className === "notedraw-md-grid" && isNoteFlowCollectionBlock\(element\)/);
  assert.match(dragClassSource, /className === "notedraw-md-grid-item" && isNoteFlowCollectionBlock\(element\.parentElement\)/);
});

test("virtual Markdown recycling cannot discard a live reading controller", async () => {
  const [source, previewLifecycle] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(previewLifecycleUrl, "utf8")
  ]);

  assert.match(source, /if \(previewController\?\.plugin === this && !previewController\.destroyed && previewController\.file\?\.path === view\.file\?\.path\) \{\s*previewController\.syncFloatingControlClasses\(\);\s*continue;/s);
  assert.match(source, /const rendererPreview = view\?\.previewMode\?\.renderer\?\.previewEl;/);
  assert.match(source, /return pickRootPreview\(previews, rendererPreview, isElementVisibleEnough, isElementLaidOut\)/);
  assert.match(previewLifecycle, /candidates\.find\(\(preview\) => isVisible\(preview\)\)[\s\S]*candidates\.find\(\(preview\) => preview === rendererPreview\)/);
});
