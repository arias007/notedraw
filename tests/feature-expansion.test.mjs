import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("embedded Markdown edits stage changes until editing ends", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /stageTextSave\(file, originalText, editedText, element, controller = null\)/);
  assert.match(source, /if \(this\.currentEditorEmbedded\) \{\s*this\.plugin\.stageTextSave\(this\.currentEditorFile, original, edited, element, this\)/);
  assert.match(source, /endTextEdit\(options = \{\}\)[\s\S]*queueTextSaveAndWait\(this\.currentEditorFile \|\| this\.file, original, edited, element\)/);
  assert.match(source, /this\.textCommitBarrier\.wait\(\)/);
});

test("default brushes remain separate from opt-in fountain and watercolor variants", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /this\.brushVariants = \{\s*\[BRUSH_PEN\]: this\.runtimeSettings\.lastPenVariant,\s*\[BRUSH_WATERCOLOR\]: this\.runtimeSettings\.lastWatercolorVariant/);
  assert.match(source, /variant: this\.currentBrushVariant\(\)/);
  assert.match(source, /\[PEN_VARIANT_FOUNTAIN, PEN_VARIANT_NOTE\]\.includes\(normalizeBrushVariant\(BRUSH_PEN, stroke\.variant\)\)/);
  assert.match(source, /straightenWatercolorPoints\(stroke\.points/);
  assert.match(source, /snapWatercolorStrokeToTextLine\(stroke\)/);
  assert.match(source, /pickTextHighlightLine\(this\.textHighlightLineRects, \[clientPoint\]\)/);
  assert.match(source, /this\.textHighlightTarget \? this\.alignTextHighlightPoint/);
  assert.doesNotMatch(source, /stroke\.width = clamp\(lineRect\.height/);
  assert.match(source, /event\.composedPath\(\)/);
  const brushPanelStart = source.indexOf("  createBrushPanel() {");
  const brushPanelSource = source.slice(brushPanelStart, source.indexOf("syncBrushPanelButtons()", brushPanelStart));
  assert.doesNotMatch(brushPanelSource, /button\.createSpan/);
  assert.match(styles, /\.notedraw-brush-option \{[\s\S]*width: 34px;[\s\S]*justify-content: center;[\s\S]*touch-action: manipulation/);
});

test("scrolling refreshes only the canvas window while real layout changes can reproject", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const scrollSource = source.slice(source.indexOf("  onScroll() {"), source.indexOf("  isReadingProjectionSettleSurface()"));

  assert.match(source, /onScroll\(\) \{\s*this\.lastScrollAt = Date\.now\(\);[\s\S]*this\.scheduleResize\(\{ layout: false, measure: false \}\)/);
  assert.match(source, /this\.scrollSettleTimer = window\.setTimeout\([\s\S]*this\.scheduleResize\(\{ layout: false, measure: false \}\)/);
  assert.match(source, /if \(layout\) \{\s*this\.render\(\);\s*\} else \{\s*this\.renderCanvas\(\);/);
  assert.match(source, /const atScrollEnd = scrollHeight > clientHeight && scrollTop \+ clientHeight >= scrollHeight - 3/);
  assert.doesNotMatch(scrollSource, /scheduleMarkdownAnnotationRefresh/);
  assert.match(source, /resizeCanvas\(options = \{\}\)[\s\S]*const refreshGeometry = options\.measure !== false/);
  assert.match(source, /if \(this\.drawingsLoaded && refreshLayout\) \{\s*const frame = this\.getResponsiveContentFrame\(\)/);
  assert.match(source, /const readingScrollActive = this\.isReadingProjectionSettleSurface\(\)[\s\S]*sinceScroll < 260/);
  assert.match(source, /if \(readingScrollActive && this\.resizeNeedsLayout\) \{\s*this\.resizeNeedsLayout = false/);
  assert.match(source, /scheduleResponsiveProjectionSettle\(delay = 180[\s\S]*this\.scheduleResize\(\{ layout: true, preserveNoteFlowAbsolute \}\)/);
  assert.match(source, /settleProjectedElementTransition\([\s\S]*this\.responsiveProjectionPending[\s\S]*this\.preserveAbsoluteStrokePlacement\(previousCanvasWidth, previousCanvasHeight\)/);
  assert.match(source, /else if \(this\.responsiveProjectionPending\) \{\s*this\.preserveAbsoluteStrokePlacement\(previousCanvasWidth, previousCanvasHeight\);\s*this\.responsiveProjectionPending = null/);
});

test("reading zoom preserves wrapping while edit zoom can reflow", async () => {
  const [source, styles, coordinates] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(new URL("../src/layout-coordinates.mjs", import.meta.url), "utf8")
  ]);

  assert.match(source, /readingViewZoom: true/);
  assert.match(source, /sourceViewLayoutZoom: true/);
  assert.match(source, /var MAX_READING_ZOOM = 100;/);
  assert.match(source, /setZoom: \(zoom, options = \{\}\) => this\.setApiZoom\(zoom, options\)/);
  assert.match(source, /if \(\(event\.ctrlKey \|\| event\.metaKey\) && this\.canZoomReadingSurface\(\)\)/);
  assert.match(source, /nextZoom = this\.readingZoom \* distance \/ previousDistance/);
  assert.match(source, /calculatePinchPanScroll\(\{[\s\S]*previousCenter,[\s\S]*nextCenter,[\s\S]*zoomRatio: ratio/);
  assert.match(source, /originX: origin\.x,[\s\S]*originY: origin\.y/);
  assert.match(source, /handleMultiTouchScroll\(event\)[\s\S]*window\.requestAnimationFrame/);
  assert.match(source, /return \["preview", "source"\]\.includes\(this\.surfaceType\) && !this\.embeddedSurface/);
  assert.match(source, /usesVisualReadingZoom\(\)/);
  assert.match(source, /readingZoomElements\(target = this\.readingZoomTarget\)/);
  assert.match(source, /element\.style\.setProperty\("transform", `scale\(\$\{zoom\}\)/);
  assert.match(source, /element\.style\.setProperty\("transform-origin", `\$\{-origin\.x\}px \$\{-origin\.y\}px`\)/);
  assert.match(source, /element\.style\.setProperty\("zoom", String\(zoom\)\)/);
  assert.match(source, /updateReadingZoomExtent\(zoom, target\)/);
  assert.match(source, /calculateVisualZoomLogicalWindow\(\{/);
  assert.match(source, /scheduleReadingVirtualSectionSync\(\)/);
  assert.match(source, /syncReadingVirtualSections\(\)/);
  assert.match(source, /captureReadingZoomBaseOrigin\(target\)[\s\S]*this\.readingZoomBaseOrigin = this\.measureReadingZoomOrigin\(target\)/);
  assert.match(source, /scheduleReadingVirtualSectionSync\(\)[\s\S]*if \(this\.isReadingZoomInteractionActive\(\)\) \{\s*return;/);
  const zoomSettle = source.slice(source.indexOf("  scheduleReadingZoomSettle("), source.indexOf("  cancelReadingZoomSettle("));
  assert.match(zoomSettle, /this\.scheduleReadingVirtualSectionSync\(\)/);
  assert.match(zoomSettle, /this\.scheduleResize\(\{ layout: false, measure: false \}\)/);
  assert.doesNotMatch(zoomSettle, /scheduleMarkdownAnnotationRefresh|scheduleNoteFlowLayout/);
  assert.match(source, /const hasRenderedAnchors = sectionElements\.some[\s\S]*this\.noteFlowOperationPending && this\.hasNoteFlowElements\(\) && !hasRenderedAnchors[\s\S]*this\.scheduleMarkdownAnnotationRefresh\(\{ layout: false \}\)/);
  assert.match(source, /scheduleMarkdownAnnotationRefresh\(options = \{\}\)[\s\S]*\.finally\(\(\) => \{[\s\S]*this\.hasNoteFlowElements\(\)[\s\S]*this\.scheduleNoteFlowLayout\(\)/);
  assert.match(source, /renderer\.measureSection\?\.\(sections\[index\]\)/);
  assert.match(source, /ensureReadingZoomStage\(target = findResponsiveContentElement/);
  assert.match(source, /readingZoomElements\(target = this\.readingZoomTarget\)[\s\S]*ensureReadingZoomStage\(target\)/);
  assert.doesNotMatch(source, /if \(canvasWindow\.changed && visualScale !== 1 && this\.usesVisualReadingZoom\(\)\)/);
  assert.match(source, /const visualReadingZoom = this\.usesVisualReadingZoom\(\);\s*this\.scheduleResize\(\{ layout: !visualReadingZoom, measure: !visualReadingZoom \}\)/);
  assert.match(source, /onReadingVirtualScrollCapture\(\)[\s\S]*renderer\.lastScroll = Number\(this\.previewEl\.scrollTop\) \|\| 0/);
  assert.match(source, /captureReadingLogicalSizerHeight\(renderer = this\.readingPreviewRenderer\(\), options = \{\}\)/);
  assert.match(source, /const documentHeight = Math\.max\(1, cursor - topSpace, this\.captureReadingLogicalSizerHeight\(renderer\)\)/);
  assert.match(source, /responsiveViewportScale\(\) \{\s*return this\.usesVisualReadingZoom\(\) \? 1 : this\.readingZoomScale\(\);/);
  assert.match(source, /if \(!this\.usesVisualReadingZoom\(\)\) \{\s*this\.responsiveLayoutContext = null;/);
  assert.match(source, /measureCanvasExtent\(this\.previewEl, this\.layoutMeasureEl, visualScale\)/);
  assert.match(source, /measureVisibleSurfaceWindow\(this\.previewEl, this\.scrollContainer, height, visualScale\)/);
  assert.match(source, /const mapped = mapClientPointToCanvas\(event, pointerGeometry\)/);
  assert.match(coordinates, /const xScale = rectWidth > 0 \? canvasWidth \/ rectWidth : 1/);
  assert.match(coordinates, /const yScale = rectHeight > 0 \? canvasRenderHeight \/ rectHeight : 1/);
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
  assert.match(source, /const right = compactViewport \? "auto"/);
  assert.match(styles, /\.notedraw-toolbar \{[\s\S]*width: max-content;[\s\S]*min-width: 0;/);
});

test("palette changes update the selected NoteDraw elements", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /setCurrentBrushColor\(color\)[\s\S]*this\.applyColorToSelectedStrokes\(color\)/);
  assert.match(source, /applyColorToSelectedStrokes\(color\)[\s\S]*this\.drawingData\.strokes\[index\]\.color = color/);
  assert.match(source, /recordDrawingHistory\(historyBefore\)/);
  assert.match(source, /const selectedElements = this\.hasHybridSelection\(\)/);
  assert.match(source, /const paletteDisabled = this\.toolMode === TOOL_EDIT_MD \|\| this\.toolMode === TOOL_SELECT && !selectedElements/);
  assert.match(source, /this\.paletteButton\?\.classList\.toggle\("is-selection-available", this\.toolMode === TOOL_SELECT && selectedElements\)/);
  assert.match(source, /setSelectedStrokes\(indexes\)[\s\S]*this\.updateToolButtons\(\)/);
});

test("structured element clipboard supports long-press actions, commands, and cross-note anchor rebuilding", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /this\.elementClipboard = null/);
  assert.match(source, /id: "copy-selected-elements"/);
  assert.match(source, /id: "paste-elements"/);
  assert.match(source, /copySelectedElements\(options = \{\}\)/);
  assert.match(source, /selectedElementLinkPayload\(\)[\s\S]*notedraw:\/\/element/);
  assert.match(source, /void writeTextToClipboard\(link\.markdown\)/);
  assert.match(source, /pasteCopiedElements\(options = \{\}\)/);
  assert.match(source, /stroke\.layout = null/);
  assert.match(source, /idMap\.get\(stroke\.connector\.fromId\)/);
  assert.match(source, /this\.captureResponsiveAnchorsForIndexes\(indexes\.filter/);
  assert.match(source, /selectionFramePaddingPx\(\) \{[\s\S]*getSelectedStrokeMaxWidth\(\) \/ 2 \+ 2/);
  assert.match(source, /const hitPadding = this\.selectionHitPaddingPx\(\)/);
  assert.doesNotMatch(source, /getSelectedStrokeMaxWidth\(\) \+ 4/);
  assert.match(source, /\{ icon: "copy", key: "copyElement"/);
  assert.match(source, /\{ icon: "clipboard-paste", key: "pasteElement"/);
});

test("the long-press menu filters overlapping selections without changing element data", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const filterSource = source.slice(source.indexOf("  selectionFilterContext()"), source.indexOf("  selectedMindMapSource()"));

  assert.match(source, /\{ icon: "list-filter", key: "selectFloatingOnly", action: \(\) => this\.cycleSelectionFilter\(\) \}/);
  assert.match(source, /selectFloatingOnly: "只选悬浮元素"/);
  assert.match(source, /selectMarkdownOnly: "只选 MD 和插入元素"/);
  assert.match(source, /selectAllElements: "选择全部重叠元素"/);
  assert.match(source, /filterButton\.toggleAttribute\("hidden", !filterContext\.snapshot\.hasMixedSelection\)/);
  assert.doesNotMatch(source, /dockMarkdownBlock|放回笔记流|放回筆記流/);
  assert.match(filterSource, /selectionMatchesFilterMode\([\s\S]*createSelectionFilterSnapshot/);
  assert.match(filterSource, /nextSelectionFilterMode\(context\.mode\)[\s\S]*selectionForFilterMode\(context\.snapshot, mode\)/);
  assert.match(filterSource, /this\.selectedStrokeIndexes = new Set\(selection\.strokeIndexes\)/);
  assert.match(filterSource, /this\.selectedMarkdownBlockIds = new Set\(selection\.markdownBlockIds\.filter/);
  assert.doesNotMatch(filterSource, /scheduleDrawingSave|recordDrawingHistory|expandSelectedGroups|hideSelectionMenu/);
});

test("element links are portable, multi-select aware, and routed through the active NoteDraw surface", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /copy-selected-element-link/);
  assert.match(source, /notedraw:\/\/element\?\$\{params\.toString\(\)\}/);
  assert.match(source, /new URL\(raw\)/);
  assert.match(source, /url\.hostname\.toLowerCase\(\) !== "element"/);
  assert.match(source, /getAll\("id"\)/);
  assert.match(source, /getAll\("ids"\)\.flatMap\(\(value\) => value\.split\(","\)\)/);
  assert.match(source, /selectElementsById\(ids = \[\]\)/);
  assert.match(source, /this\.setSelectedStrokes\(indexes, \{ preserveMarkdown: true \}\)/);
  assert.match(source, /this\.selectedMarkdownBlockIds = markdownIds/);
  assert.match(source, /activeDocument\.addEventListener\("click", this\.onElementLinkClick, true\)/);
  assert.match(source, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(source, /await leaf\.openFile\(file\)/);
  assert.match(source, /state: \{ file: file\.path, mode: "preview", source: false \}/);
  assert.match(source, /controller\.selectElementsById\(target\.ids\)/);
  assert.doesNotMatch(source, /\{ icon: "link-2", key: "copyElementLink"/);
  assert.match(source, /copyElement: "复制元素\/链接"/);
});

test("selection frames freeze between operations and drag drops retain the last valid Markdown target", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const frameSource = source.slice(source.indexOf("  selectionStateKey()"), source.indexOf("  markdownElementCanvasBounds(", source.indexOf("  selectionStateKey()")));
  const dragSource = source.slice(source.indexOf("  updateMarkdownBlockDropTarget("), source.indexOf("  markdownDropRowMetrics(", source.indexOf("  updateMarkdownBlockDropTarget(")));
  const finishSource = source.slice(source.indexOf("  finishSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag(", source.indexOf("  finishSelectedStrokeDrag(")));
  const heightSource = source.slice(source.indexOf("  captureReadingLogicalSizerHeight("), source.indexOf("  readingVirtualZoomOrigin(", source.indexOf("  captureReadingLogicalSizerHeight(")));

  assert.match(frameSource, /this\.selectionFrameSnapshot = null/);
  assert.match(frameSource, /if \(!force && this\.selectionFrameSnapshot\?\.key === key\)/);
  assert.match(frameSource, /this\.selectionFrameSnapshot = \{ key, rect \}/);
  assert.match(source, /if \(this\.draggingStroke \|\| this\.resizingSelection\)[\s\S]*const bounds = this\.getSelectedStrokeBounds\(\)[\s\S]*return this\.captureSelectionFrameSnapshot\(\) \|\| null/);
  assert.match(source, /this\.dragMarkdownLastValidDrop = drop/);
  assert.match(dragSource, /if \(!target\) \{\s*return this\.dragMarkdownLastValidDrop \? \{ \.\.\.this\.dragMarkdownLastValidDrop \} : null;/);
  assert.match(finishSource, /const lastDrop = this\.dragMarkdownLastValidDrop\?\.element\?\.isConnected/);
  assert.match(finishSource, /const markdownDrop = lastDrop \? \{/);
  assert.match(finishSource, /this\.clearSelectedStrokeDragState\(\);[\s\S]*if \(didMove\) \{[\s\S]*this\.invalidateSelectionFrameSnapshot\(\);[\s\S]*this\.captureSelectionFrameSnapshot\(\{ force: true \}\);/);
  assert.match(heightSource, /const transientGrowth = observedHeight > runawayThreshold/);
  assert.match(heightSource, /const staleGrowth = priorHeight > runawayThreshold/);
  assert.match(heightSource, /sectionHeight \+ Math\.max\(192, Math\.min\(640, sectionHeight \* 0\.35\)\)/);
});

test("reading-only note pen and selected elements can reserve Markdown flow space without editing Markdown", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /var PEN_VARIANT_NOTE = "note-flow"/);
  assert.match(source, /variant: PEN_VARIANT_NOTE, labelKey: "notePen"/);
  assert.match(source, /return this\.surfaceType === "preview" && !this\.embeddedSurface/);
  assert.match(source, /toggleSelectedFlowMode\(\)/);
  assert.match(source, /selectedFlowModeElements\(\)/);
  assert.match(source, /convertToFloating[\s\S]*convertToNoteFlow[\s\S]*toggleFlowMode/);
  const selectionMenuSource = source.slice(source.indexOf("  createSelectionMenu()"), source.indexOf("  selectionFilterContext()", source.indexOf("  createSelectionMenu()")));
  assert.doesNotMatch(selectionMenuSource, /floatMarkdownBlock|toggleSelectedMarkdownFloating|toggleSelectedNoteFlow/);
  assert.match(source, /const placementMode = value\.placementMode === "inline" \? "inline" : "row"/);
  assert.match(source, /belowMarkdown: Boolean\(noteFlow\)/);
  assert.match(source, /captureNoteFlowAnchor\(stroke\)/);
  assert.match(source, /captureNoteFlowResponsiveAnchors\(stroke, context/);
  assert.match(source, /selectNoteFlowPositionAnchor\(candidates, \{[\s\S]*strokeTop,[\s\S]*maxOrderExclusive:/);
  assert.match(source, /captureNoteFlowAnchor\(stroke, \{ preservePlacement: true \}\)/);
  assert.match(source, /noteFlowCanvasRect\(\)/);
  assert.match(source, /candidatesReady \? "document" : previous\?\.positionBasis \|\| null/);
  assert.match(source, /lineOffsetY: useLineAnchor \? canvasY - anchorY : useDocumentAnchor \? canvasY : 0/);
  assert.match(source, /projectNoteFlowDocumentPoint\(point, projectedPoint/);
  assert.match(source, /positionVersion: 1/);
  assert.match(source, /stabilizeNoteFlowPointProjection\(previousPoints, projectedPoints/);
  assert.match(source, /applyNoteFlowLayout\(\)/);
  assert.match(source, /selectNoteFlowInsertionPlacement\(candidates, \{ strokeTop, strokeBottom \}\)/);
  const flowLayout = source.slice(source.indexOf("  applyNoteFlowLayout()"), source.indexOf("  scheduleNoteFlowLayout(options"));
  assert.match(flowLayout, /const appliedValue = Math\.ceil\(state\.base \+ offset\)/);
  assert.match(flowLayout, /const nextValue = `\$\{appliedValue\}px`/);
  assert.match(flowLayout, /const property = side === "after" \? "padding-bottom" : "padding-top"/);
  assert.match(flowLayout, /anchor\.top < strokeTop - 4/);
  assert.match(flowLayout, /const settledHeight = Math\.max\(stableHeight, this\.noteFlowSettledRowExtents\.get\(settledRowKey\) \|\| 0\)/);
  assert.match(flowLayout, /noteFlowRowReservation\(\{[\s\S]*rowOffset: currentNoteFlow\.rowOffset[\s\S]*boxHeight: settledHeight/);
  assert.match(flowLayout, /state\.applied = Math\.max\(0, appliedValue - state\.base\)/);
  assert.match(flowLayout, /stabilizeNoteFlowBounds\(\{/);
  assert.match(flowLayout, /preferCurrent: Boolean\(normalizeNoteFlow\(stroke\.noteFlow\)\?\.positionBasis\)/);
  assert.match(flowLayout, /this\.repairRunawayNoteFlowSurface\(runawayReferenceHeight\)/);
  assert.match(flowLayout, /const editingNoteFlow = this\.active && \(/);
  assert.match(flowLayout, /if \(!editingNoteFlow \|\| this\.isReadingZoomInteractionActive\(\)\) \{\s*return false;/);
  assert.match(flowLayout, /const hasStoredAnchor = hasStableNoteFlowAnchor\(currentNoteFlow\)/);
  assert.match(flowLayout, /const strokeNearViewport = strokeTop >= previewRect\.top - 64 && strokeTop <= previewRect\.bottom \+ 64/);
  assert.match(flowLayout, /const staleStoredAnchor = canRepairStoredAnchors[\s\S]*&& strokeNearViewport;[\s\S]*if \(!anchor && !exactPlacement && \(!hasStoredAnchor \|\| staleStoredAnchor\)\)/);
  assert.match(flowLayout, /const canRepairStoredAnchors = this\.noteFlowAnchorRepairReady[\s\S]*Date\.now\(\) - this\.lastScrollAt > 480/);
  assert.match(flowLayout, /this\.noteFlowAvoidanceAnchors\.get\(avoidanceKey\)/);
  assert.match(flowLayout, /noteFlowAvoidanceReference\(currentNoteFlow, this\.file\?\.path\)/);
  assert.doesNotMatch(flowLayout, /Number\.isFinite\(Number\(currentNoteFlow\?\.avoidanceLine\)\)/);
  assert.match(flowLayout, /selectNoteFlowAvoidanceCandidate\(candidates, \{ strokeTop, strokeBottom \}\)/);
  assert.match(flowLayout, /selectNoteFlowAvoidanceCandidate\(\[avoidanceAnchor\], \{ strokeTop, strokeBottom \}\)/);
  assert.match(flowLayout, /avoidancePath: avoidanceReference\.path,[\s\S]*avoidanceLine: avoidanceReference\.line/);
  assert.match(flowLayout, /if \(avoidanceReference && !avoidanceAnchor\) \{[\s\S]*missingStableAnchor = true;[\s\S]*continue;/);
  assert.match(flowLayout, /this\.plugin\.scheduleDrawingSave\(this\.file, this\.drawingData, \{ userOperation: this\.noteFlowPersistencePending \}\)/);
  assert.match(flowLayout, /if \(canRepairStoredAnchors\) \{\s*this\.noteFlowAnchorRepairComplete = true/);
  assert.match(source, /noteFlowInlineLineCandidates\(sourceElement, path, start, end\)/);
  assert.match(source, /const layoutElement = this\.noteFlowLayoutElement\(sourceElement\);[\s\S]*element: layoutElement,[\s\S]*sourceElement/);
  assert.match(source, /noteFlowVisualLineCandidates\(sourceElement, path, start, end\)[\s\S]*const layoutElement = this\.noteFlowLayoutElement\(sourceElement\)/);
  assert.match(source, /cls: "notedraw-note-flow-line-spacer"/);
  assert.match(source, /NOTEDRAW_OWNED_MUTATION_SELECTOR = \[[\s\S]*"\.notedraw-note-flow-line-spacer"/);
  assert.match(flowLayout, /const selectedAnchor = exactPlacement \? anchor : avoidanceAnchor \|\| anchor;[\s\S]*const element = this\.noteFlowTargetElement\(selectedAnchor, side, currentNoteFlow\?\.placementMode \|\| "row"\)/);
  assert.match(source, /for \(const spacer of this\.noteFlowLineSpacers\?\.values\?\.\(\) \|\| \[\]\)/);
  assert.match(source, /scheduleNoteFlowAnchorRepair\(\)[\s\S]*this\.noteFlowAnchorRepairReady = true[\s\S]*this\.scheduleNoteFlowLayout\(\)[\s\S]*}, 700\)/);
  assert.match(source, /window\.clearTimeout\(this\.noteFlowAnchorRepairTimer\)/);
  assert.match(source, /selectStoredNoteFlowAnchorCandidate\(candidates, \{[\s\S]*strokeTop/);
  assert.match(source, /return line === 0/);
  assert.match(source, /avoidancePath: Number\.isFinite\(avoidanceLine\)/);
  assert.match(source, /avoidanceLine: Number\.isFinite\(avoidanceLine\)/);
  assert.match(source, /\["padding-top", "padding-bottom", "margin-top", "margin-bottom"\]/);
  assert.doesNotMatch(flowLayout, /this\.clearNoteFlowLayout\(\);\s*const flows/);
  assert.doesNotMatch(flowLayout, /querySelectorAll\?\.\("\[data-note-draw-line-start\]"\)[\s\S]*\[0\]/);
  assert.doesNotMatch(flowLayout, /item\.stroke\.noteFlow = this\.captureNoteFlowAnchor\(item\.stroke\);\s*const anchor/);
  assert.doesNotMatch(flowLayout, /vault\.modify|app\.vault\.process/);
  assert.match(styles, /\.notedraw-note-flow-anchor/);
  assert.match(styles, /\.notedraw-note-flow-line-spacer \{[\s\S]*display: block;[\s\S]*height: 0;/);
  assert.match(source, /shouldPlaceStrokeBelowMarkdown\(stroke\)/);
  assert.match(source, /for \(const canvas of \[this\.underlayCanvas, this\.staticCanvas, this\.canvas\]\) \{\s*applyElementStyles\(canvas/);
  assert.match(source, /const layer = belowMarkdown \? this\.underlayEmbedLayer : this\.embedLayer/);
  assert.match(source, /belowMarkdown: Boolean\(noteFlow\)/);
  assert.match(styles, /\.notedraw-underlay-embed-layer \{\s*z-index: 0;/);
});

test("NoteFlow spacing targets the complete Markdown block and restores after reading-view rebuilds", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const targetSource = source.slice(source.indexOf("  noteFlowTargetElement("), source.indexOf("  noteFlowAnchorElement("));
  const blockSource = source.slice(source.indexOf("function findNoteFlowMarkdownBlockElement("), source.indexOf("function findEditableTarget("));
  const prepareSource = source.slice(source.indexOf("  frozenNoteFlowAnchorsReady("), source.indexOf("  updateFrozenNoteFlowLayout("));
  const flowLayout = source.slice(source.indexOf("  applyNoteFlowLayout()"), source.indexOf("  scheduleNoteFlowLayout(options"));

  assert.match(blockSource, /let listItem = element\.closest\?\.\("li"\)/);
  assert.match(blockSource, /while \(listItem\?\.parentElement\)[\s\S]*listItem = parentItem/);
  assert.match(blockSource, /const tableBlock = element\.closest\?\.\("\.el-table"\) \|\| element\.closest\?\.\("table"\)/);
  assert.match(blockSource, /NOTE_FLOW_RENDERED_OWNER_SELECTOR/);
  assert.match(blockSource, /NOTE_FLOW_RENDERED_BLOCK_SELECTOR/);
  assert.match(source, /\.internal-embed,\.markdown-embed,\.markdown-embed-content/);
  assert.match(source, /A bare internal-embed is the source note's placeholder/);
  assert.match(source, /element\?\.matches\?\.\("\[alt\], \[data-href\], \[src\]"\)/);
  assert.match(targetSource, /const owner = anchor\?\.element \|\| null;/);
  assert.match(targetSource, /placementMode === "inline"[\s\S]*return owner/);
  assert.match(targetSource, /className = "notedraw-note-flow-block-spacer"/);
  assert.match(targetSource, /owner\.appendChild\(spacer\)/);
  assert.match(targetSource, /owner\.insertBefore\(spacer, owner\.firstChild\)/);
  assert.match(targetSource, /owner\._noteDrawExternalFlowSpacing = true/);
  assert.match(targetSource, /return owner;/);
  assert.doesNotMatch(targetSource, /insertAdjacentElement\("(?:afterend|beforebegin)", spacer\)/);
  assert.doesNotMatch(targetSource, /heading\.style\.(?:setProperty|removeProperty)/);
  assert.match(flowLayout, /element\.style\.setProperty\(state\.styleProperty, nextValue, "important"\)/);
  assert.match(source, /noteFlowStyleProperty\(element, property\)[\s\S]*_noteDrawExternalFlowSpacing[\s\S]*"margin-top"[\s\S]*"margin-bottom"/);
  assert.match(source, /const targetRect = state\?\.styleProperty === "margin-top" \|\| state\?\.styleProperty === "margin-bottom"[\s\S]*targetRect\.top - applied \* scaleY/);
  assert.match(source, /const selectedNoteFlowChanged = layoutChanged && this\.getSelectedStrokeIndexes\(\)\.some[\s\S]*this\.invalidateSelectionFrameSnapshot\(\);[\s\S]*this\.captureSelectionFrameSnapshot\(\{ force: true \}\);/);
  assert.match(source, /noteFlowAppliedVerticalInsets\(element\)[\s\S]*element\?\.children[\s\S]*noteDrawNoteFlowSide === "after"/);
  assert.match(flowLayout, /const styleProperty = this\.noteFlowStyleProperty\(element, property\)[\s\S]*element\.style\.setProperty\(state\.styleProperty, nextValue, "important"\)/);
  assert.match(source, /element\.classList\?\.contains\("notedraw-note-flow-block-spacer"\)[\s\S]*properties\.push\("height"\)/);
  assert.match(prepareSource, /annotateVisibleMarkdownElements\(this\.plugin\.app, this\.previewEl/);
  assert.match(prepareSource, /annotateRenderedMarkdownLines\(this\.plugin\.app, this\.previewEl, filePath, \{ force: true \}\)/);
  assert.match(prepareSource, /this\.restoreFrozenNoteFlowLayout\(\)/);
  assert.match(prepareSource, /this\.frozenNoteFlowRestoreFrameId = window\.requestAnimationFrame\(run\);\s*this\.frozenNoteFlowRestoreTimer = window\.setTimeout\(run, 120\)/);
  assert.match(prepareSource, /cancelFrozenNoteFlowLayoutRestore\(\)[\s\S]*window\.clearTimeout\(this\.frozenNoteFlowRestoreTimer\)/);
  assert.match(prepareSource, /window\.requestAnimationFrame\([\s\S]*prepareFrozenNoteFlowLayout\(\{ retry: false \}\)/);
  assert.doesNotMatch(prepareSource, /vault\.(?:create|modify|process|delete|rename)|writeDrawings|scheduleDrawingSave/);
  assert.match(source, /const renderedText = renderedMarkdownIdentityText\(element\)/);
  assert.match(source, /findRenderedMarkdownSourceTargets\(source, renderedText, sourceIndex\)/);
  assert.match(source, /resolveRenderedMarkdownSourceTarget\(source, renderedText, sourceInfo, sourceIndex\)/);
  assert.match(source, /matchRenderedTextToMarkdown\(source, renderedText, sourceIndex\)/);
  assert.match(source, /this\.prepareFrozenNoteFlowLayout\(\)\.catch[\s\S]*this\.resizeCanvas\(\{ layout: false, measure: true \}\)/);
  assert.match(source, /this\.resizeCanvas\(\{ layout: false, measure: true \}\);[\s\S]{0,240}if \(!this\.active && this\.hasNoteFlowElements\(\)\) \{\s*this\.scheduleFrozenNoteFlowLayoutRestoreAfterMeasurement\(\)/);
  assert.match(prepareSource, /scheduleFrozenNoteFlowLayoutRestoreAfterMeasurement\(\)[\s\S]*const preparation = this\.frozenNoteFlowPreparation;[\s\S]*preparation\.then\(schedule, schedule\)/);
  assert.match(source, /noteFlowTargetElement\(anchor, record\.side, ownerNoteFlow\?\.placementMode \|\| "row"\)/);
  assert.match(source, /for \(const spacer of this\.noteFlowBlockSpacers\?\.values\?\.\(\) \|\| \[\]\)/);
  assert.match(source, /pruneDisconnectedNoteFlowLayout\(\)/);
  assert.match(flowLayout, /const frozenLayoutChanged = !missingStableAnchor && this\.updateFrozenNoteFlowLayout\(frozenOffsets\)/);
  assert.doesNotMatch(flowLayout, /mergeFrozenNoteFlowLayout/);
  assert.match(flowLayout, /layoutStyleChanged/);
  assert.match(flowLayout, /preferCurrent: Boolean\(normalizeNoteFlow\(stroke\.noteFlow\)\?\.positionBasis\)/);
  assert.match(source, /cleanupOrphanedNoteFlowLayout\(preview\)[\s\S]*\.notedraw-note-flow-block-spacer/);
  assert.match(source, /NOTEDRAW_OWNED_MUTATION_SELECTOR = \[[\s\S]*"\.notedraw-note-flow-block-spacer"/);
  assert.match(styles, /\.notedraw-note-flow-block-spacer \{[\s\S]*display: block;[\s\S]*height: 0;[\s\S]*overflow-anchor: none;/);
});

test("a new NoteFlow stroke waits for canonical Markdown owners before committing layout", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const annotationSource = source.slice(source.indexOf("  scheduleMarkdownAnnotationRefresh("), source.indexOf("  updateFloatingControlsPosition(", source.indexOf("  scheduleMarkdownAnnotationRefresh(")));
  const pointerFinishSource = source.slice(source.indexOf("  onPointerUp(event"), source.indexOf("  finishPointerInteraction(event", source.indexOf("  onPointerUp(event")));
  const flowLayout = source.slice(source.indexOf("  applyNoteFlowLayout()"), source.indexOf("  scheduleNoteFlowLayout(options"));
  const frozenRestore = source.slice(source.indexOf("  restoreFrozenNoteFlowLayout()"), source.indexOf("  clearNoteFlowLayout()", source.indexOf("  restoreFrozenNoteFlowLayout()")));

  assert.match(annotationSource, /markdownAnnotationTimer !== null && requestedForce && delay === 0[\s\S]*window\.clearTimeout\(this\.markdownAnnotationTimer\)/);
  assert.match(pointerFinishSource, /if \(this\.noteFlowMarkdownAnnotationComplete\) \{\s*this\.currentStroke\.noteFlow = this\.captureNoteFlowAnchor\(this\.currentStroke\);\s*} else \{\s*this\.scheduleMarkdownAnnotationRefresh\(\{ layout: false, delay: 0, force: true \}\)/);
  assert.match(flowLayout, /this\.noteFlowOperationPending && flows\.length && !this\.noteFlowMarkdownAnnotationComplete[\s\S]*this\.noteFlowLayoutIncomplete = true;[\s\S]*scheduleMarkdownAnnotationRefresh\(\{ layout: false, delay: 0, force: true \}\)/);
  assert.match(frozenRestore, /this\.noteFlowBlockSpacers\?\.size/);
});

test("dragged inserted note elements use stable drop placement or frame-batched avoidance refresh", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const dragSource = source.slice(source.indexOf("  startSelectedStrokeDrag("), source.indexOf("  startSelectedStrokeResize("));
  const refreshSource = source.slice(source.indexOf("  queueDraggedNoteFlowRefresh("), source.indexOf("  cancelNoteFlowLayout()"));
  const settleSource = source.slice(source.indexOf("  markNoteFlowLayoutMutation("), source.indexOf("  queueDraggedNoteFlowRefresh("));
  const moveSource = dragSource.slice(dragSource.indexOf("  moveSelectedStroke("), dragSource.indexOf("  finishSelectedStrokeDrag("));

  assert.match(dragSource, /this\.dragStrokeOriginalNoteFlows = new Map/);
  assert.match(moveSource, /if \(this\.usesDraggedNoteFlowPlacement\(\)\) \{\s*this\.queueDraggedNoteFlowPlacement\(event\.clientX, event\.clientY\);\s*} else \{\s*this\.queueDraggedNoteFlowRefresh\(strokeIndexes\)/);
  assert.doesNotMatch(moveSource, /captureNoteFlowAnchor|scheduleDrawingSave/);
  assert.match(refreshSource, /this\.pendingDraggedNoteFlowIndexes\.add\(index\)/);
  assert.match(refreshSource, /refreshDraggedNoteFlowAnchors\(\)/);
  assert.match(refreshSource, /this\.clearNoteFlowLayout\(\)/);
  assert.match(refreshSource, /path: captured\.path,[\s\S]*line: captured\.line,[\s\S]*side: captured\.side/);
  assert.match(refreshSource, /const run = \(\) => \{[\s\S]*this\.refreshDraggedNoteFlowAnchors\(\)[\s\S]*this\.applyNoteFlowLayout\(\)[\s\S]*window\.requestAnimationFrame\(run\)/);
  assert.match(refreshSource, /layoutChanged && !this\.draggingStroke/);
  assert.match(dragSource, /stroke\.noteFlow = originalNoteFlow \? \{ \.\.\.originalNoteFlow \} : null/);
  assert.match(source, /onResize\(\)[\s\S]*this\.scheduleResize\(\{ layout: false, measure: widthChanged \}\)/);
  assert.match(source, /scheduleNoteFlowLayout\(options = \{\}\)[\s\S]*options\.operation === true/);
  assert.match(source, /const noteFlowResizeSuppressed = Date\.now\(\) < this\.noteFlowSuppressResizeUntil/);
  assert.match(source, /const wantsLayout = options\.layout !== false[\s\S]*&& !this\.draggingStroke[\s\S]*&& !noteFlowResizeSuppressed[\s\S]*&& !readingScrollActive/);
  assert.doesNotMatch(dragSource.slice(0, dragSource.indexOf("  moveSelectedStroke(")), /this\.cancelResizeFrame\(\)/);
  assert.match(moveSource, /if \(!this\.dragStrokeMoved && movedDistance <= this\.tapDistancePx\(\)\)[\s\S]*this\.cancelResizeFrame\(\);[\s\S]*this\.prepareReadingBottomExtentForDrag\(\)/);
  assert.match(settleSource, /markNoteFlowLayoutMutation\(\)[\s\S]*Date\.now\(\) \+ 180/);
  assert.match(settleSource, /this\.resizeFrameId !== null && this\.resizeNeedsLayout[\s\S]*this\.cancelResizeFrame\(\)[\s\S]*this\.scheduleResize\(\{ layout: false, measure: false \}\)/);
  assert.match(settleSource, /scheduleNoteFlowSettleResize\(\)[\s\S]*this\.noteFlowSettlePasses >= 2[\s\S]*this\.scheduleResize\(\{ layout: false, measure: true, preserveAbsolutePlacement: true \}\)/);
  assert.match(source, /options\.preserveAbsolutePlacement === true[\s\S]*this\.preserveAbsoluteStrokePlacement\(previousCanvasWidth, previousCanvasHeight\)/);
  assert.match(source, /preserveAbsoluteNoteFlowPoints\(stroke\.points/);
  assert.match(refreshSource, /layoutChanged && !this\.draggingStroke[\s\S]*this\.scheduleNoteFlowSettleResize\(\)/);
  assert.doesNotMatch(refreshSource, /layoutChanged && !this\.draggingStroke[\s\S]{0,120}this\.scheduleResize\(\{ layout: true \}\)/);
  assert.match(source, /window\.clearTimeout\(this\.noteFlowResizeTimer\)/);
  assert.match(source, /function cleanupOrphanedNoteFlowLayout\(preview\)/);
  assert.doesNotMatch(source, /resetDormantRootPreview[\s\S]{0,900}preview\.scrollTop = 0/);
});

test("mind map import creates editable NoteDraw nodes and magnetically bound connectors", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /import \{ layoutMindMap, parseMarkdownMindMap, replaceMarkdownMindMapNodeText \} from "\.\/mind-map\.mjs"/);
  assert.match(source, /new NoteDrawFileSuggestModal\(this\.app, currentFile/);
  assert.match(source, /scheduleMindMapFilePicker\(\)[\s\S]*window\.setTimeout\([\s\S]*this\.openMindMapFilePicker\(\)[\s\S]*48\)/);
  assert.match(source, /this\.mindMapFileModal = modal;\s*modal\.open\(\)/);
  assert.match(source, /if \(previousModal\?\.modalEl\?\.isConnected\) \{\s*previousModal\.close\(\)/);
  assert.match(source, /onClose: \(closedModal\) => \{\s*if \(this\.mindMapFileModal === closedModal\)/);
  assert.match(source, /async insertMindMapAt\(point, sourceFile, options = \{\}\)/);
  assert.match(source, /kind: TOOL_TEXT/);
  assert.match(source, /text: node\.markdown \|\| node\.text,\s*render: TEXT_RENDER_MARKDOWN/);
  assert.match(source, /mindMapNode:/);
  assert.match(source, /affectsSource/);
  assert.match(source, /openSelectedMindMapSource/);
  assert.match(source, /connector: \{\s*fromId: idMap\.get\(edge\.fromId\),\s*toId: idMap\.get\(edge\.toId\)/);
  assert.match(source, /syncBoundConnectors\(\)/);
  assert.match(source, /buildBoundConnectorPoints\(fromBounds, toBounds/);
  assert.match(source, /drawBoundConnectorOn\(ctx, stroke, alpha\)/);
  assert.match(source, /ctx\.quadraticCurveTo\(points\[1\]\.x, points\[1\]\.y, points\[2\]\.x, points\[2\]\.y\)/);
});

test("text and links keeps only text, outline and solid rectangles, and the magnetic arrow in one group", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const panelStart = source.indexOf("  createTextPanel() {");
  const panelSource = source.slice(panelStart, source.indexOf("  scheduleMindMapFilePicker()", panelStart));

  assert.match(panelSource, /labelKey: "textGroup"/);
  assert.match(panelSource, /\{ id: "plain", labelKey: "textPlain", icon: "type" \}/);
  assert.match(panelSource, /\{ id: "rectangle", labelKey: "outlineButton", icon: "square" \}/);
  assert.match(panelSource, /\{ id: "circle", labelKey: "pillButton", icon: "square" \}/);
  assert.match(panelSource, /\{ id: "arrow", labelKey: "arrow", icon: "move-up-right" \}/);
  assert.doesNotMatch(panelSource, /labelKey: "buttonGroup"|id: "title"|id: "code"|id: "file"|id: "button"|id: "buttonPrimary"|id: "arrowUp"|id: "arrowDown"|id: "arrowLeft"|id: "arrowRight"/);
  assert.match(source, /title: "plain"[\s\S]*code: "plain"[\s\S]*file: "plain"[\s\S]*button: "plain"/);
  assert.match(source, /startConnectorGesture\(event, point, routed\)/);
  assert.match(source, /findSnapElementIdAtPoint\(point/);
  assert.match(source, /connectorSnapThreshold\(this\.selectionHitPaddingPx\(\)\)/);
  assert.match(source, /buildSnappedConnectorPoints\(\{/);
  assert.match(source, /ensureSnapElementIds\(\)/);
  assert.match(source, /buttonStyle: preset === "circle" \? "solid" : "pill"/);
  assert.match(source, /this\.syncBoundConnectors\(\)/);
});

test("connector dragging caches snap geometry and ordinary renders skip legacy recovery scans", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.slice(source.indexOf("  startConnectorGesture"), source.indexOf("  findSnapElementIdAtPoint"));
  const sync = source.slice(source.indexOf("  syncBoundConnectors(options = {})"), source.indexOf("  drawBoundConnectorOn", source.indexOf("  syncBoundConnectors(options = {})")));
  const render = source.slice(source.indexOf("  render() {"), source.indexOf("  renderStaticCanvas()", source.indexOf("  render() {")));

  assert.match(start, /const snapTargets = this\.collectSnapTargets\(\)/);
  assert.match(start, /snapBoundsById/);
  assert.match(start, /findSnapElementIdAtPoint\(endPoint, fromId, snapTargets\)/);
  assert.match(sync, /const recover = options\.recover === true/);
  assert.match(sync, /if \(recover && !fromBounds/);
  assert.match(sync, /if \(targetIds && !targetIds\.has\(connector\.fromId\)/);
  assert.doesNotMatch(render, /recover: true/);
  assert.match(source, /syncBoundConnectors\(\{ elementIds: this\.dragMovedElementIds \}\)/);
});

test("selected text elements enter their editor before selection drag starts", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerSource = source.slice(source.indexOf("  onPointerDown(event"), source.indexOf("  startConnectorGesture", source.indexOf("  onPointerDown(event")));

  assert.ok(pointerSource.indexOf("this.editFloatingTextStroke(hitStrokeIndex)") < pointerSource.indexOf("if (this.toolMode === TOOL_SELECT && hitStrokeIndex >= 0)"));
  assert.match(pointerSource, /const repeatedSelectionTap = this\.toolMode === TOOL_SELECT && this\.isRepeatTextTap/);
  assert.match(pointerSource, /type: "edit-stroke-or-drag"/);
  assert.match(source, /pending\.type === "edit-stroke-or-drag"[\s\S]*this\.editFloatingTextStroke\(pending\.index\)/);
});

test("controller startup and tool choices remain stable across reloads", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /this\.selectedStrokeIndexes\?\.size/);
  assert.match(source, /lastToolMode/);
  assert.match(source, /lastPenVariant/);
  assert.match(source, /lastTextPreset/);
  assert.doesNotMatch(source, /this\.brushVariants\[mode\] = BRUSH_VARIANT_DEFAULT;\s*this\.setBrushMode\(mode\)/);
  const sharedState = source.slice(source.indexOf("  applySharedToolbarState(state)"), source.indexOf("  setToolFromApi", source.indexOf("  applySharedToolbarState(state)")));
  assert.match(sharedState, /const zoomChanged = Math\.abs\(this\.readingZoom - previousReadingZoom\)/);
  assert.match(sharedState, /previousToolMode !== this\.toolMode[\s\S]*this\.requestRender\(\)/);
  assert.doesNotMatch(sharedState, /this\.render\(\)/);
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

test("fountain rendering stays continuous and palette ranges cover fine through very large brushes", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const fountainStart = source.indexOf("  drawFountainPenStrokeOn(ctx, stroke, alpha = 1) {");
  const fountainSource = source.slice(fountainStart, source.indexOf("  drawImageStrokeOn", fountainStart));

  assert.match(source, /var MIN_BRUSH_WIDTH = 0\.25;/);
  assert.match(source, /var MAX_BRUSH_WIDTH = 96;/);
  assert.match(source, /function brushWidthToPaletteSlider\(value\)/);
  assert.match(source, /function paletteSliderToBrushWidth\(value\)/);
  assert.match(source, /function opacityToPaletteSlider\(value\)/);
  assert.match(source, /function paletteSliderToOpacity\(value\)/);
  assert.match(fountainSource, /ctx\.beginPath\(\)[\s\S]*ctx\.quadraticCurveTo\([\s\S]*ctx\.fill\(\)/);
  assert.doesNotMatch(fountainSource, /ctx\.arc\(/);
  assert.match(fountainSource, /ctx\.lineWidth = Math\.max\(0\.7,[\s\S]*ctx\.stroke\(\)/);
});

test("main workspace views remount drawings and header controls after internal rerenders", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /this\.workspaceControllers = \/\* @__PURE__ \*\/ new Map\(\)/);
  assert.match(source, /syncWorkspaceControllers\(\)/);
  assert.match(source, /surfaceType: "workspace",\s*workspaceSurface: true/);
  assert.match(source, /isMainWorkspaceView\(view\)/);
  assert.match(source, /createWorkspaceDrawingFile\(view, viewType\)/);
  assert.match(source, /function workspaceSurfaceStoragePath\(view, viewType\)/);
  assert.match(source, /if \(!existing\.button\?\.isConnected\) \{\s*existing\.button = this\.installHeaderButton\(existing\)/);
  assert.match(source, /isWorkspaceSurfaceMutation\(mutation\)/);
  assert.match(styles, /\.notedraw-shell\.is-notedraw-workspace-shell \.notedraw-static-canvas/);
});

test("image files always receive a workspace controller and magic-wand entry", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const workspaceSync = source.slice(source.indexOf("  syncWorkspaceControllers() {"), source.indexOf("  cleanupNativeGraphWorkspaceView", source.indexOf("  syncWorkspaceControllers() {")));

  assert.match(source, /imageWorkspaceSurfaces: true/);
  assert.match(source, /function isImageWorkspaceView\(view, viewType = workspaceViewType\(view\)\)/);
  assert.match(source, /function collectImageWorkspaceLeaves\(app\) \{[\s\S]*getLeavesOfType\?\.\("image"\)/);
  assert.match(source, /"png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"/);
  assert.match(workspaceSync, /for \(const leaf of collectImageWorkspaceLeaves\(this\.app\)\)/);
  assert.match(workspaceSync, /const file = view\?\.file && typeof view\.file\.path === "string" \? view\.file : null/);
  assert.match(workspaceSync, /this\.mountWorkspaceController\(view, viewType, file, surface\)/);
  assert.match(source, /mountWorkspaceController\(view, viewType, file, surface\) \{[\s\S]*existing\.button = this\.installHeaderButton\(existing\)/);
});

test("Obsidian graph views keep their native canvases and interactions", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const webviewSync = source.slice(source.indexOf("  syncWebviewControllers() {"), source.indexOf("  syncWorkspaceControllers() {"));
  const workspaceSync = source.slice(source.indexOf("  syncWorkspaceControllers() {"), source.indexOf("  installHeaderButton(controller) {"));

  assert.match(source, /function isNativeGraphWorkspaceType\(viewType\) \{\s*return viewType === "graph" \|\| viewType === "localgraph";/);
  assert.match(webviewSync, /for \(const leaf of collectWorkspaceLeaves\(this\.app\)\)[\s\S]*this\.cleanupNativeGraphWorkspaceView\(view, view\?\.contentEl \|\| findWorkspaceDrawingSurface\(view\)\);/);
  assert.match(webviewSync, /isNativeGraphWorkspaceType\(workspaceViewType\(view\)\)[\s\S]*this\.cleanupNativeGraphWorkspaceView\(view, surface\);\s*continue;/);
  assert.match(workspaceSync, /if \(isNativeGraphWorkspaceType\(viewType\)\) \{\s*this\.cleanupNativeGraphWorkspaceView\(view, view\?\.contentEl \|\| findWorkspaceDrawingSurface\(view\)\);\s*continue;/);
  assert.match(workspaceSync, /controller\?\.plugin === this && controller !== registeredController[\s\S]*controller\.destroy\?\.\(\)/);
  assert.match(source, /return !isNativeGraphWorkspaceType\(viewType\) && !element\.closest/);
  assert.match(source, /!isWebviewWorkspaceType\(viewType\) && !isNativeGraphWorkspaceType\(viewType\)/);
  assert.match(source, /preview\.style\?\.removeProperty\(property\)/);
});

test("hidden and offscreen embeds avoid redundant controllers and scroll work", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const observerSource = source.slice(source.indexOf("  installWebviewObserver()"), source.indexOf("  scheduleFloatingControlsSync()"));
  const embeddedSource = source.slice(source.indexOf("  syncEmbeddedMarkdownControllers()"), source.indexOf("  syncWebviewControllers()"));
  const scrollStart = source.indexOf("  onScroll()");
  const scrollSource = source.slice(scrollStart, source.indexOf("  scheduleResize(options", scrollStart));

  assert.match(observerSource, /mutations\.some\(\(mutation\) => isEmbeddedSurfaceSyncMutation\(mutation\)\)/);
  assert.doesNotMatch(observerSource, /mutations\.some\(\(mutation\) => mutation\.type === "childList"\)/);
  assert.match(embeddedSource, /return isElementLaidOut\(surface\) && !surface\.closest\("\.notedraw-embed"\)/);
  assert.match(scrollSource, /this\.embeddedSurface && !isElementNearViewport\(this\.previewEl\)/);
  assert.match(source, /function isElementLaidOut\(element\)/);
  assert.match(source, /function isElementNearViewport\(element, margin = 320\)/);
  assert.match(source, /function isEmbeddedSurfaceSyncMutation\(mutation\)/);
  assert.match(source, /function isNoteDrawOwnedMutation\(mutation\)/);
  assert.match(source, /isMarkdownContentMutation\(mutation\)[\s\S]*isNoteDrawOwnedMutation\(mutation\)/);
  assert.match(source, /this\.embedGeometryTokens\.get\(key\) !== geometryToken/);
});
