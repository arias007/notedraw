import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
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

test("3.4.9 preserves reading content and cross-view frames without hidden-surface layout writes", async () => {
  const [source, manifestText] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(manifestUrl, "utf8")
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.version, "3.4.9");
  assert.match(source, /version: "3\.4\.9"/);
  assert.match(source, /if \(!this\.responsivePointsInitialized \|\| signature !== this\.responsiveLayoutSignature\)/);
  assert.match(source, /captureElementLayoutForStroke/);
  assert.match(source, /projectElementPoints\(stroke\.points, layout, box/);
  assert.match(source, /stabilizeElementRelations\(projected, layoutsById\)/);
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
  assert.match(source, /const eager = !enabled \|\| candidate === controller \|\| isElementVisibleEnough\(candidate\.previewEl\);\s*candidate\.applyActiveState\(enabled, \{ eager \}\)/);
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
  assert.match(source, /this\.restoreFrozenNoteFlowLayout\(\);\s*this\.resizeCanvas\(\{ layout: false, measure: true \}\);\s*this\.render\(\)/);
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
  assert.match(source, /installTextSortHandle\(element\)/);
  assert.match(source, /async reorderTextBlock\(file, movingElement, targetElement, placeAfter = false, sourceState = \{\}\)/);
  assert.match(source, /element\.dataset\.noteDrawSortDragging === "true"/);
  assert.match(source, /const target = dropTarget \|\| findEditableTarget\(event\.target, this\.previewEl\)/);
  assert.match(source, /const flushed = await this\.plugin\.flushTextSaveAndWait\(element\)/);
  assert.match(source, /this\.endTextEdit\(\{ save: false \}\);\s*this\.plugin\.discardTextSaveState\(element\)/);
  assert.match(source, /normalizeEditableSourceText\(state\.baselineText\) === normalizeEditableSourceText\(state\.latestText\)/);
  assert.match(source, /this\.currentEditor\.replaceChildren\(textNode\)/);
  assert.match(source, /hoistPlainTextMarker\(marker, this\.currentEditor, isClearableInlineFormattingElement\)/);
  assert.match(source, /createAsyncCommitBarrier/);
  assert.match(source, /commitWebviewTextEdit\(element, original, edited\)[\s\S]*recordDrawingHistory\(historyBefore\)/);
  assert.match(source, /button\.addEventListener\("contextmenu", state\.contextMenuHandler\)/);
  assert.match(source, /onButtonContextMenu\(event\)[\s\S]*this\.toggleDrawingsVisible\(\)/);
  assert.match(source, /if \(!this\.drawingsVisible\) \{\s*this\.setDrawingsVisible\(true\)/);
  assert.match(styles, /\.notedraw-text-sort-handle \{/);
  assert.match(styles, /\.notedraw-text-sort-target-before \{/);
  assert.match(styles, /\.notedraw-text-sort-target-after \{/);
});

test("reading and source controllers share the latest in-memory drawing state", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const cached = this\.drawingStateCache\.get\(path\);\s*if \(cached\) \{\s*return normalizeDrawingData\(cached, file\)/);
  assert.match(source, /const canonical = normalizeDrawingDataForStorage\(data, file\);\s*this\.drawingStateCache\.set\(path, canonical\);\s*this\.pendingDrawingSaves\.set\(path, file\);\s*this\.refreshControllersForFile\(file, canonical, \{ excludeData: options\.excludeData \|\| data \}\)/);
  assert.match(source, /writeDrawings\(file, compacted, \{ refresh: false, updateCache: false \}\)/);
  assert.match(source, /this\.plugin\.setControllerActivation\(this, nextActive\)/);
  assert.match(source, /controller\.scheduleLayoutRefresh\(\{ settle: false \}\);\s*controller\.requestRender\(true\)/);
  assert.match(source, /this\.textPanel = createNoteDrawControlElement\(this\.floatingControlsHost, "notedraw-text-panel"\)/);
  assert.doesNotMatch(source, /if \(this\.surfaceType !== "source"\) \{\s*this\.textButton/);
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
  assert.match(syncSource, /if \(!isRootPreviewReady\(view, preview\)\) \{\s*previewController\?\.destroy\(\);\s*resetDormantRootPreview\(view, preview\);\s*continue;/);
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
  assert.match(source, /destroy\(\)[\s\S]*this\.endTextEdit\(\);\s*this\.endFloatingTextInput\(true\);\s*this\.clearDraggedNoteFlowPlacement\(\);\s*this\.destroyed = true/);
  assert.match(source, /if \(!this\.active && wasActive\)[\s\S]*this\.endFloatingTextInput\(true\)/);
  assert.match(source, /setEditMarkdownMode\(\)[\s\S]*this\.endFloatingTextInput\(true\)/);
  assert.match(source, /openFloatingTextInput\(point, index = -1\) \{\s*this\.endFloatingTextInput\(true\)/);
  assert.match(source, /if \(state\.composing\) \{\s*state\.composing = false;\s*state\.commitAfterComposition = false/);
});

test("runtime layout uses a capped desktop Markdown lane and mobile-aware vertical flow", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /constrainWideContentFrame\(\{\s*surfaceWidth,[\s\S]*contentWidth: contentRect\.width[\s\S]*\}, \{ isMobile: isMobileRuntime\(\) \}\)/);
  assert.match(source, /preferDocumentFlow: isMobileRuntime\(\)/);
  assert.match(source, /estimateStableElementLayoutExtent/);
  assert.match(source, /relativeRight/);
  assert.match(source, /relativeBottom/);
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
  assert.match(source, /if \(!this\.didMove \|\| movedDistance <= this\.tapDistancePx\(\)[\s\S]*this\.isNoteFlowPenActive\(\)[\s\S]*this\.clearSelectedStrokes\(\)[\s\S]*this\.setSelectedStrokes\(this\.findStrokeAt\(point\)\)/);
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
  assert.match(pointerSource, /const noteFlowPenActive = this\.isNoteFlowPenActive\(\)[\s\S]*this\.clearSelectedStrokes\(\)[\s\S]*const hitStrokeIndex = noteFlowPenActive \? -1 : this\.findStrokeAt\(point\)[\s\S]*const resizeHandle = noteFlowPenActive \? null/);
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
  assert.match(dropSource, /this\.toolMode === TOOL_SELECT[\s\S]*queueDraggedNoteFlowPlacement\(clientY\)[\s\S]*window\.requestAnimationFrame/);
  assert.match(dropSource, /notedraw-text-sort-target-after[\s\S]*notedraw-text-sort-target-before/);
  assert.match(dropSource, /noteDrawDropSide[\s\S]*noteDrawDropLine/);
  assert.match(dragSource, /this\.usesDraggedNoteFlowPlacement\(\)[\s\S]*this\.queueDraggedNoteFlowPlacement\(event\.clientY\)[\s\S]*this\.queueDraggedNoteFlowRefresh/);
  assert.match(finishSource, /requestedDropPlacement[\s\S]*this\.clearNoteFlowLayout\(\)[\s\S]*this\.resolveDraggedNoteFlowPlacement[\s\S]*this\.snapDraggedSelectionToNoteFlowPlacement/);
  assert.match(finishSource, /placement: droppedNoteFlowIndexes\.has\(index\) \? resolvedDropPlacement : null/);
  assert.doesNotMatch(dropSource, /vault\.modify|reorderTextBlock/);
  assert.match(styles, /\.notedraw-note-flow-drop-indicator \{[\s\S]*position: fixed;[\s\S]*pointer-events: none;/);
  assert.match(styles, /\.notedraw-body-control\.notedraw-note-flow-drop-indicator\.is-notedraw-controls-visible\.is-visible/);
});
