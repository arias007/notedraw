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
  assert.match(source, /const selectedMarkdownEditableCandidate = markdownSelectionCandidate[\s\S]*findEditableTarget\(target, this\.previewEl, clientPoint\)[\s\S]*findEditableTarget\(markdownSelectionCandidate, this\.previewEl, clientPoint\)/);
  assert.match(source, /this\.toolMode !== TOOL_EDIT_MD && this\.findStrokeAt/);
  assert.match(source, /markdownBlockElementForTarget\(target, clientPoint = null\)[\s\S]*findMarkdownEmbedBlockElement\(target, this\.previewEl\)[\s\S]*markdownElementContainsClientPoint\(embeddedBlock, clientPoint\)/);
  assert.match(source, /findMarkdownEmbedBlockElement\(target, previewEl = null\)[\s\S]*embed\.matches\?\.\("\.internal-embed"\)[\s\S]*embed\.closest\?\.\("\.internal-embed"\)[\s\S]*embed\.closest\?\.\("\.markdown-embed"\)/);
  assert.match(source, /findMarkdownBlocksInSelection\(startPoint, endPoint\)[\s\S]*const candidates = markdownBlockCandidateElements\(this\.previewEl\)[\s\S]*const element = candidate[\s\S]*forSelection: true/);
  assert.match(source, /function markdownBlockCandidateElements\(root\)[\s\S]*MARKDOWN_EMBED_SELECTOR[\s\S]*findNoteFlowMarkdownBlockElement\(element, root\)/);
  assert.match(source, /function markdownBlockCandidateElementForTarget\(target, root\)[\s\S]*findNoteFlowMarkdownBlockElement\(target, root\)[\s\S]*isMarkdownBlockCandidateElement\(owner\)/);
  assert.match(source, /elementBelowCanvas\(clientX, clientY\)[\s\S]*elementsFromPoint[\s\S]*classList\?\.contains\("notedraw-canvas"\)[\s\S]*pointerEvents: "none"/);
  assert.match(source, /if \(this\.currentEditor && this\.currentEditorEmbedded\) \{\s*return null;/);
  assert.match(source, /this\.surfaceType === "source" && this\.toolMode === TOOL_EDIT_MD && !this\.currentEditorEmbedded/);
  assert.match(source, /if \(this\.currentEditorEmbedded\) \{\s*this\.plugin\.stageTextSave\(this\.currentEditorFile, original, edited, element, this\)/);
  assert.match(source, /queueTextSaveAndWait\(this\.currentEditorFile \|\| this\.file, original, edited, element\)/);
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
  assert.match(source, /deactivate: \(\) => this\.deactivateApi/);
  assert.match(source, /toggle: async \(options = \{\}\)/);
  assert.match(source, /setTool: \(tool, options = \{\}\)/);
  assert.match(source, /execute: async \(actions, options = \{\}\)/);
  assert.match(source, /getElements: async \(options = \{\}\)/);
  assert.match(source, /destroy: \(\) => this\.destroyRegisteredSurface/);
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

test("3.4.84 preserves reading content and cross-view frames without hidden-surface layout writes", async () => {
  const [source, manifestText] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(manifestUrl, "utf8")
  ]);
  const manifest = JSON.parse(manifestText);

  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
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
  assert.match(source, /new MutationObserver\(\(mutations\) => \{\s*if \(mutations\.some\(\(mutation\) => isMarkdownContentMutation\(mutation\)\)\) \{\s*this\.noteFlowMarkdownAnnotationComplete = false;\s*if \(this\.draggingStroke \|\| this\.resizingSelection \|\| this\.pointerDown\) \{[\s\S]*?return;[\s\S]*?this\.scheduleMarkdownMutationSync\(\)/);
  assert.match(source, /if \(editingLayout\) \{[\s\S]*this\.scheduleMarkdownAnnotationRefresh\(\{ layout: false \}\);\s*\} else \{\s*this\.syncMarkdownBlockPresentation\(\);\s*this\.scheduleFrozenNoteFlowLayoutRestore\(\)/);
  assert.match(source, /await this\.ensureDrawingsLoaded\(\);[\s\S]*?this\.repairConnectedReadingSections\(\);/);
  assert.match(source, /repairConnectedReadingSections\(renderer = this\.readingPreviewRenderer\(\)\)[\s\S]*renderer\.updateVirtualDisplay\?\.\(\);[\s\S]*section\.rendered !== false[\s\S]*section\.render\?\.\(\);[\s\S]*renderer\.measureSection\?\.\(section\);[\s\S]*renderer\.updateVirtualDisplay\?\.\(\)/);
  assert.match(source, /restoreReadingVirtualSections\(\)[\s\S]*this\.repairConnectedReadingSections\(renderer\)/);
  assert.match(source, /const requestFrame = \(\) => new Promise[\s\S]*window\.requestAnimationFrame\(finish\)[\s\S]*window\.setTimeout\(finish, 120\)/);
  assert.match(source, /if \(!this\.responsivePointsInitialized \|\| signature !== this\.responsiveLayoutSignature\)/);
  assert.match(source, /captureElementLayoutForStroke/);
  assert.match(source, /projectElementPoints\(stroke\.points, layout, box/);
  assert.doesNotMatch(source, /stabilizeElementRelations\(projected, layoutsById\)/);
  assert.match(source, /const transitionProjected = \[\.\.\.projected\];/);
  assert.match(source, /const projectedById = new Map\(projected\.map\(\(box\) =>/);
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
  assert.match(source, /await this\.prepareFrozenNoteFlowLayout\(\)\.catch\(\(error\) => \{\s*void error;\s*return false;\s*}\);\s*if \(this\.destroyed \|\| generation !== this\.drawingLoadGeneration \|\| this\.file\?\.path !== file\?\.path\) \{\s*return;\s*}\s*this\.syncMarkdownBlockPresentation\(\);\s*this\.resizeCanvas\(\{ layout: false, measure: true \}\);\s*if \(!this\.active && this\.hasNoteFlowElements\(\)\) \{\s*this\.restoreFrozenNoteFlowLayout\(\);\s*this\.scheduleFrozenNoteFlowLayoutRestoreAfterMeasurement\(\);\s*}\s*this\.render\(\)/);
  const scheduledResize = source.slice(source.indexOf("  flushScheduledResize()"), source.indexOf("  cancelResizeFrame()", source.indexOf("  flushScheduledResize()")));
  assert.match(scheduledResize, /const canvasChanged = this\.resizeCanvas[\s\S]*\(canvasChanged \|\| measure\) && !this\.active && this\.hasNoteFlowElements\(\)[\s\S]*this\.scheduleFrozenNoteFlowLayoutRestoreAfterMeasurement\(\)/);
  assert.match(source, /const refreshLayout = options\.layout === true && !interactionActive/);
  const activeState = source.slice(source.indexOf("  applyActiveState(active, options = {})"), source.indexOf("  controlsShouldBeVisible()", source.indexOf("  applyActiveState(active, options = {})")));
  assert.doesNotMatch(activeState, /scheduleLayoutRefresh/);
  assert.match(activeState, /if \(!this\.active && wasActive\)[\s\S]*this\.syncMarkdownBlockPresentation\(\);\s*this\.scheduleFrozenNoteFlowLayoutRestore\(\);\s*this\.render\(\)/);
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

  assert.match(source, /const pending = this\.pendingDrawingSaves\.get\(storageKey\);\s*if \(pending\?\.entries\?\.length\) \{[\s\S]*materializeDrawingSaveRequest[\s\S]*const cached = this\.drawingStateCache\.get\(storageKey\)/);
  assert.match(source, /this\.pendingDrawingSaves\.set\(path, coalesceDrawingSaveRequest[\s\S]*requestIdleCallback\(run, \{ timeout: 800 \}\)/);
  assert.match(source, /const canonical = materializeDrawingSaveRequest\([\s\S]*this\.drawingStateCache\.set\(path, canonical\);[\s\S]*refreshControllersForFile\(request\.file, canonical/);
  assert.match(source, /this\.scheduleDrawingSave\(entry\.file, data, \{ replace: true \}\)/);
  assert.match(source, /writeDrawings\(request\.file, compacted, \{ normalized: true, refresh: false, updateCache: false \}\)/);
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
  assert.match(finishSource, /const didMove = this\.dragStrokeMoved;[\s\S]*scheduleNoteFlowLayout\(\{ operation: true, defer: true \}\)[\s\S]*clearSelectedStrokeDragState\(\{ preserveMarkdownDom:[\s\S]*scheduleNoteFlowLayout\(\{ immediate: true \}\)/);
  assert.doesNotMatch(finishSource, /this\.clearNoteFlowLayout\(\)/);
  assert.match(finishSource, /const affectsNoteFlow = movedNoteFlowIndexes\.length > 0;[\s\S]*if \(!affectsNoteFlow && movedIndexes\.length[\s\S]*this\.applyDraggedEdgeInsertion\(event, movedIndexes\)/);
  assert.match(source, /const boundedDx = clamp\(dx, -selectedBounds\.minX, canvasWidth - selectedBounds\.maxX\);[\s\S]*const boundedDy = clamp\(dy, -selectedBounds\.minY, canvasHeight - selectedBounds\.maxY\);/);
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
  const captureSource = source.slice(source.indexOf("  captureNoteFlowAnchor("), source.indexOf("  toggleSelectedFlowMode("));
  const finishSource = dragSource.slice(dragSource.indexOf("  finishSelectedStrokeDrag("), dragSource.indexOf("  cancelSelectedStrokeDrag("));
  const flowLayoutSource = source.slice(source.indexOf("  applyNoteFlowLayout()"), source.indexOf("  markNoteFlowLayoutMutation()"));
  const projectionSource = source.slice(source.indexOf("  initializeAndProjectResponsivePoints("), source.indexOf("  resizeCanvas(options = {})"));
  const reservedRowSource = source.slice(source.indexOf("  alignNoteFlowStrokesToReservedRows("), source.indexOf("  frozenNoteFlowAnchorsReady("));
  const inlinePackSource = source.slice(source.indexOf("  packInlineNoteFlowItems("), source.indexOf("  alignNoteFlowStrokesToReservedRows("));
  const frozenRestoreStart = source.indexOf("  restoreFrozenNoteFlowLayout() {");
  const frozenRestoreSource = source.slice(frozenRestoreStart, source.indexOf("  clearNoteFlowLayout()", frozenRestoreStart));

  assert.match(source, /selectNoteFlowDropPlacement/);
  assert.match(dropSource, /this\.toolMode === TOOL_SELECT[\s\S]*queueDraggedNoteFlowPlacement\(clientX, clientY\)[\s\S]*window\.requestAnimationFrame/);
  assert.match(dropSource, /notedraw-text-sort-target-before[\s\S]*notedraw-text-sort-target-after[\s\S]*notedraw-text-sort-target-left[\s\S]*notedraw-text-sort-target-right/);
  assert.match(dropSource, /noteDrawDropSide[\s\S]*noteDrawDropLine/);
  assert.match(dropSource, /const inlineRowHit = sameInlineCandidate[\s\S]*const inlineRow = this\.markdownDropRowMetrics\(inlineTarget, movingElements\)[\s\S]*const horizontalRoom = !this\.markdownDropIncludesHeading\(inlineTarget\)[\s\S]*inlineRowHit[\s\S]*movingLaneCount > 0[\s\S]*inlineRow\.canFit[\s\S]*laneWidth >= Math\.max\(160, inlineRow\.totalCount \* 28\)/);
  assert.match(dropSource, /noteFlowCandidateRect\(placement\.candidate, "inline"\)/);
  assert.match(dropSource, /noteFlowCandidateRect\([\s\S]*horizontalSide \? "inline" : "row"/);
  assert.match(dropSource, /const intent = resolveDragDropHorizontalIntent\([\s\S]*horizontalRoom[\s\S]*\);[\s\S]*const horizontalSide = intent === "inline-right" \? "right"[\s\S]*: keptPreviousInline[\s\S]*\? previousPlacement\.horizontalSide[\s\S]*: null[\s\S]*const leftSnap = intent === "line-start"/);
  assert.match(dropSource, /canonicalNoteFlowGapPlacement\([\s\S]*canonicalRowKey[\s\S]*const peers = \[\][\s\S]*flowOrder = insertionIndex/);
  assert.match(dropSource, /noteFlowBoundary[\s\S]*flowBoundary/);
  assert.match(dropSource, /this\.removeDraggedNoteFlowPlacementVisual\(\);[\s\S]*indicator\.dataset\.noteDrawDropSide = horizontalSide \|\| flowSide[\s\S]*indicator\.dataset\.noteDrawDropLine = String\(flowLine\)/);
  assert.doesNotMatch(dropSource, /flowTarget\.classList\.add\(`notedraw-text-sort-target-/);
  assert.doesNotMatch(dropSource, /applyElementStyles\(indicator/);
  assert.match(dropSource, /snapDraggedSelectionToNoteFlowPlacement[\s\S]*draggedNoteFlowClientBounds\(\)[\s\S]*const targetClientX = leftSnap[\s\S]*placement\.inlineBoundary[\s\S]*dragNoteFlowPlacementClientDelta/);
  assert.match(dragSource, /const dragUsesNoteFlowPlacement = this\.usesDraggedNoteFlowPlacement\(\)[\s\S]*const dragEvent = dragUsesNoteFlowPlacement \? this\.smoothDraggedClientEvent\(event\) : event[\s\S]*this\.queueDraggedNoteFlowPlacement\(dragEvent\.clientX, dragEvent\.clientY\)[\s\S]*this\.queueDraggedNoteFlowRefresh/);
  assert.match(finishSource, /requestedDropPlacement[\s\S]*this\.resolveDraggedNoteFlowPlacement[\s\S]*this\.snapDraggedSelectionToNoteFlowPlacement[\s\S]*preserveBoxGeometry:[\s\S]*scheduleNoteFlowLayout\(\{ operation: true, defer: true \}\)/);
  assert.doesNotMatch(finishSource, /this\.clearNoteFlowLayout\(\)/);
  assert.doesNotMatch(finishSource.slice(0, finishSource.indexOf("this.snapDraggedSelectionToNoteFlowPlacement")), /this\.clearNoteFlowLayout\(\)/);
  assert.match(finishSource, /placement: droppedNoteFlowIndexes\.has\(index\) \? resolvedDropPlacement : null/);
  assert.match(captureSource, /selectExactNoteFlowPositionAnchor\(candidates, \{ candidate: anchor, side, line \}\)/);
  assert.match(captureSource, /placementVersion:[\s\S]*\? 1/);
  assert.match(captureSource, /const preservedBox = normalizeNoteFlow\(options\.preserveBoxGeometry\)/);
  assert.match(captureSource, /canonicalNoteFlowGapPlacement\(candidates, \{ anchor, side \}\)/);
  assert.match(captureSource, /flowOrder: Number\.isFinite\(Number\(options\.placement\?\.flowOrder\)\)/);
  assert.match(captureSource, /boxWidthRatio: preservedBox\?\.boxWidthRatio > 0[\s\S]*preservedBox\.boxWidthRatio/);
  assert.match(captureSource, /boxHeightRatio: preservedBox\?\.boxHeightRatio > 0[\s\S]*preservedBox\.boxHeightRatio/);
  assert.match(captureSource, /avoidancePath: ""[\s\S]*avoidanceLine: null/);
  assert.match(flowLayoutSource, /const exactPlacement = hasExactNoteFlowPlacement\(currentNoteFlow\)/);
  assert.match(flowLayoutSource, /const selectedAnchor = exactPlacement \? anchor : avoidanceAnchor \|\| anchor/);
  assert.match(flowLayoutSource, /const side = exactPlacement \? currentNoteFlow\.side/);
  assert.match(projectionSource, /const noteFlowProjectedById = new Map\(\)/);
  assert.match(projectionSource, /noteFlowProjectedById\.set\(transitionId, projectedBox\)/);
  assert.match(projectionSource, /projectElementPoints\(stroke\.points, layout, box/);
  assert.match(reservedRowSource, /this\.draggingStroke \|\| this\.resizingSelection/);
  assert.match(reservedRowSource, /noteFlowStoredRowCanvasY\(noteFlow, candidates, strokeTop\)/);
  assert.match(reservedRowSource, /projectStableNoteFlowBox\([\s\S]*boxLeftRatio:[\s\S]*boxWidthRatio:[\s\S]*boxHeightRatio:/);
  assert.match(inlinePackSource, /packNoteFlowInlineRectangles\(group, \{[\s\S]*anchor: anchorBounds,[\s\S]*blockers,[\s\S]*laneLeft:[\s\S]*laneRight:/);
  assert.match(inlinePackSource, /candidateCanvasBounds\(anchor\)/);
  assert.match(inlinePackSource, /candidateCanvasBounds\(candidate\)/);
  assert.match(reservedRowSource, /this\.packInlineNoteFlowItems\(inlineItems, candidates/);
  assert.match(reservedRowSource, /const targetBox = this\.noteFlowOperationPending[\s\S]*x: bounds\.minX,[\s\S]*width: Math\.max\(0\.001, bounds\.maxX - bounds\.minX\)[\s\S]*height: Math\.max\(0\.001, bounds\.maxY - bounds\.minY\)/);
  assert.match(reservedRowSource, /isStableResponsiveCaptureFrame\(canvasWidth, contentFrame\)/);
  assert.match(reservedRowSource, /projectNoteFlowPointsToBox\(stroke\.points, bounds, targetBox/);
  assert.match(reservedRowSource, /linePosition: null[\s\S]*lineOffsetY: 0/);
  assert.match(reservedRowSource, /createElementLayout\([\s\S]*bounds:[\s\S]*targetBox\.x[\s\S]*relations: \[\]/);
  assert.match(frozenRestoreSource, /const effectiveOffset = hasSettledMeasurement \? settledOffset : record\.offset/);
  assert.match(frozenRestoreSource, /alignNoteFlowStrokesToReservedRows\(\)/);
  assert.match(frozenRestoreSource, /alignNoteFlowStrokesToReservedRows\(candidates, \{ measureOnly: true \}\)[\s\S]*const settledExtent = this\.noteFlowSettledRowExtents\.get\(rowKey\) \|\| 0;[\s\S]*ownerNoteFlow\?\.placementMode === "inline"[\s\S]*noteFlowRowReservation\(\{[\s\S]*rowOffset: ownerNoteFlow\?\.rowOffset[\s\S]*boxHeight: settledExtent/);
  assert.match(flowLayoutSource, /const settledRowExtentsChanged = this\.alignNoteFlowStrokesToReservedRows\(candidates, \{ measureOnly: true \}\)/);
  assert.match(flowLayoutSource, /alignNoteFlowStrokesToReservedRows\(\)/);
  assert.match(finishSource, /if \(!affectsNoteFlow\) \{[\s\S]*scheduleDrawingSave/);
  assert.match(finishSource, /else if \(affectsNoteFlow\)[\s\S]*dragStrokeOriginalPoints[\s\S]*originalPoints\.map/);
  assert.doesNotMatch(dropSource.slice(dropSource.indexOf("  resolveDraggedNoteFlowPlacement("), dropSource.indexOf("  snapDraggedSelectionToNoteFlowPlacement(")), /dragDropGeometrySnapshot|selectStoredNoteFlowAnchorCandidate/);
  assert.doesNotMatch(dropSource, /vault\.modify|reorderTextBlock/);
  assert.match(styles, /\.notedraw-note-flow-drop-indicator \{[\s\S]*position: fixed;[\s\S]*pointer-events: none;/);
  assert.match(styles, /\.notedraw-body-control\.notedraw-note-flow-drop-indicator\.is-notedraw-controls-visible\.is-visible/);
  assert.match(styles, /\.notedraw-note-flow-drop-indicator\[data-note-draw-drop-magnet="left"\]::before/);
});

test("reading double-click stays in preview and source view exposes the Markdown edit tool", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /this\.editMarkdownButton = this\.surfaceType === "source"/);
  assert.match(source, /setIcon\(this\.editMarkdownButton, "file-pen-line"\)/);
  assert.match(source, /this\.editMarkdownButton\?\.classList\.toggle\("is-active", this\.toolMode === TOOL_EDIT_MD\)/);
  assert.match(source, /this\.previewEl\.addEventListener\("dblclick", this\.onPreviewDoubleClick, true\)/);
  assert.match(source, /onPreviewDoubleClick\(event\)[\s\S]*this\.surfaceType !== "preview"[\s\S]*this\.onCanvasDoubleClick\(event\)[\s\S]*stopImmediatePropagation/);
  assert.match(source, /this\.previewEl\?\.removeEventListener\("dblclick", this\.onPreviewDoubleClick, true\)/);
});

test("source Markdown editing exposes formatting for CodeMirror and embedded Markdown", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /this\.surfaceType === "source" \|\| this\.allowTextEdit && this\.surfaceType !== "webview"/);
  assert.match(source, /bindSourceFormatToolbarEvents\(\)/);
  assert.match(source, /sourceSelectionRange\(\)/);
  assert.match(source, /cmView\.state\.sliceDoc\(range\.from, range\.to\)/);
  assert.match(source, /cmView\.dispatch\(\{[\s\S]*changes,[\s\S]*selection: nextSelection/);
  assert.match(source, /applySourceTextInlineFormat\(tagName, styles\)/);
  assert.match(source, /applySourceTextBlockFormat\(kind\)/);
  assert.match(source, /insertSourceTextBreak\(\)/);
  assert.match(source, /clearSourceTextFormat\(\)/);
  assert.match(source, /const sourceMarkdownEditActive = this\.surfaceType === "source" && this\.toolMode === TOOL_EDIT_MD;[\s\S]*this\.formatToolbar\?\.classList\.toggle\("is-visible", sourceMarkdownEditActive\)/);
  assert.match(source, /this\.currentEditorEmbedded = this\.embeddedSurface \|\| isEmbeddedEditableElement\(element\) \|\| normalizeVaultPath\(this\.currentEditorFile\?\.path\) !== normalizeVaultPath\(this\.file\?\.path\)/);
  assert.match(source, /serializeControllerEditableSource\(element, this\.currentEditorEmbedded\)/);
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

test("NoteFlow resize updates stable geometry and remeasures row reservations before layout", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const resizeStart = source.indexOf("  startSelectedStrokeResize(event, handle) {");
  const resizeSource = source.slice(resizeStart, source.indexOf("  finishSelectedStrokeResize", resizeStart));
  const finishStart = source.indexOf("  finishSelectedStrokeResize(event) {");
  const finishSource = source.slice(finishStart, source.indexOf("  cancelSelectedStrokeResize", finishStart));
  const cancelStart = source.indexOf("  cancelSelectedStrokeResize(restoreOriginal = false) {");
  const cancelSource = source.slice(cancelStart, source.indexOf("  clearSelectedStrokeResizeState", cancelStart));
  const alignStart = source.indexOf("  alignNoteFlowStrokesToReservedRows(");
  const alignSource = source.slice(alignStart, source.indexOf("  frozenNoteFlowAnchorsReady", alignStart));
  const flowStart = source.indexOf("  applyNoteFlowLayout() {");
  const flowSource = source.slice(flowStart, source.indexOf("  markNoteFlowLayoutMutation", flowStart));

  assert.match(resizeSource, /bounds: getStrokeBounds[\s\S]*noteFlow: this\.drawingData\.strokes\[index\]\.noteFlow/);
  assert.match(resizeSource, /resizeNoteFlowGeometry\([\s\S]*originalBounds:[\s\S]*resizedBounds:[\s\S]*contentWidth:/);
  assert.match(finishSource, /alignNoteFlowStrokesToReservedRows\(null, \{ measureOnly: true \}\);\s*this\.scheduleNoteFlowLayout\(\{ operation: true \}\)/);
  assert.match(cancelSource, /stroke\.noteFlow = original\.noteFlow \? \{ \.\.\.original\.noteFlow \} : null/);
  assert.match(alignSource, /const measureOnly = options\.measureOnly === true[\s\S]*if \(measureOnly\) \{\s*return extentsChanged;/);
  assert.match(flowSource, /alignNoteFlowStrokesToReservedRows\(candidates, \{ measureOnly: true \}\)[\s\S]*boxHeight: settledHeight/);
  assert.match(flowSource, /const canLayoutDuringResize = this\.resizingSelection[\s\S]*hasStableNoteFlowAnchor\(noteFlow\)[\s\S]*Number\.isFinite\(Number\(noteFlow\?\.line\)\)/);
  assert.match(flowSource, /noteFlowMarkdownAnnotationComplete && !canLayoutDuringResize/);
});
