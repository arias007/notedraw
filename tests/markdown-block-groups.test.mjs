import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  clientPointInRect,
  markdownClientRectsOverlap,
  markdownBlockPresentationMinHeight,
  normalizeMarkdownBlockMinHeight,
  normalizeMarkdownFloatBox,
  resizeMarkdownBlockMinHeight,
  resolveDragDropHorizontalIntent,
  resolveSelectionResizeScales,
  resolveVerticalMarkdownDropTarget,
  trimMarkdownClientRect
} from "../src/markdown-block-layout.mjs";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("horizontal drag intent reserves the left edge for magnetic line insertion", () => {
  const target = {
    targetLeft: 300,
    targetRight: 700,
    laneLeft: 0,
    laneRight: 1000
  };

  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 320, draggedLeft: 120 }), "vertical");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 500, draggedLeft: 7 }), "line-start");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 320, draggedLeft: null }), "vertical");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 500 }), "vertical");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 620 }), "vertical");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 640 }), "inline-right");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 640, horizontalRoom: false }), "vertical");
});

test("Markdown blocks and inserted ink share the real NoteFlow row contract", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const presentation = source.slice(source.indexOf("  markdownBlockFlowElement("), source.indexOf("  selectMarkdownBlock("));
  const drop = source.slice(source.indexOf("  draggedNoteFlowIndexes("), source.indexOf("  captureNoteFlowAnchor("));

  assert.match(presentation, /findNoteFlowMarkdownBlockElement\(element, this\.previewEl\)/);
  assert.match(presentation, /flowElement\.style\.gridColumn = `span/);
  assert.match(presentation, /markdownBlockGridContainer\(element\)/);
  assert.match(styles, /\.notedraw-md-grid > \.notedraw-md-grid-item/);
  assert.doesNotMatch(styles, /@container \(max-width: 520px\)[\s\S]*grid-column: 1 \/ -1 !important/);
  assert.match(drop, /this\.draggedNoteFlowIndexes\(\)\.length > 0 \|\| this\.draggedNoteFlowMarkdownStates\(\)\.length > 0/);
  assert.match(drop, /syncMarkdownDropFromNoteFlowPlacement\(this\.dragNoteFlowPlacement\)/);
  assert.match(drop, /prepareMarkdownAnchorForInlineNoteFlow\(placement\)/);
  assert.match(source, /const itemCount = movingCount \+ movingStrokeCount \+ 1/);
});

test("legacy floating overlap repair requires a real two-dimensional collision", () => {
  const first = { left: 10, right: 210, top: 100, bottom: 150 };

  assert.equal(markdownClientRectsOverlap(first, { left: 20, right: 200, top: 120, bottom: 170 }), true);
  assert.equal(markdownClientRectsOverlap(first, { left: 20, right: 200, top: 151, bottom: 180 }), false);
  assert.equal(markdownClientRectsOverlap(first, { left: 208, right: 240, top: 110, bottom: 140 }), false);
});

test("Markdown drag uses a left magnetic row drop and one move event chain", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /else if \(horizontalRoom && intent === "line-start"\) \{\s*side = "left";/);
  assert.match(source, /const row = this\.markdownDropRowMetrics\(nearest\.element, movingElements\);/);
  assert.match(source, /const minimumClientDx = this\.dragMarkdownOriginalClientBounds && laneRect[\s\S]*laneRect\.left - this\.dragMarkdownOriginalClientBounds\.left/);
  assert.match(source, /draggedLeft: this\.draggedSelectionClientLeft\(\)/);
  assert.doesNotMatch(source, /const onMove = \(moveEvent\) => \{/);
});

test("vertical Markdown drag inserts before, between, and after document blocks", () => {
  const first = { element: "first", rect: { left: 120, right: 680, top: 100, bottom: 150, width: 560, height: 50 } };
  const second = { element: "second", rect: { left: 120, right: 680, top: 210, bottom: 270, width: 560, height: 60 } };
  const input = {
    clientX: 400,
    laneRect: { left: 100, right: 700 },
    candidates: [second, first]
  };

  assert.deepEqual(resolveVerticalMarkdownDropTarget({ ...input, clientY: 70 }), { element: "first", side: "before" });
  assert.deepEqual(resolveVerticalMarkdownDropTarget({ ...input, clientY: 165 }), { element: "first", side: "after" });
  assert.deepEqual(resolveVerticalMarkdownDropTarget({ ...input, clientY: 195 }), { element: "second", side: "before" });
  assert.deepEqual(resolveVerticalMarkdownDropTarget({ ...input, clientY: 320 }), { element: "second", side: "after" });
  assert.equal(resolveVerticalMarkdownDropTarget({ ...input, clientX: 800, clientY: 320 }), null);
});

test("NoteFlow padding is excluded from the visible Markdown hit rectangle", () => {
  const rect = trimMarkdownClientRect({
    left: 100,
    right: 500,
    top: 40,
    bottom: 440
  }, {
    insetTop: 140,
    insetBottom: 20,
    scale: 2
  });

  assert.deepEqual(rect, {
    left: 100,
    right: 500,
    top: 320,
    bottom: 400,
    width: 400,
    height: 80
  });
  assert.equal(clientPointInRect(rect, { x: 200, y: 200 }), false);
  assert.equal(clientPointInRect(rect, { x: 200, y: 360 }), true);
  assert.equal(trimMarkdownClientRect({ left: 0, right: 100, top: 0, bottom: 40 }, { insetTop: 40 }), null);
});

test("floating Markdown positions stay independent from their saved size", () => {
  assert.deepEqual(normalizeMarkdownFloatBox({
    x: 0.447892974,
    y: 0.99,
    width: 0.855297191,
    height: 0.08
  }), {
    x: 0.447892974,
    y: 0.99,
    width: 0.855297191,
    height: 0.08
  });
  assert.deepEqual(normalizeMarkdownFloatBox({
    x: 0,
    y: 0.41,
    width: 0.53,
    height: 1
  }), {
    x: 0,
    y: 0.41,
    width: 0.53,
    height: 1
  });
});

test("Markdown block height creates owned whitespace without shrinking below its content", () => {
  assert.equal(normalizeMarkdownBlockMinHeight(-20), 0);
  assert.equal(normalizeMarkdownBlockMinHeight(288.4), 288);
  assert.equal(normalizeMarkdownBlockMinHeight(9000), 2400);
  assert.equal(resizeMarkdownBlockMinHeight({
    currentHeight: 120,
    naturalHeight: 64,
    scaleY: 2
  }), 240);
  assert.equal(resizeMarkdownBlockMinHeight({
    currentHeight: 120,
    naturalHeight: 64,
    scaleY: 0.4
  }), 0);
  assert.equal(resizeMarkdownBlockMinHeight({
    currentHeight: 64,
    naturalHeight: 64,
    scaleY: 1.05
  }), 67);
  assert.equal(resizeMarkdownBlockMinHeight({
    currentHeight: 120,
    naturalHeight: 64,
    scaleY: 2,
    maxHeight: 180
  }), 180);
  assert.equal(markdownBlockPresentationMinHeight({ floating: true, minHeight: 120 }), 0);
  assert.equal(markdownBlockPresentationMinHeight({ floating: false, minHeight: 120 }), 120);
});

test("floating Markdown height never feeds the document height", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const height = markdownBlockPresentationMinHeight\(block\);/);
  assert.match(source, /y: state\.floatBox\.y,/);
  assert.doesNotMatch(source, /floatBox\.height \* Math\.max\(1, this\.canvasHeight\(\)\)/);
  assert.doesNotMatch(source, /y: anchor\.y \+ \(state\.floatBox\.y - anchor\.y\) \* scaleY/);
});

test("Markdown blocks persist layout, floating state, and hybrid group membership", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /markdownBlocks: normalizeMarkdownBlocks\(data\?\.markdownBlocks, file\)/);
  assert.match(source, /elementGroups: normalizeElementGroups\(data\?\.elementGroups\)/);
  assert.match(source, /floating: Boolean\(block\?\.floating && floatBox\)/);
  assert.match(source, /groupId: typeof block\?\.groupId === "string"/);
  assert.match(source, /groupId: typeof stroke\?\.groupId === "string"/);
  assert.match(source, /this\.getSelectedMarkdownBlocks\(\)/);
  assert.match(source, /this\.getSelectedStrokeIndexes\(\)/);
});

test("Markdown blocks use pointer sorting, logical-coordinate floating, and remaining-row columns", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /updateMarkdownBlockDropTarget\(clientX, clientY\)/);
  assert.match(source, /markdownDropRowMetrics\(target, movingElements\)/);
  assert.match(source, /const effectiveSide = horizontal \? drop\.side/);
  assert.match(source, /const localScaleX = canvasRect\?\.width > 0/);
  assert.match(source, /const canvasDy = \(event\.clientY - this\.pointerStartClient\.y\) \* this\.canvasRenderHeight/);
  assert.match(source, /const horizontalSurface = this\.layoutMeasureEl\?\.isConnected/);
  assert.match(source, /const targetLeft = \(horizontalRect\?\.left \?\? canvasRect\.left\) \+ block\.floatBox\.x \* logicalWidth \* scaleX/);
  assert.match(source, /const targetTop = canvasRect\.top \+ \(block\.floatBox\.y \* logicalHeight - this\.canvasWindowTop\) \* scaleY/);
  assert.match(source, /this\.queueMarkdownBlockDropTarget\(event\.clientX, event\.clientY\)/);
  assert.match(source, /element\.addEventListener\("pointerdown"/);
  assert.match(styles, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.notedraw-md-block::before/);
  assert.match(styles, /\.notedraw-md-block\.is-floating/);
});

test("selecting Markdown blocks does not trigger a whole-note responsive reflow", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const markdownSelectionCandidate = this\.toolMode === TOOL_SELECT \? this\.markdownBlockElementForTarget\(target, clientPoint\) : null;/);
  assert.match(source, /const marked = target\.closest\?\.\("\.notedraw-md-block"\);/);
  assert.match(source, /const blockElement = element\?\.closest\?\.\("\.notedraw-md-block"\) \|\| element;/);
  assert.doesNotMatch(source, /this\.toolMode === TOOL_SELECT && this\.markdownBlockRecords\(\)\.length > 0/);
});

test("visible Markdown and task checkboxes select their own block before lower NoteFlow ink", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerSource = source.slice(source.indexOf("  onPointerDown(event"), source.indexOf("  onPointerMove(event", source.indexOf("  onPointerDown(event")));
  const targetSource = source.slice(source.indexOf("  markdownBlockElementForTarget("), source.indexOf("  ensureMarkdownBlockRecord(", source.indexOf("  markdownBlockElementForTarget(")));

  assert.match(pointerSource, /markdownSelectionCandidate && hitStrokeIndex >= 0 && shouldPlaceStrokeBelowMarkdown/);
  assert.match(pointerSource, /hitStrokeIndex < 0 && !resizeHandle && !markdownSelectionCandidate/);
  assert.match(targetSource, /input\.task-list-item-checkbox, input\[type='checkbox'\]/);
  assert.match(targetSource, /taskCheckbox\?\.closest\?\.\("li"\)/);
  assert.match(targetSource, /element\?\.closest\?\.\("li"\) === taskItem && isConcreteMarkdownBlockElement\(element\)/);
});

test("Markdown selection resize hits only the visible outer frame corners", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /const rects = \[frame\];/);
  const handleSource = source.slice(source.indexOf("  findSelectionHandleAt("), source.indexOf("  selectedStrokeFrameContains("));
  assert.doesNotMatch(handleSource, /contentBounds|rects\.push/);
  assert.match(source, /const screenHitRadius = Math\.max\(SELECT_RESIZE_HANDLE_HIT_RADIUS, this\.selectionHitPaddingPx\(\) \+ 6, 28\);/);
  assert.match(source, /distance < best\.distance/);
  assert.match(source, /block\.minHeight = resizeMarkdownBlockMinHeight\(\{/);
  assert.match(source, /state\.block\.minHeight = state\.minHeight/);
  assert.match(source, /minHeight: normalizeMarkdownBlockMinHeight\(block\?\.minHeight\)/);
  assert.match(source, /this\.applyMarkdownBlockHeightPresentation\(block, element\)/);
  assert.match(styles, /data-note-draw-resized-height="true"[\s\S]*min-height: var\(--notedraw-md-min-height\)/);
});

test("selection resize keeps both axes for free corner drags", () => {
  assert.deepEqual(resolveSelectionResizeScales({ scaleX: 0.72, scaleY: 1.08, deltaX: -80, deltaY: 12 }), {
    scaleX: 0.72,
    scaleY: 1.08,
    axis: null
  });
  assert.deepEqual(resolveSelectionResizeScales({ scaleX: 1.08, scaleY: 0.72, deltaX: 12, deltaY: -80 }), {
    scaleX: 1.08,
    scaleY: 0.72,
    axis: null
  });
  assert.deepEqual(resolveSelectionResizeScales({ scaleX: 0.8, scaleY: 0.8, deltaX: -40, deltaY: -40 }), {
    scaleX: 0.8,
    scaleY: 0.8,
    axis: null
  });
});

test("selection resize applies the two-dimensional scale returned by the layout helper", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /\(\{ scaleX, scaleY \} = resolveSelectionResizeScales\(\{ scaleX, scaleY \}\)\)/);
  assert.doesNotMatch(source, /resizeSelectionAxis|resolvedAxis|resizeDeltaX|resizeDeltaY/);
});

test("selected Markdown text edits on a second tap while a moved tap still drags", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerSource = source.slice(source.indexOf("  onPointerDown(event"), source.indexOf("  startConnectorGesture", source.indexOf("  onPointerDown(event")));
  const tapSource = source.slice(source.indexOf("  finishPendingSelectionTap("), source.indexOf("  cancelPendingSelectionTap(", source.indexOf("  finishPendingSelectionTap(")));
  const editSource = source.slice(source.indexOf("  startTextEdit("), source.indexOf("  focusSourceEditorAt(", source.indexOf("  startTextEdit(")));

  assert.match(source, /this\.editMarkdownButton = this\.surfaceType === "source"/);
  assert.match(pointerSource, /const selectedMarkdownEditableCandidate = markdownSelectionCandidate/);
  assert.match(pointerSource, /type: "edit-markdown-or-drag"/);
  assert.match(source, /pending\.type === "edit-markdown-or-drag"[\s\S]*this\.startSelectedStrokeDrag\(event, this\.eventToPoint\(event\), pending\.index \?\? -1/);
  assert.match(source, /startTextEdit\(pending\.editable \|\| pending\.element, pending\.clientPoint \|\| null\)/);
  assert.match(tapSource, /const applied = this\.applyPendingSelectionTap\(pending\);[\s\S]*pending\.type !== "edit-markdown-or-drag" \|\| applied === false/);
  assert.match(editSource, /!element\?\.isConnected[\s\S]*findMarkdownBlockRecordForElement\(element\)[\s\S]*markdownBlockElement\(block\)/);
  assert.match(editSource, /return true;\s*}\s*this\.endTextEdit\(\)/);
  assert.match(editSource, /element\.addEventListener\("blur", onBlur\);\s*return true;/);
});

test("Markdown resize keeps continuous horizontal width inside its grid span", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /widthScale: normalizeMarkdownBlockWidthScale\(block\?\.widthScale\)/);
  assert.match(source, /const originalWidthUnits = Math\.max\(2, Number\(state\.span\) \|\| 12\)[\s\S]*desiredWidthUnits[\s\S]*block\.widthScale/);
  assert.match(source, /applyMarkdownBlockWidthPresentation\(block, element\)/);
  assert.match(source, /element\.style\.width = `\$\{Math\.round\(widthScale \* 1000\) \/ 10\}%`/);
  assert.match(source, /state\.block\.widthScale = state\.widthScale/);
  assert.match(source, /const markdownScaleLimits =[\s\S]*state\.maxHeight[\s\S]*scaleY = Math\.min\(scaleY, \.\.\.markdownScaleLimits\)/);
});

test("inserted element dragging previews the raw pointer position without collision shifts", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const dragSource = source.slice(source.indexOf("  startSelectedStrokeDrag("), source.indexOf("  startSelectedStrokeResize("));
  const moveSource = dragSource.slice(dragSource.indexOf("  moveSelectedStroke("), dragSource.indexOf("  finishSelectedStrokeDrag("));

  assert.match(dragSource, /this\.dragNoteFlowOriginalBounds = new Map\(movableIndexes\.flatMap/);
  assert.match(moveSource, /const hasDraggedNoteFlow = Boolean\(this\.dragNoteFlowOriginalBounds\?\.size\)/);
  assert.match(moveSource, /const previewDx = hasDraggedNoteFlow \? dx : snappedDx/);
  assert.match(moveSource, /const previewDy = hasDraggedNoteFlow \? dy : snappedDy/);
  assert.match(moveSource, /--notedraw-md-drag-x[\s\S]*Math\.round\(clientDx\)/);
  assert.match(moveSource, /--notedraw-md-drag-y[\s\S]*Math\.round\(clientDy\)/);
  assert.doesNotMatch(moveSource, /markdownNoteFlowCollisionShift|collisionDx|collisionDy|markdownDrag/);
});

test("selection handle hit testing stays usable for narrow elements at visual zoom", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const handleSource = source.slice(source.indexOf("  findSelectionHandleAt("), source.indexOf("  selectedStrokeFrameContains("));

  assert.match(handleSource, /const scaleX = canvasRect\?\.width > 0[\s\S]*const scaleY = canvasRect\?\.height > 0/);
  assert.match(handleSource, /const hitRadiusX = screenHitRadius \/ Math\.max\(0\.01, Math\.abs\(scaleX\)\)/);
  assert.match(handleSource, /const hitRadiusY = screenHitRadius \/ Math\.max\(0\.01, Math\.abs\(scaleY\)\)/);
  assert.match(handleSource, /rect\.width <= hitRadiusX \* 2[\s\S]*topDistance[\s\S]*bottomDistance[\s\S]*const handle = top/);
  assert.match(handleSource, /\(dx \/ hitRadiusX\) \*\* 2 \+ \(dy \/ hitRadiusY\) \*\* 2/);
});

test("Markdown selection uses only the visible Canvas frame and its four corners", async () => {
  const [source, styles] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  const handleSource = source.slice(source.indexOf("  findSelectionHandleAt("), source.indexOf("  selectedStrokeFrameContains("));
  const drawSource = source.slice(source.indexOf("  drawSelection()"), source.indexOf("  drawElementGroups()"));

  assert.doesNotMatch(styles, /\.notedraw-md-block\.is-selected\s*\{/);
  assert.match(handleSource, /const rects = \[frame\]/);
  assert.doesNotMatch(handleSource, /contentBounds|rects\.push/);
  assert.match(drawSource, /getSelectionHandlePointsFromRect/);
  assert.match(drawSource, /getVisibleSelectionFrameCanvasRect/);
  assert.match(drawSource, /SELECTION_FRAME_COLOR/);
  assert.match(drawSource, /setLineDash\(\[3, 2\]\)/);
  assert.match(drawSource, /roundRect\(this\.ctx, x, y, width, height, SELECTION_FRAME_RADIUS\)/);
  assert.match(handleSource, /getVisibleSelectionFrameCanvasRect/);
});

test("Markdown selection bounds exclude NoteFlow padding and include task checkboxes", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /markdownElementCanvasBounds\(this\.markdownBlockElement\(block\), \{ forSelection: true \}\)/);
  assert.match(source, /noteFlowAppliedVerticalInsets\(element\)/);
  assert.match(source, /input\.task-list-item-checkbox, input\[type='checkbox'\]/);
  assert.match(source, /listItem\.matches\?\.\("\.task-list-item, \[data-task\], \[data-task-status\]"\)/);
  assert.match(source, /this\.markdownTaskCheckboxRect\(element, elementRect\)/);
  assert.match(source, /top \+= flowInsets\.top \* visualScale/);
  assert.match(source, /bottom -= flowInsets\.bottom \* visualScale/);
});

test("Markdown DOM replacement and async drops rebuild the selection frame", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const presentationSource = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  selectMarkdownBlock(", source.indexOf("  syncMarkdownBlockPresentation()")));
  const dragFinishSource = source.slice(source.indexOf("  finishSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag(", source.indexOf("  finishSelectedStrokeDrag(")));
  const snapshotSource = source.slice(source.indexOf("  captureSelectionFrameSnapshot("), source.indexOf("  noteFlowAppliedVerticalInsets(", source.indexOf("  captureSelectionFrameSnapshot(")));

  assert.match(presentationSource, /selectedElementChanged[\s\S]*previousMarkdownBlockElements\.get\(id\) !== next\.get\(id\)/);
  assert.match(presentationSource, /selectionFrameAwaitingMarkdownSync\?\.committed[\s\S]*captureSelectionFrameSnapshot\(\{ force: true \}\)/);
  assert.match(dragFinishSource, /selectionFrameAwaitingMarkdownSync = \{ committed: false \}/);
  assert.match(dragFinishSource, /commitDraggedMarkdownBlocks\([\s\S]*if \(!committed && this\.selectionFrameAwaitingMarkdownSync\)/);
  assert.match(snapshotSource, /selectionFrameAwaitingMarkdownSync && !this\.draggingStroke/);
});

test("NoteFlow release commits the exact candidate and boundary shown by the blue indicator", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const dragFinishSource = source.slice(source.indexOf("  finishSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag(", source.indexOf("  finishSelectedStrokeDrag(")));
  const placementSource = source.slice(source.indexOf("  updateDraggedNoteFlowPlacement("), source.indexOf("  captureNoteFlowAnchor(", source.indexOf("  updateDraggedNoteFlowPlacement(")));

  assert.match(dragFinishSource, /boundary: this\.dragNoteFlowPlacement\.boundary/);
  assert.match(dragFinishSource, /candidate: this\.dragNoteFlowPlacement\.candidate/);
  assert.match(dragFinishSource, /if \(!this\.dragNoteFlowPlacement\) \{\s*this\.updateDraggedNoteFlowPlacement/);
  assert.match(dragFinishSource, /const visibleDrop = this\.dragMarkdownDropTarget\?\.isConnected[\s\S]*captureMarkdownBlockDropTarget/);
  assert.match(placementSource, /const targetCanvasY =[\s\S]*const sourceCanvasY = flowBounds\.minY/);
  assert.doesNotMatch(placementSource, /sourceCanvasY[\s\S]*flowBounds\.maxY/);
  assert.match(source, /const anchorRect = anchor[\s\S]*noteFlowCandidateRect\(anchor, placementMode\)[\s\S]*placementMode === "inline" \? anchorRect\?\.top : side === "after" \? anchor\.bottom : anchor\.top/);
  assert.match(placementSource, /const candidate = placement\?\.candidate;[\s\S]*const exactCandidate = candidate/);
  assert.match(placementSource, /return exactCandidate \? \{[\s\S]*candidate: exactCandidate[\s\S]*\} : null/);
  assert.doesNotMatch(placementSource.slice(placementSource.indexOf("  resolveDraggedNoteFlowPlacement("), placementSource.indexOf("  snapDraggedSelectionToNoteFlowPlacement(")), /dragDropGeometrySnapshot|selectStoredNoteFlowAnchorCandidate/);
  assert.match(placementSource, /Number\.isFinite\(Number\(placement\?\.boundary\)\)/);
  assert.match(placementSource, /const boundary = horizontalSide[\s\S]*Number\.isFinite\(Number\(placement\.boundary\)\)/);
});

test("Markdown drag keeps preview geometry stable and defers layout work until drop", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const moveSource = source.slice(source.indexOf("  moveSelectedStroke("), source.indexOf("  finishSelectedStrokeDrag(", source.indexOf("  moveSelectedStroke(")));
  const commitSource = source.slice(source.indexOf("  async commitDraggedMarkdownBlocks("), source.indexOf("  updateDraggedElementGroupMembership(", source.indexOf("  async commitDraggedMarkdownBlocks(")));

  assert.match(moveSource, /const previewDx = hasDraggedNoteFlow \? dx : snappedDx/);
  assert.match(moveSource, /const previewDy = hasDraggedNoteFlow \? dy : snappedDy/);
  assert.match(moveSource, /queueMarkdownBlockDropTarget\(event\.clientX, event\.clientY\)/);
  assert.doesNotMatch(moveSource, /markdownNoteFlowCollisionShift|collisionDx|collisionDy|markdownDrag/);
  assert.match(commitSource, /const hasNoteFlow = this\.hasNoteFlowElements\(\);[\s\S]*scheduleNoteFlowLayout\(\{ operation: true, defer: true \}\)[\s\S]*scheduleMarkdownAnnotationRefresh\(\{ layout: hasNoteFlow, delay: 48, force: true \}\)/);
  assert.match(commitSource, /this\.scheduleResize\(\{ layout: false, measure: true \}\)/);
  assert.doesNotMatch(commitSource, /scheduleLayoutRefresh\(\{ settle: false \}\)/);
  assert.match(commitSource, /requestRender\(this\.selectionHasDomStrokes\(\) \? "interaction" : false\)/);
});

test("selection resize freezes pointer geometry and defers canvas measurement until release", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /this\.resizeSelectionPointerGeometry = this\.captureCanvasPointerGeometry\(\);/);
  assert.match(source, /this\.resizeSelectionStartClient = \{ x: event\.clientX, y: event\.clientY \};/);
  assert.match(source, /this\.resizeSelectionStartPoint = getSelectionResizeCorner\(bounds, handle\);/);
  assert.match(source, /const point = this\.resizeEventToPoint\(event\);/);
  assert.match(source, /resizeEventToPoint\(event\)[\s\S]*mapResizeClientDeltaToPoint\(event, \{[\s\S]*startClient,[\s\S]*corner,[\s\S]*geometry,[\s\S]*clientBounds: this\.resizeSelectionClientBounds/);
  assert.match(source, /this\.resizeSelectionPreviewBounds = scaleNormalizedBoundsFromAnchor\(bounds, anchor, scaleX, scaleY\);/);
  assert.match(source, /this\.resizingSelection && this\.resizeSelectionPreviewBounds/);
  assert.match(source, /const wantsMeasure = options\.measure !== false\s+&& !this\.resizingSelection/);
  assert.match(source, /this\.scheduleResize\(\{ layout: false, measure: true \}\);/);
});

test("Markdown resize does not turn NoteFlow padding into persistent blank space", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const resizeStart = source.indexOf("  startSelectedStrokeResize(");
  const resizeSource = source.slice(resizeStart, source.indexOf("  moveSelectedStrokeResize(", resizeStart));

  assert.match(resizeSource, /const naturalHeight = this\.markdownBlockNaturalHeight\(element\);/);
  assert.match(resizeSource, /const currentHeight = Math\.max\(\s*naturalHeight,\s*normalizeMarkdownBlockMinHeight\(block\.minHeight\)\s*\);/);
  assert.doesNotMatch(resizeSource, /Number\(element\?\.offsetHeight\)/);
});

test("blank-space selection resolves its NoteDraw owner before the pushed Markdown block", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const pointerSource = source.slice(source.indexOf("  onPointerDown(event"), source.indexOf("  onPointerMove(event", source.indexOf("  onPointerDown(event")));
  const blankHit = pointerSource.indexOf("findOwnedBlankSpaceStrokeAtClientPoint");
  const markdownHit = pointerSource.indexOf("hitStrokeIndex < 0 && markdownSelectionCandidate");

  assert.ok(blankHit >= 0 && markdownHit > blankHit);
  assert.match(source, /findOwnedBlankSpaceStrokeAtClientPoint\(clientX, clientY\)[\s\S]*selectOwnedBlankSpaceCandidate/);
  assert.match(source, /readingBottomOwnerStrokeIndex\(\)/);
  assert.match(source, /const surfaceRect = \(this\.layoutMeasureEl\?\.isConnected \? this\.layoutMeasureEl : this\.previewEl\)/);
  assert.match(source, /const ownerStrokeIndex = this\.findNoteFlowOwnerStrokeIndex\(record\)[\s\S]*ownerStrokeIndex,/);
  assert.match(source, /ownerId: strokeElementId\(item\.stroke\)/);
  const ownerSource = source.slice(source.indexOf("  findNoteFlowOwnerStrokeIndex("), source.indexOf("  readingBottomOwnerStrokeIndex("));
  assert.doesNotMatch(ownerSource, /fallbacks/);
  assert.match(styles, /\.notedraw-reading-bottom-spacer \{[\s\S]*width: 100%;[\s\S]*max-width: 100%;/);
});

test("Markdown editing and drop commits use the same visible target snapshot", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const dropSource = source.slice(source.indexOf("  captureMarkdownBlockDropTarget("), source.indexOf("  updateDraggedElementGroupMembership("));
  const editSource = source.slice(source.indexOf("  applyTextEditingFlowClip("), source.indexOf("  focusSourceEditorAt("));

  assert.match(source, /markdownElementVisibleClientRect\(element\)[\s\S]*trimMarkdownClientRect/);
  assert.match(source, /markdownElementContainsClientPoint\(element, clientPoint/);
  assert.match(source, /findStrokeAt\(point, clientPoint = null\)[\s\S]*clientPointInRect\(domRect, clientPoint\)/);
  assert.match(dropSource, /lockedTargetPromise[\s\S]*resolveSourceDropTarget/);
  assert.match(dropSource, /lockedMovingTargets[\s\S]*strictMoving: true/);
  assert.match(dropSource, /drop\.row \|\| this\.markdownDropRowMetrics/);
  assert.match(dropSource, /lockedTarget,[\s\S]*strictTarget: true,[\s\S]*targetText: drop\.targetText/);
  assert.doesNotMatch(dropSource, /targetInfo: getSourceInfo\(target\)/);
  assert.match(editSource, /--notedraw-editing-flow-top/);
  assert.match(editSource, /--notedraw-editing-flow-bottom/);
  assert.match(styles, /\.notedraw-editing\.notedraw-editing-flow-clipped[\s\S]*clip-path: inset/);
});

test("a missed Markdown drop restores document flow instead of creating a floating overlap", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const finishSource = source.slice(source.indexOf("  finishSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag(", source.indexOf("  finishSelectedStrokeDrag(")));
  const edgeSource = source.slice(source.indexOf("  applyDraggedEdgeInsertion("), source.indexOf("  selectRelatedElements(", source.indexOf("  applyDraggedEdgeInsertion(")));

  assert.match(finishSource, /if \(!markdownDrop\) \{\s*this\.updateDraggedFloatingMarkdownBlocks\(event, false\);\s*\}/);
  assert.doesNotMatch(finishSource, /updateDraggedFloatingMarkdownBlocks\(event, !markdownDrop\)/);
  assert.match(edgeSource, /const box = state\.block\.floating && state\.block\.floatBox \? state\.block\.floatBox : null/);
  assert.doesNotMatch(edgeSource, /currentBounds && normalizeMarkdownFloatBox/);
});

test("only legacy implicit floating collisions are docked automatically", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const presentationSource = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  selectMarkdownBlock(", source.indexOf("  syncMarkdownBlockPresentation()")));
  const floatingSource = source.slice(source.indexOf("  toggleSelectedFlowMode()"), source.indexOf("  noteFlowLayoutElement(", source.indexOf("  toggleSelectedFlowMode()")));

  assert.match(source, /floatingExplicit: Boolean\(block\?\.floatingExplicit\)/);
  assert.match(floatingSource, /block\.floating = true;\s*block\.floatingExplicit = true;/);
  assert.match(presentationSource, /if \(!block\.floating \|\| block\.floatingExplicit\) \{\s*continue;/);
  assert.match(presentationSource, /const visibleRects = hasImplicitFloating[\s\S]*this\.markdownElementVisibleClientRect\(element\)/);
  assert.match(presentationSource, /markdownClientRectsOverlap\(rect, visibleRects\.get\(otherId\)\)/);
  assert.match(presentationSource, /block\.floating = false;\s*block\.floatingExplicit = false;\s*block\.floatBox = null;/);
});

test("Markdown drop settlement remaps every rendered block and persists repaired source lines", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const annotationSource = source.slice(source.indexOf("  scheduleMarkdownAnnotationRefresh("), source.indexOf("  updateFloatingControlsPosition(", source.indexOf("  scheduleMarkdownAnnotationRefresh(")));
  const presentationSource = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  selectMarkdownBlock(", source.indexOf("  syncMarkdownBlockPresentation()")));

  assert.match(annotationSource, /options\.force === true/);
  assert.match(annotationSource, /this\.markdownAnnotationForce = this\.markdownAnnotationForce \|\| requestedForce/);
  assert.match(annotationSource, /const force = this\.markdownAnnotationForce \|\| this\.hasNoteFlowElements\(\)/);
  assert.match(annotationSource, /annotateRenderedMarkdownLines\([\s\S]*\{ force \}/);
  assert.match(annotationSource, /if \(force\) \{\s*this\.noteFlowMarkdownAnnotationComplete = true/);
  assert.match(source, /const sourceIndexes = new Map\([\s\S]*createMarkdownSourceIndex\(source\)/);
  assert.match(source, /resolveSourceDropTarget\(source, state\.sourceInfo, state\.sourceText, sourceIndex\)/);
  assert.match(presentationSource, /markdownMetadataChanged[\s\S]*block\.lineStart !== info\.lineStart[\s\S]*scheduleDrawingSave\(this\.file, this\.drawingData, \{ userOperation: true \}\)/);
});

test("Markdown selection and NoteFlow layout use complete rendered blocks instead of visual lines", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const concreteSource = source.slice(source.indexOf("function isConcreteMarkdownBlockElement("), source.indexOf("function findEditableTarget("));
  const presentationSource = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  selectMarkdownBlock(", source.indexOf("  syncMarkdownBlockPresentation()")));
  const candidateSource = source.slice(source.indexOf("  noteFlowCandidates()"), source.indexOf("  noteFlowTargetElement(", source.indexOf("  noteFlowCandidates()")));
  const edgeSource = source.slice(source.indexOf("  markdownEdgeDropTarget("), source.indexOf("  reorderMarkdownTextBlock(", source.indexOf("  markdownEdgeDropTarget(")));

  assert.match(concreteSource, /element\.matches\("\.callout-content"\)/);
  assert.match(concreteSource, /\.internal-embed, \.markdown-embed, \.markdown-embed-content/);
  assert.match(concreteSource, /!element\.querySelector\?\.\(MARKDOWN_TEXT_SELECTOR\)/);
  assert.match(presentationSource, /querySelectorAll\(EDITABLE_SELECTOR\)[\s\S]*isConcreteMarkdownBlockElement\(element\)/);
  assert.match(presentationSource, /connectedIds[\s\S]*selectedMarkdownBlockIds[\s\S]*invalidateSelectionFrameSnapshot/);
  assert.match(candidateSource, /querySelectorAll\?\.\("\[data-note-draw-line-start\]"\)/);
  assert.match(candidateSource, /querySelectorAll\?\.\("\[data-line\]"\)/);
  assert.match(candidateSource, /querySelectorAll\?\.\(NOTE_FLOW_RENDERED_OWNER_SELECTOR\)/);
  assert.match(candidateSource, /const owner = findNoteFlowMarkdownBlockElement\(sourceElement, this\.previewEl\)/);
  assert.match(candidateSource, /sourceElements\.add\(owner\)/);
  assert.match(candidateSource, /const canonical = sourceElement\.dataset\.noteDrawLineMapped === "true"/);
  assert.match(candidateSource, /if \(!canonical && !exactOwnDataLine\) \{\s*continue/);
  assert.match(candidateSource, /this\.markdownElementVisibleClientRect\(element\)[\s\S]*this\.noteFlowEmptyOwnerClientRect\(element\)/);
  assert.match(source, /const nextBlockTop = Array\.from\(element\.parentElement\?\.children \|\| \[\]\)/);
  assert.match(candidateSource, /grouped\.get\(element\)[\s\S]*existing\.start = Math\.min[\s\S]*existing\.end = Math\.max/);
  assert.match(candidateSource, /identityQuality > existing\.identityQuality[\s\S]*existing\.blockKey = noteFlowBlockKey\(existing\)/);
  assert.match(candidateSource, /!candidate\.element\.matches\?\.\("li"\)/);
  assert.match(candidateSource, /candidate\.element\.contains\?\.\(other\.element\)/);
  assert.doesNotMatch(candidateSource, /noteFlowInlineLineCandidates|noteFlowVisualLineCandidates|visualLine/);
  assert.match(edgeSource, /markdownEdgeDropTarget\(clientX, clientY[\s\S]*const intent = resolveDragDropHorizontalIntent/);
  assert.match(edgeSource, /forcedIntent = edgeTarget\?\.intent \|\| null/);
  assert.match(styles, /\.notedraw-text-sort-target-left \{[\s\S]*inset 4px 0 0/);
  assert.match(styles, /\.notedraw-text-sort-target-right \{[\s\S]*inset -4px 0 0/);
});

test("inherited section line metadata is remapped before NoteFlow drop targeting", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const annotationSource = source.slice(source.indexOf("function annotateVisibleMarkdownElements("), source.indexOf("function annotateEditableElements("));
  const candidateSource = source.slice(source.indexOf("  noteFlowCandidates()"), source.indexOf("  noteFlowTargetElement("));
  const anchorSource = source.slice(source.indexOf("  noteFlowAnchorElement("), source.indexOf("  noteFlowStoredRowCanvasY("));

  assert.match(annotationSource, /ownDataLine[\s\S]*inheritedDataLine[\s\S]*noteDrawDataLineInherited = "true"/);
  assert.match(annotationSource, /noteDrawDataLineInherited === "true"/);
  assert.match(source, /function applyRenderedMarkdownLineMetadata\(element, match\)[\s\S]*noteDrawLineMapped = "true"/);
  assert.match(annotationSource, /applyRenderedMarkdownLineMetadata\(element, match\)/);
  assert.match(candidateSource, /const inherited = sourceElement\.dataset\.noteDrawDataLineInherited === "true"[\s\S]*if \(inherited\)[\s\S]*blockOwnLine/);
  assert.match(candidateSource, /inheritedStart: parseInteger\(sourceElement\.dataset\.noteDrawInheritedLineStart\)/);
  assert.match(anchorSource, /semanticMatch[\s\S]*inheritedMatch/);
});

test("boxed groups have two-level selection, drag membership, and a non-obscuring fill layer", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /findBoxedElementGroupAtPoint\(point\)/);
  assert.match(source, /type: "enter-stroke-group"[\s\S]*groupId: hitGroupId/);
  assert.match(source, /type: "select-group"[\s\S]*groupId: boxedGroup\.id/);
  assert.match(source, /applyPendingSelectionTap\(pending\)[\s\S]*this\.enteredElementGroupIds\.add\(pending\.groupId\)[\s\S]*this\.selectElementGroup\(pending\.groupId\)/);
  assert.match(source, /updateDraggedElementGroupMembership\(event, movedIndexes/);
  assert.match(source, /item\.groupId = destination\.id/);
  assert.match(source, /item\.groupId = ""/);
  assert.match(source, /drawElementGroupBackgrounds\(\)/);
  assert.match(source, /this\.underlayCtx\.fillStyle = group\.backgroundColor/);
  assert.match(styles, /\.notedraw-md-block \{/);
  assert.match(styles, /isolation: isolate/);
  assert.match(styles, /pointer-events: none/);
});
