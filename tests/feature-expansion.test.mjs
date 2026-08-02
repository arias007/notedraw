import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("embedded Markdown edits stage changes until editing ends", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /stageTextSave\(file, originalText, editedText, element, controller = null\)/);
  assert.match(source, /if \(this\.currentEditorEmbedded\) \{\s*this\.plugin\.stageTextSave\(this\.currentEditorFile, original, edited, element, this\)/);
  assert.match(source, /endTextEdit\(options = \{\}\)[\s\S]*scheduleTextSaveNow\(this\.currentEditorFile \|\| this\.file, original, edited, element, this\)/);
});

test("default brushes remain separate from opt-in fountain and watercolor variants", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /this\.brushVariants = \{\s*\[BRUSH_PEN\]: BRUSH_VARIANT_DEFAULT,\s*\[BRUSH_WATERCOLOR\]: BRUSH_VARIANT_DEFAULT/);
  assert.match(source, /variant: this\.currentBrushVariant\(\)/);
  assert.match(source, /normalizeBrushVariant\(BRUSH_PEN, stroke\.variant\) === PEN_VARIANT_FOUNTAIN/);
  assert.match(source, /straightenWatercolorPoints\(stroke\.points/);
  assert.match(source, /snapWatercolorStrokeToTextLine\(stroke\)/);
  assert.match(source, /event\.composedPath\(\)/);
  const brushPanelStart = source.indexOf("  createBrushPanel() {");
  const brushPanelSource = source.slice(brushPanelStart, source.indexOf("syncBrushPanelButtons()", brushPanelStart));
  assert.doesNotMatch(brushPanelSource, /button\.createSpan/);
  assert.match(styles, /\.notedraw-brush-option \{[\s\S]*width: 34px;[\s\S]*justify-content: center;[\s\S]*touch-action: manipulation/);
});

test("scrolling refreshes only the canvas window while real layout changes can reproject", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /onScroll\(\) \{\s*this\.lastScrollAt = Date\.now\(\);[\s\S]*this\.scheduleResize\(\{ layout: false \}\)/);
  assert.match(source, /scheduleMarkdownAnnotationRefresh\(\{ layout: Date\.now\(\) - this\.lastScrollAt > 220 \}\)/);
  assert.match(source, /resizeCanvas\(options = \{\}\)[\s\S]*const refreshLayout = options\.layout !== false/);
  assert.match(source, /if \(this\.drawingsLoaded && refreshLayout\) \{\s*const frame = this\.getResponsiveContentFrame\(\)/);
});

test("reading zoom preserves wrapping while edit zoom can reflow", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /readingViewZoom: true/);
  assert.match(source, /sourceViewLayoutZoom: true/);
  assert.match(source, /setZoom: \(zoom, options = \{\}\) => this\.setApiZoom\(zoom, options\)/);
  assert.match(source, /if \(\(event\.ctrlKey \|\| event\.metaKey\) && this\.canZoomReadingSurface\(\)\)/);
  assert.match(source, /this\.setReadingZoom\(this\.readingZoom \* distance \/ previousDistance, center, \{ share: false \}\)/);
  assert.match(source, /return \["preview", "source"\]\.includes\(this\.surfaceType\) && !this\.embeddedSurface/);
  assert.match(source, /usesVisualReadingZoom\(\)/);
  assert.match(source, /readingZoomElements\(target = this\.readingZoomTarget\)/);
  assert.match(source, /element\.style\.setProperty\("transform", `scale\(\$\{zoom\}\)/);
  assert.match(source, /element\.style\.setProperty\("transform-origin", `\$\{-origin\.x\}px \$\{-origin\.y\}px`\)/);
  assert.match(source, /element\.style\.setProperty\("zoom", String\(zoom\)\)/);
  assert.match(source, /updateReadingZoomExtent\(zoom, target\)/);
  assert.match(source, /if \(canvasWindow\.changed && visualScale !== 1 && this\.usesVisualReadingZoom\(\)\) \{[\s\S]*this\.applyVisualReadingZoomElement\(canvas, visualScale\)/);
  assert.match(source, /this\.scheduleResize\(\{ layout: !this\.usesVisualReadingZoom\(\) \}\)/);
  assert.match(source, /measureCanvasExtent\(this\.previewEl, this\.layoutMeasureEl, visualScale\)/);
  assert.match(source, /measureVisibleSurfaceWindow\(this\.previewEl, this\.scrollContainer, height, visualScale\)/);
  assert.match(source, /const xScale = rect\.width > 0 \? width \/ rect\.width : 1/);
  assert.match(source, /const yScale = rect\.height > 0 \? this\.canvasRenderHeight \/ rect\.height : 1/);
  assert.match(styles, /\.notedraw-shell\.is-reading-zoomed,[\s\S]*overflow-x: auto !important/);
  assert.match(styles, /\.notedraw-reading-zoom-extent\[data-active="true"\] \{[\s\S]*display: block/);
});

test("only the active note surface can expose a toolbar", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /enforceSingleVisibleToolbar\(controller\)/);
  assert.match(source, /this\.plugin\.enforceSingleVisibleToolbar\(this\)/);
  assert.match(source, /this\.toolbar\?\.toggleAttribute\("aria-hidden", !visible\)/);
  assert.match(source, /if \(!ownedToolbars\.has\(toolbar\)\) \{\s*toolbar\.remove\(\)/);
  assert.match(styles, /\.notedraw-shell\.is-drawing-active\.is-notedraw-controls-visible > \.notedraw-toolbar/);
  assert.doesNotMatch(styles, /\.notedraw-shell\.is-drawing-active\.is-notedraw-controls-visible \.notedraw-toolbar/);
});

test("palette changes update the selected NoteDraw elements", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /setCurrentBrushColor\(color\)[\s\S]*this\.applyColorToSelectedStrokes\(color\)/);
  assert.match(source, /applyColorToSelectedStrokes\(color\)[\s\S]*this\.drawingData\.strokes\[index\]\.color = color/);
  assert.match(source, /recordDrawingHistory\(historyBefore\)/);
  assert.match(source, /this\.toolMode === TOOL_SELECT && !this\.getSelectedStrokeIndexes\(\)\.length/);
  assert.match(source, /const paletteDisabled = this\.toolMode === TOOL_EDIT_MD \|\| this\.toolMode === TOOL_SELECT && !this\.getSelectedStrokeIndexes\(\)\.length/);
});

test("brush, palette, and text controls use touch-safe taps and anchor below their buttons", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /function bindNoteDrawControlTap\(element, action\)/);
  assert.match(source, /if \(moved > 12\) \{\s*return;/);
  assert.match(source, /bindNoteDrawControlTap\(this\.paletteButton/);
  assert.match(source, /bindNoteDrawControlTap\(this\.textButton/);
  assert.match(source, /onDocumentPointerDown\(event\) \{[\s\S]*if \(!this\.controlsShouldBeVisible\(\)\) \{\s*return;/);
  assert.match(source, /--notedraw-brush-panel-left/);
  assert.match(source, /this\.brushPanelMode === BRUSH_WATERCOLOR \? this\.watercolorButton : this\.penButton/);
  assert.match(styles, /\.notedraw-brush-panel \{[\s\S]*left: var\(--notedraw-brush-panel-left, auto\)/);
  assert.match(styles, /\.notedraw-palette-panel \{[\s\S]*left: var\(--notedraw-palette-left, auto\)/);
  assert.match(styles, /\.notedraw-text-panel \{[\s\S]*left: var\(--notedraw-text-panel-left, auto\)/);
});

test("file-backed workspace views remount drawings and header controls after internal rerenders", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /this\.workspaceControllers = \/\* @__PURE__ \*\/ new Map\(\)/);
  assert.match(source, /syncWorkspaceControllers\(\)/);
  assert.match(source, /surfaceType: "workspace",\s*workspaceSurface: true/);
  assert.match(source, /if \(!existing\.button\?\.isConnected\) \{\s*existing\.button = this\.installHeaderButton\(existing\)/);
  assert.match(source, /isWorkspaceSurfaceMutation\(mutation\)/);
  assert.match(styles, /\.notedraw-shell\.is-notedraw-workspace-shell \.notedraw-static-canvas/);
});
