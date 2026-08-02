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
  assert.match(styles, /\.notedraw-brush-option[\s\S]*touch-action: manipulation/);
});

test("scrolling refreshes only the canvas window while real layout changes can reproject", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /onScroll\(\) \{\s*this\.lastScrollAt = Date\.now\(\);[\s\S]*this\.scheduleResize\(\{ layout: false \}\)/);
  assert.match(source, /scheduleMarkdownAnnotationRefresh\(\{ layout: Date\.now\(\) - this\.lastScrollAt > 220 \}\)/);
  assert.match(source, /resizeCanvas\(options = \{\}\)[\s\S]*const refreshLayout = options\.layout !== false/);
  assert.match(source, /if \(this\.drawingsLoaded && refreshLayout\) \{\s*const frame = this\.getResponsiveContentFrame\(\)/);
});

test("reading zoom supports touch gestures, wheel input, aligned coordinates, and API access", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /readingViewZoom: true/);
  assert.match(source, /setZoom: \(zoom, options = \{\}\) => this\.setApiZoom\(zoom, options\)/);
  assert.match(source, /if \(\(event\.ctrlKey \|\| event\.metaKey\) && this\.canZoomReadingSurface\(\)\)/);
  assert.match(source, /this\.setReadingZoom\(this\.readingZoom \* distance \/ previousDistance, center, \{ share: false \}\)/);
  assert.match(source, /const xScale = rect\.width > 0 \? width \/ rect\.width : 1/);
  assert.match(source, /const yScale = rect\.height > 0 \? this\.canvasRenderHeight \/ rect\.height : 1/);
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
