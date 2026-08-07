import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  markdownBlockPresentationMinHeight,
  normalizeMarkdownBlockMinHeight,
  normalizeMarkdownFloatBox,
  resizeMarkdownBlockMinHeight,
  resolveDragDropHorizontalIntent
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

  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 320 }), "line-start");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 500 }), "vertical");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 620 }), "vertical");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 640 }), "inline-right");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 640, horizontalRoom: false }), "vertical");
});

test("Markdown drag uses a left magnetic row drop and one move event chain", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /else if \(horizontalRoom && intent === "line-start"\) \{\s*side = "left";/);
  assert.match(source, /const row = this\.markdownDropRowMetrics\(nearest\.element, movingElements\);/);
  assert.doesNotMatch(source, /const onMove = \(moveEvent\) => \{/);
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
  }), 0);
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

  assert.match(source, /const markdownSelectionCandidate = this\.toolMode === TOOL_SELECT \? this\.markdownBlockElementForTarget\(target\) : null;/);
  assert.match(source, /const marked = target\.closest\?\.\("\.notedraw-md-block"\);/);
  assert.match(source, /const blockElement = element\?\.closest\?\.\("\.notedraw-md-block"\) \|\| element;/);
  assert.doesNotMatch(source, /this\.toolMode === TOOL_SELECT && this\.markdownBlockRecords\(\)\.length > 0/);
});

test("Markdown selection resize hits both the outer frame and the content corner", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /const rects = \[frame\];/);
  assert.match(source, /const contentBounds = this\.getSelectedStrokeBounds\(\);/);
  assert.match(source, /const hitRadius = Math\.max\(SELECT_RESIZE_HANDLE_HIT_RADIUS, this\.selectionHitPaddingPx\(\) \+ 6\);/);
  assert.match(source, /block\.minHeight = resizeMarkdownBlockMinHeight\(\{/);
  assert.match(source, /state\.block\.minHeight = state\.minHeight/);
  assert.match(source, /minHeight: normalizeMarkdownBlockMinHeight\(block\?\.minHeight\)/);
  assert.match(source, /this\.applyMarkdownBlockHeightPresentation\(block, element\)/);
  assert.match(styles, /data-note-draw-resized-height="true"[\s\S]*min-height: var\(--notedraw-md-min-height\)/);
});

test("selection resize freezes pointer geometry and defers canvas measurement until release", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /this\.resizeSelectionPointerGeometry = this\.captureCanvasPointerGeometry\(\);/);
  assert.match(source, /this\.eventToPoint\(event, this\.resizeSelectionPointerGeometry\)/);
  assert.match(source, /const wantsMeasure = options\.measure !== false\s+&& !this\.resizingSelection/);
  assert.match(source, /this\.scheduleResize\(\{ layout: false, measure: true \}\);/);
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
  assert.match(source, /ownerStrokeIndex: this\.findNoteFlowOwnerStrokeIndex\(record\)/);
  assert.match(source, /ownerId: strokeElementId\(item\.stroke\)/);
  assert.match(styles, /\.notedraw-reading-bottom-spacer \{[\s\S]*width: 100%;[\s\S]*max-width: 100%;/);
});

test("Markdown selection and NoteFlow layout use concrete blocks instead of embed parents or visual lines", async () => {
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
  assert.match(candidateSource, /!isConcreteMarkdownBlockElement\(sourceElement\)/);
  assert.match(candidateSource, /grouped\.get\(element\)[\s\S]*existing\.start = Math\.min[\s\S]*existing\.end = Math\.max/);
  assert.doesNotMatch(candidateSource, /noteFlowInlineLineCandidates|noteFlowVisualLineCandidates|visualLine/);
  assert.match(edgeSource, /markdownEdgeDropTarget\(clientX, clientY[\s\S]*const intent = resolveDragDropHorizontalIntent/);
  assert.match(edgeSource, /forcedIntent = edgeTarget\?\.intent \|\| null/);
  assert.match(styles, /\.notedraw-text-sort-target-left \{[\s\S]*inset 4px 0 0/);
  assert.match(styles, /\.notedraw-text-sort-target-right \{[\s\S]*inset -4px 0 0/);
});

test("boxed groups have two-level selection, drag membership, and a non-obscuring fill layer", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /findBoxedElementGroupAtPoint\(point\)/);
  assert.match(source, /this\.enteredElementGroupIds\.add\(hitGroupId\)/);
  assert.match(source, /selectElementGroup\(boxedGroup\.id\)/);
  assert.match(source, /updateDraggedElementGroupMembership\(event, movedIndexes/);
  assert.match(source, /item\.groupId = destination\.id/);
  assert.match(source, /item\.groupId = ""/);
  assert.match(source, /drawElementGroupBackgrounds\(\)/);
  assert.match(source, /this\.underlayCtx\.fillStyle = group\.backgroundColor/);
  assert.match(styles, /\.notedraw-md-block \{/);
  assert.match(styles, /isolation: isolate/);
  assert.match(styles, /pointer-events: none/);
});
