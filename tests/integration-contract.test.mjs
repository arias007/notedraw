import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const canvasSizingUrl = new URL("../src/canvas-sizing.mjs", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("embedded Markdown edits resolve and save against the referenced file", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /resolveRenderedSourcePath\(this\.app, el, ctx\.sourcePath\)/);
  assert.match(source, /element\.dataset\.noteDrawSourcePath = normalizeVaultPath\(sourcePath\)/);
  assert.match(source, /const editsEmbeddedFile = Boolean\(editableFile\?\.path && editableFile\.path !== this\.file\?\.path\)/);
  assert.match(source, /prepareTextEditState\(this\.currentEditorFile, element\.innerText, element, this\)/);
  assert.match(source, /queueTextSaveAndWait\(this\.currentEditorFile \|\| this\.file, original, edited, element\)/);
  assert.match(source, /this\.currentEditorEmbedded = this\.embeddedSurface \|\| isEmbeddedEditableElement\(element\) \|\| normalizeVaultPath\(this\.currentEditorFile\?\.path\) !== normalizeVaultPath\(this\.file\?\.path\)/);
  assert.match(source, /serializeControllerEditableSource\(element, this\.currentEditorEmbedded\)/);
  assert.match(source, /function stripOneTerminalBreakPerLine\(value\)[\s\S]*replace\(\/<br\\s\*\\\/\?>\[ \\t\]\*\(\?=\\n\|\$\)\/gim, ""\)/);
});

test("the stable v1 API exposes Cancip-friendly capabilities and events", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /apiVersion: "1\.0"/);
  assert.match(source, /embeddedMarkdownEditing: true/);
  assert.match(source, /responsiveCoordinates: RESPONSIVE_POINT_BASIS/);
  assert.match(source, /responsiveElements: ELEMENT_LAYOUT_BASIS/);
  assert.match(source, /replaceText: async \(options\) => this\.replaceTextApi\(options\)/);
  assert.match(source, /on: \(eventName, listener\) => this\.onApiEvent\(eventName, listener\)/);
  assert.match(source, /listSurfaces: v1\.listSurfaces/);
  assert.match(source, /setTool: v1\.setTool/);
  assert.match(source, /getZoom: v1\.getZoom/);
  assert.match(source, /setZoom: v1\.setZoom/);
  assert.match(source, /persistentHeaderActions: true/);
  assert.match(source, /stateBackedWorkspaceSurfaces: true/);
  assert.match(source, /registeredSurfaces: true/);
  assert.match(source, /surfaceHandles: true/);
  assert.match(source, /agentActions: true/);
  assert.match(source, /registerSurface: \(options = \{\}\) => this\.registerApiSurface\(options\)/);
  assert.match(source, /registerSurface: v1\.registerSurface/);
  assert.match(source, /getState: v1\.getState/);
  assert.match(source, /setVisibility: v1\.setVisibility/);
  assert.match(source, /setBrush: v1\.setBrush/);
  assert.match(source, /getElements: v1\.getElements/);
  assert.match(source, /updateElements: v1\.updateElements/);
  assert.match(source, /setElementsNoteFlow: v1\.setElementsNoteFlow/);
  assert.match(source, /execute: v1\.execute/);
  assert.match(source, /phase: "mounted"/);
  assert.match(source, /phase: "unmounted"/);
});

test("registered surfaces expose stable handles and structured actions without controllers", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /registerApiSurface\(options = \{\}\)/);
  assert.match(source, /createRegisteredSurfaceHandle\(record, controller, ready\)/);
  assert.match(source, /ready: Promise\.resolve\(ready\)\.then\(\(\) => void 0\)/);
  assert.match(source, /activate: async \(toolOrOptions = \{\}\)/);
  assert.match(source, /deactivate: \(\) => plugin\.deactivateApi/);
  assert.match(source, /toggle: async \(options = \{\}\)/);
  assert.match(source, /setTool: \(tool, options = \{\}\)/);
  assert.match(source, /execute: async \(actions, options = \{\}\)/);
  assert.match(source, /getElements: async \(options = \{\}\)/);
  assert.match(source, /destroy: \(\) => plugin\.destroyRegisteredSurface/);
  assert.doesNotMatch(source.slice(source.indexOf("  createRegisteredSurfaceHandle("), source.indexOf("  destroyRegisteredSurface(", source.indexOf("  createRegisteredSurfaceHandle("))), /controller:/);
  assert.match(source, /if \(Array\.isArray\(action\)\)/);
  assert.match(source, /action\.op \|\| action\.action \|\| action\.type/);
  assert.match(source, /insertApiElements\(options = \{\}\)/);
  assert.match(source, /registeredSurfaceOwner/);
  assert.match(source, /registeredSurfaceId/);
  assert.match(source, /registeredSurfaceSource/);
});

test("deleting a vault file clears NoteDraw controllers, DOM presentation, cache, and storage", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const destroySource = source.slice(source.indexOf("  destroy(options = {})"), source.indexOf("  async toggle()", source.indexOf("  destroy(options = {})")));

  assert.match(source, /this\.registerEvent\(this\.app\.vault\.on\("delete"/);
  assert.match(source, /async handleVaultFileDelete\(deletedFile\)/);
  assert.match(source, /controller\.destroy\(\{ discardEdits: true \}\)/);
  assert.match(destroySource, /this\.clearMarkdownBlockPresentation\(\)/);
  assert.match(source, /this\.drawingStateCache\.delete\(key\)/);
  assert.match(source, /this\.app\.vault\.adapter\.remove\(path\)/);
  assert.match(source, /collectDeletedVaultFiles\(deletedFile\)/);
});

test("3.4.32 preserves reading content and cross-view frames without hidden-surface layout writes", async () => {
  const [source, manifestText] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(manifestUrl, "utf8")
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.version, "3.4.32");
  assert.match(source, /version: "3\.4\.19"/);
  assert.match(source, /this\.readingVirtualStyleState = \/\* @__PURE__ \*\/ new Map\(\)/);
  assert.match(source, /shouldClearStaleReadingVirtualMinHeight\(\{/);
  assert.match(source, /this\.rememberReadingVirtualStyle\(sizer, "min-height"\)/);
  assert.match(source, /this\.restoreReadingVirtualStyles\(\)/);
  assert.match(source, /data-note-draw-virtual-height/);
  assert.match(source, /this\.resizeFallbackTimer = null/);
  assert.match(source, /window\.setTimeout\(\(\) => this\.flushScheduledResize\(\), 120\)/);
  assert.match(source, /flushScheduledResize\(\)[\s\S]*window\.cancelAnimationFrame\(this\.resizeFrameId\)[\s\S]*window\.clearTimeout\(this\.resizeFallbackTimer\)/);
  assert.match(source, /this\.repairConnectedReadingSections\(\);\s*await this\.prepareInitialReadingLayout\(\)/);
  assert.match(source, /new MutationObserver\(\(mutations\) => \{\s*if \(mutations\.some\(\(mutation\) => isMarkdownContentMutation\(mutation\)\)\) \{\s*this\.repairConnectedReadingSections\(\)/);
  assert.match(source, /await this\.ensureDrawingsLoaded\(\);\s*this\.repairConnectedReadingSections\(\);/);
  assert.match(source, /repairConnectedReadingSections\(renderer = this\.readingPreviewRenderer\(\)\)[\s\S]*renderer\.updateVirtualDisplay\?\.\(\);[\s\S]*section\.rendered !== false[\s\S]*section\.render\?\.\(\);[\s\S]*renderer\.measureSection\?\.\(section\);[\s\S]*renderer\.updateVirtualDisplay\?\.\(\)/);
  assert.match(source, /restoreReadingVirtualSections\(\)[\s\S]*this\.repairConnectedReadingSections\(renderer\)/);
  assert.match(source, /const requestFrame = \(\) => new Promise[\s\S]*window\.requestAnimationFrame\(finish\)[\s\S]*window\.setTimeout\(finish, 120\)/);
  assert.match(source, /if \(!this\.responsivePointsInitialized \|\| signature !== this\.responsiveLayoutSignature\)/);
  assert.match(source, /captureElementLayoutForStroke/);
  assert.match(source, /projectElementPoints\(stroke\.points, layout, box/);
  assert.doesNotMatch(source, /stabilizeElementRelations\(projected, layoutsById\)/);
  assert.match(source, /const transitionProjected = \[\.\.\.projected\];/);
  assert.match(source, /controller\.drawingData = normalizeDrawingData\(data, file\);\s*controller\.rebuildElementRelations\(\);/);
  assert.match(source, /elementLayoutNeedsRepair\(existingLayout\)/);
  assert.match(source, /function normalizeDrawingDataForStorage\(data, file\)/);
  const responsiveMigration = source.slice(source.indexOf("  initializeAndProjectResponsivePoints("), source.indexOf("  resizeCanvas(options = {})"));
  const surfaceSync = source.slice(source.indexOf("  runSurfaceSync()"), source.indexOf("  scheduleSurfaceSync(", source.indexOf("  runSurfaceSync()")));
  assert.doesNotMatch(responsiveMigration, /scheduleDrawingSave|writeDrawings/);
  assert.match(source, /for \(const controller of this\.liveControllers\) \{[\s\S]*controller\.syncFloatingControlClasses\(\);\s*if \(isElementVisibleEnough\(controller\.previewEl\)\) \{\s*controller\.scheduleFrozenNoteFlowLayoutRestore\(\);\s*controller\.scheduleResize\(\{ layout: false, measure: false \}\);/);
  assert.doesNotMatch(surfaceSync, /clearNoteFlowLayout/);
  assert.match(source, /pickRootPreview\(previews, rendererPreview, isElementVisibleEnough, isElementLaidOut\)/);
  assert.match(source, /for \(const alternatePreview of findRootPreviewsForView\(view\)\)/);
  assert.match(source, /!this\.canvas\?\.isConnected \|\| !isElementVisibleEnough\(this\.previewEl\)/);
  const activationSource = source.slice(source.indexOf("  setControllerActivation(controller, active)"), source.indexOf("  installWebviewObserver()", source.indexOf("  setControllerActivation(controller, active)")));
  assert.match(activationSource, /setControllerActivation\(controller, active\)[\s\S]*this\.viewDrawingActive\.set\(key, enabled\)[\s\S]*this\.reconcileControllerActivation\(controller\)/);
  assert.match(activationSource, /reconcileControllerActivation\(controller = null\)[\s\S]*const visible = candidates\.filter\([\s\S]*!candidate\.embeddedSurface[\s\S]*isElementVisibleEnough\(candidate\.previewEl\)/);
  assert.match(activationSource, /const preferred = enabled[\s\S]*visible\.find\(\(candidate\) => candidate === controller\)[\s\S]*visible\[0\]/);
  assert.match(activationSource, /const nextActive = Boolean\(enabled && candidate === preferred\);[\s\S]*candidate\.applyActiveState\(nextActive, \{ eager: nextActive \|\| !enabled \}\)/);
  assert.match(source, /scheduleLayoutRefresh\(options = \{\}\)/);
  assert.match(source, /generation === this\.layoutRefreshGeneration/);
  assert.match(source, /noteFlowLayout: normalizeFrozenNoteFlowLayout\(data\?\.noteFlowLayout\)/);
  assert.match(source, /scheduleNoteFlowLayout\(options = \{\}\)[\s\S]*options\.operation === true && this\.active[\s\S]*this\.cancelFrozenNoteFlowLayoutRestore\(\)/);
  assert.match(source, /restoreFrozenNoteFlowLayout\(\)[\s\S]*frozen\.offsets[\s\S]*state\.base \+ offset/);
  assert.match(source, /const frozenByZoom = Math\.abs\(this\.readingZoomScale\(\) - 1\) >= 0\.001[\s\S]*this\.readingLogicalSizerHeight > 0/);
  assert.match(source, /captureReadingLogicalSizerHeight\(undefined, \{ allowGrowth: true \}\)/);
  assert.match(source, /minWindowHeight: calculateZoomAwareWindowFloor\(\{ visualScale \}\)/);
  assert.doesNotMatch(source, /this\.readingZoomStage\?\.scroll(?:Width|Height)/);
  assert.doesNotMatch(source.slice(source.indexOf("  resizeCanvas(options = {})"), source.indexOf("  onPointerDown(", source.indexOf("  resizeCanvas(options = {})"))), /applyElementStyles\(this\.readingZoomStage/);
  assert.match(source, /const layerBacking = this\.drawingsVisible && this\.drawingsLoaded \? backingStore : \{ width: 1, height: 1, scale: 1 \}/);
  assert.match(source, /const activeBacking = this\.drawingsVisible && this\.drawingsLoaded && this\.active \? backingStore : \{ width: 1, height: 1, scale: 1 \}/);
  assert.match(source, /hasVisibleAlternateWorkspaceSurface\(view, preview\)[\s\S]*findWebviewSurfaces\(view\.containerEl\)/);
  assert.match(source, /isDominantEmbeddedWebviewSurface\(preview, surface\)/);
  assert.match(source, /const primaryDocumentSurface = preview\.classList\?\.contains\("mwv-note-browser-document"\)[\s\S]*otherBodyBlocks\.length === 0/);
  assert.match(source, /surfaceWidth >= previewWidth \* 0\.8[\s\S]*surfaceHeight >= previewHeight \* 0\.8 \|\| primaryDocumentSurface/);
  assert.match(source, /if \(!previewVisible\) \{\s*if \(alternateSurfaceVisible\)[\s\S]*controller\.destroy\(\)/);
  assert.match(source, /this\.prepareFrozenNoteFlowLayout\(\)\.catch\(\(error\) => \{\s*void error;\s*}\);\s*this\.resizeCanvas\(\{ layout: false, measure: true \}\);\s*this\.render\(\)/);
  assert.match(source, /const refreshLayout = options\.layout === true && !interactionActive/);
  const activeState = source.slice(source.indexOf("  applyActiveState(active, options = {})"), source.indexOf("  controlsShouldBeVisible()", source.indexOf("  applyActiveState(active, options = {})")));
  assert.doesNotMatch(activeState, /scheduleLayoutRefresh/);
  assert.match(activeState, /if \(wasActive !== this\.active && this\.drawingsLoaded\) \{\s*this\.scheduleResize\(\{ layout: false, measure: false \}\)/);
  assert.match(source, /this\.registerMarkdownPostProcessor\([\s\S]*this\.runSurfaceSync\(\);\s*this\.scheduleSurfaceSync\(180\);\s*}\s*onunload\(\)/);
});

test("reading text edits avoid placeholder breaks and support undo, redo, and block sorting", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /stripGeneratedTerminalBreaks\(serializeEditableChildren\(element\)\)/);
  assert.match(source, /function stripGeneratedTerminalBreaks\(value\)/);
  assert.match(source, /\["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "td", "th", "figcaption", "caption"\]\.includes\(tag\)/);
  assert.match(source, /await this\.plugin\.undoControllerHistory\(this\)/);
  assert.match(source, /await this\.plugin\.redoControllerHistory\(this\)/);
  assert.match(source, /recordMarkdownHistory\(file, before, after/);
  assert.match(source, /const result = await this\.saveTextBlock\(file, originalText, editedText, sourceInfo, target\)/);
  assert.match(source, /controller\?\.recordMarkdownHistory\(file, result\.history\.before, result\.history\.after\)/);
  assert.match(source, /recordDrawingHistory\(before\)/);
  assert.match(source, /kind: "compound"/);
  assert.match(source, /recordCompoundHistory\(file, source, result\.source, options\.drawingBefore\)/);
  assert.doesNotMatch(source, /installTextSortHandle\(element\)/);
  assert.match(source, /async reorderTextBlock\(file, movingElement, targetElement, placeAfter = false, sourceState = \{\}\)/);
  assert.match(source, /element\.dataset\.noteDrawSortDragging === "true"/);
  assert.match(source, /this\.updateMarkdownBlockDropTarget\(pendingX, pendingY\)/);
  assert.match(source, /this\.flushMarkdownBlockDropTarget\(event\.clientX, event\.clientY\)/);
  assert.match(source, /this\.dragMarkdownTextCommit = this\.endTextEdit\(\)/);
  assert.match(source, /const textCommitted = await Promise\.resolve\(drop\?\.textCommit\)\.catch\(\(\) => false\)/);
  assert.match(source, /if \(textCommitted === false\)/);
  assert.match(source, /normalizeEditableSourceText\(state\.baselineText\) === normalizeEditableSourceText\(state\.latestText\)/);
  assert.match(source, /this\.currentEditor\.replaceChildren\(textNode\)/);
  assert.match(source, /hoistPlainTextMarker\(marker, this\.currentEditor, isClearableInlineFormattingElement\)/);
  assert.match(source, /createAsyncCommitBarrier/);
  assert.match(source, /commitWebviewTextEdit\(element, original, edited\)[\s\S]*recordDrawingHistory\(historyBefore\)/);
  assert.match(source, /button\.addEventListener\("contextmenu", state\.contextMenuHandler\)/);
  assert.match(source, /onButtonContextMenu\(event\)[\s\S]*this\.toggleDrawingsVisible\(\)/);
  assert.match(source, /if \(!this\.drawingsVisible\) \{\s*this\.setDrawingsVisible\(true\)/);
  assert.doesNotMatch(styles, /\.notedraw-text-sort-handle\b/);
  assert.match(styles, /\.notedraw-text-sort-target-before \{/);
  assert.match(styles, /\.notedraw-text-sort-target-after \{/);
});

test("reading and source controllers share the latest in-memory drawing state", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const storageKey = this\.drawingStorageKey\(file, storageMode\);\s*const cached = this\.drawingStateCache\.get\(storageKey\);\s*if \(cached\) \{\s*return normalizeDrawingData\(cached, file\)/);
  assert.match(source, /const incoming = normalizeDrawingDataForStorage\(data, file\);\s*const canonical = options\.replace === true[\s\S]*mergeControllerDrawingSnapshot\(this\.drawingStateCache\.get\(path\), incoming\);\s*this\.drawingStateCache\.set\(path, canonical\);\s*this\.pendingDrawingSaves\.set\(path, file\);\s*this\.refreshControllersForFile\(file, canonical, \{ excludeData: options\.excludeData \|\| data \}\)/);
  assert.match(source, /this\.scheduleDrawingSave\(entry\.file, data, \{ replace: true \}\)/);
  assert.match(source, /writeDrawings\(file, compacted, \{ refresh: false, updateCache: false \}\)/);
  assert.match(source, /this\.plugin\.setControllerActivation\(this, nextActive\)/);
  assert.match(source, /controller\.scheduleLayoutRefresh\(\{ settle: false \}\);\s*controller\.requestRender\(true\)/);
  assert.match(source, /this\.textPanel = createNoteDrawControlElement\(this\.floatingControlsHost, "notedraw-text-panel"\)/);
  assert.doesNotMatch(source, /if \(this\.surfaceType !== "source"\) \{\s*this\.textButton/);
});

test("NoteDraw storage locations and single-file sharing stay portable and backward compatible", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const storageSource = source.slice(source.indexOf("  drawingStorageModeForFile("), source.indexOf("  injectExportSnapshot("));
  const shareSource = source.slice(source.indexOf("  async createPortableBundle("), source.indexOf("  async appendDebugLog("));
  const drawingDataApi = source.slice(source.indexOf("  async readDrawingDataApi("), source.indexOf("  registeredSurfaceViewportState("));
  const settingsSource = source.slice(source.indexOf("  getSettingDefinitions()"), source.indexOf("  addSliderWithValue("));

  assert.match(source, /drawingStorageMode: DRAWING_STORAGE_CONFIG/);
  assert.match(source, /DRAWING_STORAGE_NOTE_SUBFOLDER[\s\S]*DRAWING_STORAGE_NOTE_FOLDER[\s\S]*DRAWING_STORAGE_EMBEDDED/);
  assert.match(storageSource, /resolveDrawingStoragePath\([\s\S]*mode/);
  assert.match(storageSource, /const configPath = this\.drawingPathForFile\(file, DRAWING_STORAGE_CONFIG\)/);
  assert.match(storageSource, /candidates\.sort\(\(a, b\) => portableTimestamp\(b\.updatedAt\) - portableTimestamp\(a\.updatedAt\)/);
  assert.match(storageSource, /this\.app\.vault\.process\(realFile, \(source\) => appendEncodedNotedrawDataBlock\(source, block\)\)/);
  assert.match(settingsSource, /drawingStorageMode[\s\S]*drawingStorageConfig[\s\S]*drawingStorageNoteSubfolder[\s\S]*drawingStorageNoteFolder[\s\S]*drawingStorageEmbedded/);
  assert.match(source, /this\.app\.workspace\.on\("file-menu"[\s\S]*shareNoteDrawFile[\s\S]*setIcon\("share-2"\)/);
  assert.match(source, /drawingDataExchange: \["read", "parse", "serialize"\]/);
  assert.match(source, /drawingData = Object\.freeze\(\{[\s\S]*read:[\s\S]*parse:[\s\S]*serialize:/);
  assert.match(drawingDataApi, /readDrawings\(file, \{ migrateLegacy: false \}\)/);
  assert.match(drawingDataApi, /decodeNotedrawDataBlock\(value\)[\s\S]*JSON\.parse\(value\)/);
  assert.match(drawingDataApi, /format === "json"[\s\S]*format === "block"[\s\S]*format === "markdown"/);
  assert.doesNotMatch(drawingDataApi, /vault\.(?:create|modify|process|delete|rename)|adapter\.(?:write|writeBinary|remove|rename)|changeDrawingStorageMode|writeDrawings\(/);
  assert.match(shareSource, /includeMarkdownLinks[\s\S]*metadataCache\.getFileCache[\s\S]*requestUrl\(\{ url: raw, method: "GET" \}\)/);
  assert.match(shareSource, /TEXT_RENDER_NOTE[\s\S]*TEXT_RENDER_MARKDOWN[\s\S]*TEXT_RENDER_HTML[\s\S]*mindMapSource/);
  assert.match(shareSource, /createAndOpenShareCopy\(file, markdown, bundle\)[\s\S]*vault\.create\(path, markdown\)[\s\S]*leaf\.openFile\(copyFile[\s\S]*mode: "preview"[\s\S]*waitForShareCopyPreview\(copyFile, leaf\)/);
  assert.match(shareSource, /waitForShareCopyPreview\(file, leaf\)[\s\S]*hydratePortableMarkdownResources\(preview, path\)[\s\S]*ensureDrawingsLoaded\(\)[\s\S]*waitForNextFrame\(\)[\s\S]*waitForNextFrame\(\)/);
  assert.match(shareSource, /buildPortableMarkdownCopy\(file\)[\s\S]*createAndOpenShareCopy\(file, markdown, bundle\)[\s\S]*navigator\.share\(shareData\)/);
  assert.match(shareSource, /new File\(\[markdown\], name, \{ type: "text\/markdown;charset=utf-8" \}\)/);
  assert.match(shareSource, /typeof navigator !== "undefined"[\s\S]*navigator\.canShare\(shareData\)[\s\S]*downloadPortableMarkdown/);
  assert.match(source, /hydratePortableMarkdownResources\(el, renderedSourcePath\)/);
  assert.match(source, /portableResourceUrl\(this\.file, assetPath\)/);
  assert.match(source, /const portable = this\.plugin\.portableResource\(this\.file, normalized \|\| link\)[\s\S]*portableResourceText\(portable\)/);
  assert.match(styles, /\.internal-embed\[data-notedraw-portable-resource\]/);
});

test("body-level controls are hidden outside the active note surface and behind settings", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /controlsShouldBeVisible\(\)/);
  assert.match(source, /isBlockingObsidianOverlayOpen\(activeDocument\)/);
  assert.match(source, /activeLeaf && ownerLeaf && activeLeaf !== ownerLeaf/);
  assert.match(source, /element\?\.toggleClass\("is-notedraw-controls-visible", visible\)/);
  assert.match(styles, /notedraw-body-control\.notedraw-toolbar\.is-drawing-active\.is-notedraw-controls-visible/);
  assert.match(styles, /notedraw-body-control\.notedraw-format-toolbar\.is-notedraw-controls-visible\.is-visible/);
});

test("declared minimum Obsidian version uses compatible APIs and CSS", async () => {
  const [source, styles, manifestText] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(manifestUrl, "utf8")
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.minAppVersion, "1.5.0");
  assert.doesNotMatch(source, /getFileByPath/);
  assert.doesNotMatch(source, /globalThis/);
  assert.match(source, /getAbstractFileByPath/);
  assert.doesNotMatch(styles, /scrollbar-width/);
  assert.doesNotMatch(styles, /::-webkit-scrollbar/);
});

test("floating text editing keeps one anchor and survives multiline IME input", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const editorDocument = this\.canvas\?\.ownerDocument/);
  assert.match(source, /editorDocument\.body\.createEl\("textarea"/);
  assert.match(source, /editorWindow\.visualViewport\?\.addEventListener\("resize", resize\)/);
  assert.match(source, /isRichTextStroke\(preset\) && Number\(preset\.previewWidth\) > 0/);
  assert.match(source, /this\.openFloatingTextInput\(stroke\.points\[0\], index\)/);
  assert.match(source, /textarea\.addEventListener\("compositionstart"/);
  assert.match(source, /textarea\.addEventListener\("compositionend"/);
  assert.match(source, /fontSize: clamp\(Number\(preset\.fontSize \|\| 18\), 10, 72\)/);
  assert.match(source, /this\.scheduleLayoutRefresh\(\{ settle: false \}\)/);
  assert.match(source, /stroke\.textWidth = this\.floatingTextContentWidth/);
  assert.match(source, /layout\.lines\.forEach/);
  assert.match(source, /if \(placement\.centered\) \{[\s\S]*state\.commitPoint = this\.eventToPoint[\s\S]*\} else \{\s*state\.commitPoint = \{ \.\.\.state\.point \}/);
  assert.match(source, /this\.endFloatingTextInput\(false, state\);\s*this\.render\(\);\s*this\.requestRender\(true\)/);
});

test("two-finger scrolling always releases touch suppression before the next stroke", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /activeDocument\.addEventListener\("pointerup", this\.onDocumentPointerFinish, true\)/);
  assert.match(source, /activeDocument\.addEventListener\("pointercancel", this\.onDocumentPointerFinish, true\)/);
  assert.match(source, /onDocumentPointerFinish\(event\)[\s\S]*this\.completeTrackedTouch\(event\.pointerId\)/);
  assert.match(source, /event\.isPrimary && this\.touchPointers\.size && !this\.pointerDown && this\.activePointerId === null[\s\S]*this\.resetTouchGestureState\(\)/);
  assert.match(source, /completeTrackedTouch\(pointerId\)[\s\S]*this\.touchPointers\.size === 0[\s\S]*this\.suppressTouchDrawing = false[\s\S]*this\.scheduleResize\(\{ layout: false, measure: false \}\)[\s\S]*this\.requestRender\(true\)/);
  assert.match(source, /handleMultiTouchScroll\(event\)[\s\S]*window\.requestAnimationFrame[\s\S]*this\.flushMultiTouchGesture\(\)/);
  assert.match(source, /flushMultiTouchGesture\(\)[\s\S]*previousClientPoint: previous[\s\S]*persist: false[\s\S]*resize: false/);
});

test("reading controllers survive zero-sized view transitions until the source surface is visible", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const syncStart = source.indexOf("  syncMarkdownControllerModes() {");
  const syncSource = source.slice(syncStart, source.indexOf("  syncEmbeddedMarkdownControllers()", syncStart));

  assert.match(syncSource, /const sourceVisible = isMarkdownSourceVisible\(view, source\)/);
  assert.match(syncSource, /if \(isSourceMode\(view\) && sourceVisible && !previewVisible\) \{\s*for \(const rootPreview of findRootPreviewsForView\(view\)\)/);
  assert.match(syncSource, /sourceController\?\.syncFloatingControlClasses\(\);\s*if \(!previewVisible\) \{\s*if \(alternateSurfaceVisible\)[\s\S]*controller\.destroy\(\);[\s\S]*continue;/);
  assert.match(syncSource, /if \(previewController\?\.plugin === this && !previewController\.destroyed[\s\S]*continue;\s*}\s*if \(!isRootPreviewReady/);
  assert.match(syncSource, /if \(!isRootPreviewReady\(view, preview\)\) \{\s*previewController\?\.destroy\(\);\s*if \(this\.schedulePreviewRenderRecovery\(view, preview\)\) \{\s*continue;\s*}\s*resetDormantRootPreview\(view, preview\);\s*continue;/);
  assert.match(source, /schedulePreviewRenderRecovery\(view, preview\)[\s\S]*state\.attempts >= 2[\s\S]*view\.previewMode\?\.rerender\?\.\(true\)[\s\S]*this\.scheduleSurfaceSync\(60\)/);
});

test("scrolling and touch completion cannot trigger a full Markdown layout loop", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const scrollStart = source.indexOf("  onScroll() {");
  const scrollSource = source.slice(scrollStart, source.indexOf("  scheduleResize(options = {})", scrollStart));
  const touchStart = source.indexOf("  completeTrackedTouch(pointerId) {");
  const touchSource = source.slice(touchStart, source.indexOf("  resetTouchGestureState()", touchStart));

  assert.doesNotMatch(scrollSource, /scheduleMarkdownAnnotationRefresh/);
  assert.doesNotMatch(scrollSource, /scheduleResize\(\{ layout: true \}\)/);
  assert.match(scrollSource, /scheduleResize\(\{ layout: false, measure: false \}\)/);
  assert.doesNotMatch(touchSource, /scheduleMarkdownAnnotationRefresh/);
  assert.match(touchSource, /if \(finishingMultiTouch\) \{\s*this\.scheduleReadingZoomSettle\(80\);\s*this\.scheduleResize\(\{ layout: false, measure: false \}\)/s);
});

test("deactivating the wand promotes selected text and drawings back into the static canvas", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /if \(!this\.active && wasActive\)[\s\S]*this\.clearSelectedStrokes\(\);[\s\S]*this\.resetTouchGestureState\(\);[\s\S]*this\.render\(\)/);
});

test("non-empty floating text commits before wand, view, file, or controller teardown", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /async setFile\(file\)[\s\S]*this\.endTextEdit\(\);\s*this\.endFloatingTextInput\(true\)/);
  assert.match(source, /destroy\(options = \{\}\)[\s\S]*else \{\s*this\.endTextEdit\(\);\s*this\.endFloatingTextInput\(true\);\s*\}[\s\S]*this\.clearDraggedNoteFlowPlacement\(\);\s*this\.destroyed = true/);
  assert.match(source, /if \(!this\.active && wasActive\)[\s\S]*this\.endFloatingTextInput\(true\)/);
  assert.match(source, /setEditMarkdownMode\(\)[\s\S]*this\.endFloatingTextInput\(true\)/);
  assert.match(source, /openFloatingTextInput\(point, index = -1\) \{\s*this\.endFloatingTextInput\(true\)/);
  assert.match(source, /if \(state\.composing\) \{\s*state\.composing = false;\s*state\.commitAfterComposition = false/);
});

test("runtime layout uses a capped desktop Markdown lane and mobile-aware vertical flow", async () => {
  const [source, canvasSizing, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(canvasSizingUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /constrainWideContentFrame\(\{\s*surfaceWidth,[\s\S]*contentWidth: contentRect\.width[\s\S]*\}, \{ isMobile: isMobileRuntime\(\) \}\)/);
  assert.match(source, /preferDocumentFlow: isMobileRuntime\(\)/);
  assert.match(source, /estimateStableElementLayoutExtent/);
  assert.match(canvasSizing, /relativeRight/);
  assert.match(canvasSizing, /relativeBottom/);
  assert.match(source, /annotateRenderedMarkdownLines/);
  assert.match(source, /collectVirtualMarkdownLineAnchors/);
  assert.match(source, /buildVirtualMarkdownSectionAnchors/);
  assert.match(source, /app\.vault\.cachedRead\(file\)/);
  assert.match(source, /matchRenderedTextToMarkdown/);
  assert.match(source, /let boxHit = -1[\s\S]*isTextLikeStroke\(stroke\) \|\| isEmbedStroke\(stroke\)[\s\S]*return index;[\s\S]*return boxHit/);
  assert.match(styles, /is-notedraw-source-shell \.notedraw-embed-layer \{\s*z-index: 18;/);
});

test("draw mode defers blank-selection clearing until tap or stroke movement is known", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const selectedDrawGesture = resolveSelectedDrawGesture\(/);
  assert.match(source, /selectedDrawGesture === SELECTED_DRAW_GESTURE_MANIPULATE[\s\S]*this\.startSelectedStrokeDrag\(event, point, hitStrokeIndex\)/);
  assert.match(source, /selectedDrawGesture !== SELECTED_DRAW_GESTURE_DRAW_OR_DESELECT[\s\S]*this\.clearSelectedStrokes\(\)/);
  assert.match(source, /if \(this\.didMove && !wasDrawing\) \{\s*this\.endTextEdit\(\);\s*this\.clearSelectedStrokes\(\)/);
  assert.match(source, /if \(!this\.didMove \|\| movedDistance <= this\.tapDistancePx\(\)[\s\S]*this\.isNoteFlowPenActive\(\)[\s\S]*this\.clearSelectedStrokes\(\)[\s\S]*this\.setSelectedStrokes\(this\.findStrokeAt\(point, \{ x: event\.clientX, y: event\.clientY \}\)\)/);
});

test("note pen ignores element selection and selection-only gestures preserve Markdown flow", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerSource = source.slice(source.indexOf("  onPointerDown("), source.indexOf("  startConnectorGesture("));
  const drawingMoveSource = source.slice(source.indexOf("  onPointerMove("), source.indexOf("  onPointerUp("));
  const dragSource = source.slice(source.indexOf("  startSelectedStrokeDrag("), source.indexOf("  startSelectedStrokeResize("));
  const startSource = dragSource.slice(0, dragSource.indexOf("  connectorTargetIdsForStrokeIndexes("));
  const moveSource = dragSource.slice(dragSource.indexOf("  moveSelectedStroke("), dragSource.indexOf("  finishSelectedStrokeDrag("));
  const finishSource = dragSource.slice(dragSource.indexOf("  finishSelectedStrokeDrag("), dragSource.indexOf("  cancelSelectedStrokeDrag("));
  const selectionStateStart = source.indexOf("  setSelectedStrokes(", source.indexOf("  findStrokeAt("));
  const selectionStateSource = source.slice(selectionStateStart, source.indexOf("  copySelectedElements(", selectionStateStart));

  assert.match(source, /isNoteFlowPenActive\(\) \{[\s\S]*this\.toolMode === TOOL_DRAW[\s\S]*this\.brushMode === BRUSH_PEN[\s\S]*this\.currentBrushVariant\(\) === PEN_VARIANT_NOTE/);
  assert.match(pointerSource, /const noteFlowPenActive = this\.isNoteFlowPenActive\(\)[\s\S]*this\.clearSelectedStrokes\(\)[\s\S]*let hitStrokeIndex = noteFlowPenActive \? -1 : this\.findStrokeAt\(point, clientPoint\)[\s\S]*let resizeHandle = noteFlowPenActive \? null/);
  assert.doesNotMatch(pointerSource, /noteFlowOperationPending|scheduleMarkdownAnnotationRefresh/);
  assert.match(drawingMoveSource, /if \(this\.didMove && !wasDrawing\) \{[\s\S]*this\.currentStroke\.noteFlow\?\.enabled[\s\S]*this\.noteFlowOperationPending = true[\s\S]*this\.scheduleMarkdownAnnotationRefresh\(\{ layout: false \}\)/);
  assert.doesNotMatch(startSource, /prepareReadingBottomExtentForDrag|clearNoteFlowLayout|scheduleNoteFlowLayout/);
  assert.match(moveSource, /if \(!this\.dragStrokeMoved && movedDistance <= this\.tapDistancePx\(\)\) \{[\s\S]*return;[\s\S]*this\.cancelResizeFrame\(\);[\s\S]*this\.prepareReadingBottomExtentForDrag\(\)/);
  assert.match(finishSource, /const didMove = this\.dragStrokeMoved;[\s\S]*if \(didMove\) \{[\s\S]*this\.clearNoteFlowLayout\(\)[\s\S]*this\.scheduleNoteFlowLayout\([\s\S]*\} else if \(!this\.dragStrokePreserveSelection/);
  assert.doesNotMatch(finishSource, /cancelSelectedStrokeDrag\(true\)/);
  assert.doesNotMatch(selectionStateSource, /clearNoteFlowLayout|scheduleNoteFlowLayout|scheduleResize|scheduleLayoutRefresh|noteFlowOperationPending/);
});

test("selection tool previews and commits exact NoteFlow Markdown insertion targets", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const dragSource = source.slice(source.indexOf("  startSelectedStrokeDrag("), source.indexOf("  startSelectedStrokeResize("));
  const dropSource = source.slice(source.indexOf("  draggedNoteFlowIndexes("), source.indexOf("  captureNoteFlowAnchor("));
  const finishSource = dragSource.slice(dragSource.indexOf("  finishSelectedStrokeDrag("), dragSource.indexOf("  cancelSelectedStrokeDrag("));

  assert.match(source, /selectNoteFlowDropPlacement/);
  assert.match(dropSource, /this\.toolMode === TOOL_SELECT[\s\S]*queueDraggedNoteFlowPlacement\(clientX, clientY\)[\s\S]*window\.requestAnimationFrame/);
  assert.match(dropSource, /notedraw-text-sort-target-before[\s\S]*notedraw-text-sort-target-after[\s\S]*notedraw-text-sort-target-left[\s\S]*notedraw-text-sort-target-right/);
  assert.match(dropSource, /noteDrawDropSide[\s\S]*noteDrawDropLine/);
  assert.match(dropSource, /const intent = resolveDragDropHorizontalIntent\([\s\S]*horizontalRoom: true[\s\S]*\);[\s\S]*const horizontalSide = intent === "inline-right" \? "right" : null[\s\S]*const leftSnap = intent === "line-start"/);
  assert.match(dropSource, /applyElementStyles\(indicator, horizontalSide \? \{[\s\S]*width: "4px"[\s\S]*height: `\$\{Math\.max\(16, Math\.round\(targetRect\.height\)\)\}px`/);
  assert.match(dropSource, /snapDraggedSelectionToNoteFlowPlacement[\s\S]*if \(horizontalSide \|\| leftSnap\)[\s\S]*laneCanvasX[\s\S]*leftSnap[\s\S]*laneCanvasX - allBounds\.minX[\s\S]*targetBounds\.maxX \+ gap - allBounds\.minX/);
  assert.match(dragSource, /this\.usesDraggedNoteFlowPlacement\(\)[\s\S]*this\.queueDraggedNoteFlowPlacement\(event\.clientX, event\.clientY\)[\s\S]*this\.queueDraggedNoteFlowRefresh/);
  assert.match(finishSource, /requestedDropPlacement[\s\S]*this\.clearNoteFlowLayout\(\)[\s\S]*this\.resolveDraggedNoteFlowPlacement[\s\S]*this\.snapDraggedSelectionToNoteFlowPlacement/);
  assert.match(finishSource, /placement: droppedNoteFlowIndexes\.has\(index\) \? resolvedDropPlacement : null/);
  assert.doesNotMatch(dropSource, /vault\.modify|reorderTextBlock/);
  assert.match(styles, /\.notedraw-note-flow-drop-indicator \{[\s\S]*position: fixed;[\s\S]*pointer-events: none;/);
  assert.match(styles, /\.notedraw-body-control\.notedraw-note-flow-drop-indicator\.is-notedraw-controls-visible\.is-visible/);
});

test("selection requires a completed tap before moving an element and reserves resize for frame corners", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerSource = source.slice(source.indexOf("  onPointerDown("), source.indexOf("  startConnectorGesture(", source.indexOf("  onPointerDown(")));
  const strokeSelection = pointerSource.slice(pointerSource.indexOf("if (this.toolMode === TOOL_SELECT && hitStrokeIndex >= 0)"), pointerSource.indexOf("if (this.toolMode === TOOL_SELECT && hitStrokeIndex < 0 && markdownSelectionCandidate)"));
  const markdownSelection = pointerSource.slice(pointerSource.indexOf("if (this.toolMode === TOOL_SELECT && hitStrokeIndex < 0 && markdownSelectionCandidate)"), pointerSource.indexOf("if (this.toolMode === TOOL_SELECT && hitStrokeIndex < 0 && !markdownSelectionCandidate)"));
  const boxedSelection = pointerSource.slice(pointerSource.indexOf("if (this.toolMode === TOOL_SELECT && hitStrokeIndex < 0 && !markdownSelectionCandidate)"), pointerSource.indexOf("if (selectedDrawGesture ==="));

  assert.match(pointerSource, /let resizeHandle = noteFlowPenActive \? null : this\.findSelectionHandleAt\(point\);/);
  assert.match(pointerSource, /if \(resizeHandle\) \{\s*this\.startSelectedStrokeResize\(event, resizeHandle\);/);
  assert.match(strokeSelection, /const wasSelected = this\.isStrokeSelected\(hitStrokeIndex\);/);
  assert.match(strokeSelection, /if \(!wasSelected\) \{/);
  assert.match(strokeSelection, /this\.startPendingSelectionTap\(event, \{ type: "select-stroke", index: hitStrokeIndex \}\)/);
  assert.match(strokeSelection, /this\.startPendingSelectionTap\(event, \{ type: "toggle-stroke", index: hitStrokeIndex \}\)/);
  const strokeSelectIndex = strokeSelection.indexOf('type: "select-stroke"');
  const strokeDragIndex = strokeSelection.indexOf("this.startSelectedStrokeDrag(event, point, hitStrokeIndex", strokeSelectIndex);
  assert.ok(strokeSelectIndex >= 0 && strokeDragIndex > strokeSelectIndex);
  assert.match(strokeSelection.slice(strokeSelectIndex, strokeDragIndex), /return;/);
  assert.match(markdownSelection, /this\.startPendingSelectionTap\(event, \{[\s\S]*type: "toggle-markdown"/);
  assert.match(markdownSelection, /this\.startPendingSelectionTap\(event, \{[\s\S]*type: "select-markdown"/);
  const markdownSelectIndex = markdownSelection.indexOf('type: "select-markdown"');
  const markdownDragIndex = markdownSelection.indexOf("this.startSelectedStrokeDrag(event, point, -1", markdownSelectIndex);
  assert.ok(markdownSelectIndex >= 0 && markdownDragIndex > markdownSelectIndex);
  assert.match(markdownSelection.slice(markdownSelectIndex, markdownDragIndex), /return;/);
  assert.match(boxedSelection, /this\.startPendingSelectionTap\(event, \{[\s\S]*type: "select-group"/);
  const groupSelectIndex = boxedSelection.indexOf('type: "select-group"');
  const groupDragIndex = boxedSelection.indexOf("this.startSelectedStrokeDrag(event, point);", groupSelectIndex);
  assert.ok(groupSelectIndex >= 0 && groupDragIndex > groupSelectIndex);
  assert.match(boxedSelection.slice(groupSelectIndex, groupDragIndex), /return;/);
  assert.match(source, /startPendingSelectionTap\(event, action\)/);
  assert.match(source, /pointerDistance\(pending\.startClient, \{ x: event\.clientX, y: event\.clientY \}\)/);
  assert.match(source, /if \(pending && !pending\.moved && movedDistance <= this\.tapDistancePx\(\)\)/);
});
