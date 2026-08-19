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
import { dedupeMarkdownBlockRecords } from "../src/markdown-block-records.mjs";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("Markdown block records keep one canonical owner per source range", () => {
  const records = dedupeMarkdownBlockRecords([
    {
      id: "callout-inner",
      path: "note.md",
      lineStart: 100,
      lineEnd: 100,
      textHint: "This is a note.",
      span: 11,
      widthScale: 0.4,
      minHeight: 20,
      contentOpacity: 0.8,
      contentScale: 1,
      explicitLineGroup: ""
    },
    {
      id: "callout-owner",
      path: "note.md",
      lineStart: 100,
      lineEnd: 100,
      textHint: "Note\nThis is a note.",
      span: 12,
      widthScale: 1,
      minHeight: 40,
      contentOpacity: 1,
      contentScale: 1.2,
      explicitLineGroup: ""
    }
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].id, "callout-inner");
  assert.equal(records[0].textHint, "This is a note.");
  assert.equal(records[0].span, 11);
  assert.equal(records[0].widthScale, 0.4);
  assert.equal(records[0].minHeight, 40);
  assert.equal(records[0].contentScale, 1.2);
});

test("Markdown block dedupe preserves a parallel layout against a re-rendered default owner", () => {
  const records = dedupeMarkdownBlockRecords([
    {
      id: "parallel-task",
      path: "note.md",
      lineStart: 20,
      lineEnd: 20,
      textHint: "- [ ] Parallel task",
      span: 4,
      widthScale: 1,
      minHeight: 72,
      noteFlowAutoSpan: false
    },
    {
      id: "fresh-default-owner",
      path: "note.md",
      lineStart: 20,
      lineEnd: 20,
      textHint: "Parallel task",
      span: 12,
      widthScale: 1,
      minHeight: 24,
      noteFlowAutoSpan: false
    }
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].span, 4);
  assert.equal(records[0].widthScale, 1);
  assert.equal(records[0].minHeight, 72);
});

test("reading view repairs NoteFlow once without activating the toolbar", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const load = source.slice(source.indexOf("  async ensureDrawingsLoaded()"), source.indexOf("  updateDrawingsVisibility("));
  const repair = source.slice(source.indexOf("  async prepareNoteFlowForReading()"), source.indexOf("  syncCurrentBrushFields()"));
  const layout = source.slice(source.indexOf("  applyNoteFlowLayout()"), source.indexOf("  markNoteFlowLayoutMutation()"));

  assert.match(load, /!this\.active && this\.hasNoteFlowElements\(\)[\s\S]*await this\.prepareNoteFlowForReading\(\)/);
  assert.match(repair, /this\.active[\s\S]*this\.noteFlowReadingRepairAttempted[\s\S]*annotateRenderedMarkdownLines[\s\S]*this\.applyNoteFlowLayout\(\)[\s\S]*this\.restoreFrozenNoteFlowLayout\(\)/);
  assert.match(repair, /finally \{[\s\S]*this\.noteFlowReadingRepairPending = false;[\s\S]*this\.noteFlowOperationPending = false;/);
  assert.match(layout, /\|\| this\.noteFlowReadingRepairPending/);
});

test("a user-resized Markdown block keeps its full reserved selection bounds", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const bounds = source.slice(source.indexOf("  markdownElementCanvasBounds("), source.indexOf("  getStrokeIndexesBounds("));

  assert.match(bounds, /const includesReservedHeight = element\.hasAttribute\("data-note-draw-resized-height"\)/);
  assert.match(bounds, /if \(includesReservedHeight\) \{[\s\S]*left = visibleRect\.left;[\s\S]*right = visibleRect\.right;[\s\S]*top = visibleRect\.top;[\s\S]*bottom = visibleRect\.bottom;/);
});

test("Markdown block record repair removes a repeated line-zero alias but preserves distinct groups", () => {
  const records = dedupeMarkdownBlockRecords([
    {
      id: "footnote",
      path: "note.md",
      lineStart: 104,
      lineEnd: 104,
      textHint: "Footnote reference.",
      explicitLineGroup: ""
    },
    {
      id: "stale-footnote",
      path: "note.md",
      lineStart: 0,
      lineEnd: 0,
      textHint: "Footnote reference.\nFootnote reference.\nFootnote reference.",
      explicitLineGroup: ""
    },
    {
      id: "line-a",
      path: "note.md",
      lineStart: 12,
      lineEnd: 12,
      textHint: "A",
      explicitLineGroup: "note.md\0" + "12\0" + "13\0a"
    },
    {
      id: "line-b",
      path: "note.md",
      lineStart: 12,
      lineEnd: 12,
      textHint: "B",
      explicitLineGroup: "note.md\0" + "12\0" + "13\0b"
    }
  ]);

  assert.deepEqual(records.map((record) => record.id), ["footnote", "line-a", "line-b"]);
});

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
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 499 }), "vertical");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 500 }), "inline-right");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 620 }), "inline-right");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 639, rightIntentRatio: 0.64 }), "vertical");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 640, rightIntentRatio: 0.64 }), "inline-right");
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
  assert.match(presentation, /return isNoteFlowCollectionBlock\(container\) \? null : container/);
  assert.match(presentation, /const gridContainer = this\.ensureMarkdownBlockGridRow\(block, element\)[\s\S]*this\.markdownBlockGridContainer\(element\)/);
  assert.match(presentation, /flowElement\.classList\.toggle\("notedraw-md-grid-item", Boolean\(gridContainer\)\)/);
  assert.match(presentation, /flowElement\.style\.gridColumn = `span/);
  assert.match(presentation, /markdownBlockGridContainer\(element\)/);
  assert.match(styles, /\.notedraw-md-grid > \.notedraw-md-grid-item/);
  assert.doesNotMatch(styles, /@container \(max-width: 520px\)[\s\S]*grid-column: 1 \/ -1 !important/);
  assert.match(drop, /this\.draggedNoteFlowIndexes\(\)\.length > 0 \|\| this\.draggedNoteFlowMarkdownStates\(\)\.length > 0/);
  assert.match(drop, /syncMarkdownDropFromNoteFlowPlacement\(this\.dragNoteFlowPlacement\)/);
  assert.match(drop, /prepareMarkdownAnchorForInlineNoteFlow\(placement\)/);
  assert.match(source, /const movingItemCount = Math\.max\(1, movingMarkdownCount \+ movingStrokeCount\)[\s\S]*const totalCount = orderedMemberIds\.length \+ movingItemCount/);
});

test("all Markdown block types use stable inline lanes inside renderer-owned collections", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const rows = source.slice(source.indexOf("  isOwnedMarkdownGridRow("), source.indexOf("  findMarkdownBlockRecordForElement("));
  const preview = source.slice(source.indexOf("  applyDraggedNoteFlowAnchorDomPreview("), source.indexOf("  restoreDraggedNoteFlowLivePreview("));

  assert.match(rows, /markdownBlockInlineLane\(element\)/);
  assert.match(rows, /while \(container && this\.previewEl\?\.contains\?\.\(container\)\)/);
  assert.match(rows, /\.markdown-preview-section,\.markdown-rendered,\.callout-content,\.contains-task-list,ul,ol,\.el-ul,\.el-ol/);
  assert.match(rows, /markdownBlockLayoutLane\(element\)/);
  assert.match(rows, /notedraw-md-grid-row/);
  assert.match(rows, /if \(!isNoteFlowCollectionBlock\(current\)\) \{\s*return current/);
  assert.match(rows, /current\.insertBefore\(row, flowElement\)/);
  assert.match(rows, /previousRow \|\| nextRow/);
  assert.match(preview, /const allocation = this\.markdownInlineRowAllocation\(drop\?\.row, targetBlock, moving, drop\?\.side\)[\s\S]*applyDraggedMarkdownInlinePresentation\(target, targetSpan\)[\s\S]*ensureMarkdownBlockGridRow\(\{ \.\.\.targetBlock, span: targetSpan \}, target, \{ preview: true \}\)/);
  assert.match(preview, /markdownInlineRowSpan\(allocation, state\.block\?\.id[\s\S]*applyDraggedMarkdownInlinePresentation\(dragElement, span\)/);
  assert.match(source, /canonicalMarkdownFlowTarget\(rawTarget\)[\s\S]*this\.markdownBlockElement\(block\)[\s\S]*candidate\.closest\?\.\("\.notedraw-md-block"\)/);
  assert.match(source, /applyDraggedNoteFlowAnchorDomPreview\(placement, drop = null\)[\s\S]*this\.canonicalMarkdownFlowTarget\(rawTarget\)/);
  assert.match(source, /syncMarkdownDropFromNoteFlowPlacement\(placement\)[\s\S]*this\.canonicalMarkdownFlowTarget\(rawTarget\)/);
  assert.match(source, /prepareMarkdownAnchorForInlineNoteFlow\(placement\)[\s\S]*this\.canonicalMarkdownFlowTarget\(rawTarget\)/);
  assert.match(source, /noteFlowCandidateByMarkdownId = [\s\S]*this\.canonicalMarkdownFlowTarget\(rawTarget\)[\s\S]*noteFlowCandidateByMarkdownId\.set\(blockId, \{ candidate, area \}\)/);
  assert.match(source, /let directMarkdownEntry = null;[\s\S]*for \(const entry of geometry\?\.markdownCandidates \|\| \[\]\)[\s\S]*area < directMarkdownArea[\s\S]*directNoteFlowCandidate = directMarkdownBlock\?\.id[\s\S]*placement = \{\s*candidate: directNoteFlowCandidate/);
  assert.doesNotMatch(source, /markdownCandidates[\s\S]{0,200}\.filter\([\s\S]{0,200}\.sort\(/);
  assert.match(styles, /\.notedraw-md-grid-row \{/);
  assert.match(styles, /\.notedraw-md-inline-grid-item \{/);

  for (const kind of ["h1", "h2", "h3", "paragraph", "task", "link", "image", "embed"]) {
    assert.equal(resolveDragDropHorizontalIntent({
      clientX: 760,
      targetLeft: 120,
      targetRight: 520,
      laneLeft: 100,
      laneRight: 900,
      horizontalRoom: true,
      kind
    }), "inline-right");
  }
});

test("reading-view NoteFlow alignment keeps note-pen overlap groups intact", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const alignment = source.slice(source.indexOf("  alignNoteFlowStrokesToReservedRows("), source.indexOf("  scheduleNoteFlowLayout(", source.indexOf("  alignNoteFlowStrokesToReservedRows(")));

  assert.match(alignment, /const inlineItems = targets\.filter\(\(target\) => target\.placementMode === "inline"\)/);
  assert.match(alignment, /overlapGroup: isNoteFlowInkStroke\(target\.stroke\) \? `ink:\$\{target\.rowKey\}` : ""/);
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
  assert.match(source, /const compactedRecords = dedupeMarkdownBlockRecords\(currentRecords\)[\s\S]*compactedRecords\.length < currentRecords\.length[\s\S]*this\.drawingData\.markdownBlocks = compactedRecords/);
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

test("rendered thematic breaks use a stable semantic drag identity", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /element\?\.matches\?\.\("hr,\.el-hr"\)[\s\S]*sourceText: "---"/);
});

test("third-party virtual-link decorations never become Markdown drag identity", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /\.multiple-files-indicator,\.multiple-files-references/);
  assert.match(source, /identityClone\.querySelectorAll\([\s\S]*decoration\.remove\(\)/);
  assert.match(source, /text = identityClone\.textContent \|\| text/);
});

test("selecting Markdown blocks does not trigger a whole-note responsive reflow", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const markdownSelectionCandidate = this\.toolMode === TOOL_SELECT \? this\.markdownBlockElementForTarget\(target, clientPoint\) : null;/);
  assert.match(source, /const marked = target\.closest\?\.\("\.notedraw-md-block"\);/);
  assert.match(source, /const blockElement = element\?\.matches\?\.\("\.notedraw-md-line-block"\)[\s\S]*closest\?\.\("\.notedraw-md-line-block"\)/);
  assert.doesNotMatch(source, /this\.toolMode === TOOL_SELECT && this\.markdownBlockRecords\(\)\.length > 0/);
});

test("explicit Markdown line breaks become independent NoteFlow blocks without changing source text", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const explicit = source.slice(source.indexOf("  ensureExplicitMarkdownLineBlocks()"), source.indexOf("  isOwnedMarkdownGridRow(", source.indexOf("  ensureExplicitMarkdownLineBlocks()")));

  assert.match(explicit, /querySelectorAll\?\.\("p"\)/);
  assert.match(explicit, /node\.nodeName === "BR"/);
  assert.match(explicit, /className = "notedraw-md-line-block"/);
  assert.match(explicit, /paragraph\.replaceChildren\(\.\.\.wrappers\)/);
  assert.match(explicit, /restoreExplicitMarkdownLineBlocks\(\)/);
  assert.match(source, /explicitLineGroup: typeof block\?\.explicitLineGroup === "string"/);
  assert.match(styles, /\.notedraw-md-line-block \{[\s\S]*overflow-anchor: none/);
});

test("NoteFlow release keeps browser scroll anchoring disabled through async settlement", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const drag = source.slice(source.indexOf("  finishSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag(", source.indexOf("  finishSelectedStrokeDrag(")));
  const resize = source.slice(source.indexOf("  finishSelectedStrokeResize("), source.indexOf("  resetSelectedElementsToBestFit(", source.indexOf("  finishSelectedStrokeResize(")));

  assert.match(drag, /if \(didMove\) \{\s*this\.beginNoteFlowScrollStability\(\);/);
  assert.match(resize, /if \(this\.resizeSelectionMoved\) \{\s*this\.beginNoteFlowScrollStability\(\);/);
  assert.match(source, /this\.previewEl\.addClass\("is-note-flow-settling"\)/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*endNoteFlowScrollStability\(\);[\s\S]*\}, 900\)/);
  assert.match(styles, /\.notedraw-shell\.is-note-flow-settling \.markdown-preview-sizer \{[\s\S]*overflow-anchor: none/);
});

test("restored files never rebind stale Markdown records by line number", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const sync = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  selectMarkdownBlock(", source.indexOf("  syncMarkdownBlockPresentation()")));
  const normalize = source.slice(source.indexOf("function parseExplicitMarkdownLineGroup"), source.indexOf("function normalizeMarkdownBlockWidthScale"));

  assert.match(sync, /const identityMatches = \(block, element\)/);
  assert.match(sync, /return hint === normalizeRenderedText\(block\.textHint\)/);
  assert.doesNotMatch(sync, /takeUnused\(lineCandidates\.get\(lineKey\)/);
  assert.doesNotMatch(sync, /hintRelated = Boolean/);
  assert.match(normalize, /parseExplicitMarkdownLineGroup\(normalized\.explicitLineGroup\)/);
  assert.match(normalize, /lineStart < explicit\.start/);
  assert.match(source, /sourceRevisionMismatch = Boolean\(selected &&/);
  assert.match(source, /_notedrawSourceRevisionMismatch/);
  assert.match(styles, /\.notedraw-shell \.markdown-preview-sizer \{[\s\S]*overflow-anchor: none/);
});

test("parallel Markdown preview measures the full content lane before deciding column capacity", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const metrics = source.slice(source.indexOf("  markdownDropRowMetrics("), source.indexOf("  async commitDraggedMarkdownBlocks(", source.indexOf("  markdownDropRowMetrics(")));

  assert.match(metrics, /const laneWidth = geometry\?\.laneRect[\s\S]*Number\(geometry\.laneRect\.right\) - Number\(geometry\.laneRect\.left\)/);
  assert.match(metrics, /const measuredLaneWidth = this\.dragContentLaneRect[\s\S]*this\.layoutMeasureEl\?\.clientWidth/);
  assert.match(metrics, /const availableWidth = Number\(parent\?\.clientWidth\)[\s\S]*laneWidth[\s\S]*measuredLaneWidth[\s\S]*Number\(targetRect\?\.width\)/);
  assert.match(source, /applyDraggedMarkdownDomPreview\(drop\)/);
});

test("ordinary Markdown dragging applies a reversible DOM preview on each target change", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const queue = source.slice(source.indexOf("  queueMarkdownBlockDropTarget("), source.indexOf("  dragDropScrollKey(", source.indexOf("  queueMarkdownBlockDropTarget(")));

  assert.match(queue, /const previousKey = this\.dragMarkdownDomPreviewKey/);
  assert.match(queue, /const drop = this\.updateMarkdownBlockDropTarget\(pendingX, pendingY\)/);
  assert.match(queue, /if \(this\.dragNoteFlowDomPreview\) \{\s*this\.restoreDraggedNoteFlowDomPreview\(\);/);
  assert.match(queue, /this\.applyDraggedMarkdownDomPreview\(drop\)/);
  assert.match(queue, /this\.dragMarkdownDomPreviewKey = nextKey/);
  assert.match(source, /refreshMarkdownBlockPresentation\(blockIds = this\.selectedMarkdownBlockIds\)[\s\S]*this\.draggingStroke && this\.dragNoteFlowDomPreview && !this\.allowMarkdownPresentationDuringDrag/);
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
  assert.match(styles, /data-note-draw-resized-height\][\s\S]*min-height: var\(--notedraw-md-min-height\)/);
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
  assert.match(source, /const canBecomeElementDrag = \[[\s\S]*"edit-markdown-or-drag"[\s\S]*selectedDragActivationDistancePx\(event\.pointerType\)[\s\S]*this\.startSelectedStrokeDrag\(event, pending\.startPoint \|\| this\.eventToPoint\(event\), pending\.index \?\? -1[\s\S]*startClient: pending\.startClient[\s\S]*this\.moveSelectedStroke\(event\)/);
  assert.match(pointerSource, /const selectionActivated = this\.markdownSelectionCanEditOrDrag\(existing, markdownSelectionCandidate\)/);
  assert.match(pointerSource, /!wasSelected \|\| !selectionActivated/);
  assert.match(source, /activateMarkdownSelection\(block, element\)[\s\S]*captureSelectionFrameSnapshot\(\{ force: true \}\)[\s\S]*selectionKey: this\.selectionStateKey\(\)/);
  assert.match(source, /markdownSelectionCanEditOrDrag\(block, element\)[\s\S]*activation\.element === selectedElement[\s\S]*this\.selectionFrameSnapshot\?\.key === activation\.selectionKey/);
  assert.match(source, /startTextEdit\(pending\.editable \|\| pending\.element, pending\.clientPoint \|\| null\)/);
  assert.match(tapSource, /const applied = this\.applyPendingSelectionTap\(pending\);[\s\S]*pending\.type !== "edit-markdown-or-drag" \|\| applied === false/);
  assert.match(editSource, /!element\?\.isConnected[\s\S]*findMarkdownBlockRecordForElement\(element\)[\s\S]*markdownBlockElement\(block\)/);
  assert.match(editSource, /return true;\s*}\s*this\.endTextEdit\(\)/);
  assert.match(editSource, /element\.addEventListener\("blur", onBlur\);\s*return true;/);
});

test("parallel reading mutations preserve exact widths and move the shared selection boundary left", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const mutationSource = source.slice(source.indexOf("  rememberMarkdownIdentityMutation("), source.indexOf("  rememberTextTap(", source.indexOf("  rememberMarkdownIdentityMutation(")));
  const boundarySource = source.slice(source.indexOf("  markdownInlineSelectionClientLimits("), source.indexOf("  selectedMarkdownInlineFrameLimitsCanvas(", source.indexOf("  markdownInlineSelectionClientLimits(")));
  const rowCommitSource = source.slice(source.indexOf("  async commitDraggedMarkdownBlocks("), source.indexOf("  updateDraggedElementGroupMembership(", source.indexOf("  async commitDraggedMarkdownBlocks(")));

  assert.match(source, /INLINE_SELECTION_BOUNDARY_BIAS_PX = 4/);
  assert.match(boundarySource, /const boundary = midpoint - INLINE_SELECTION_BOUNDARY_BIAS_PX/g);
  assert.match(mutationSource, /directTarget === this\.canvas[\s\S]*this\.elementBelowCanvas/);
  assert.match(mutationSource, /const freshInfo = getSourceInfo\(freshElement\)[\s\S]*block\.lineStart = freshInfo\.lineStart[\s\S]*block\.textHint = freshHint/);
  assert.match(rowCommitSource, /if \(Number\(block\.span\) !== Number\(nextSpan\)\) \{\s*block\.widthScale = 1;[\s\S]*block\.span = nextSpan/);
  assert.match(source, /function markdownInlineWidthCss\(span, widthScale = 1, element = null\)[\s\S]*element\?\.matches\?\.\("li"\) \? INLINE_NOTE_FLOW_LIST_GAP_PX/);
  assert.match(styles, /width: var\(--notedraw-md-inline-width/);
});

test("task rows above the canvas still route their first pointer tap through NoteDraw selection", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const directPointerSource = source.slice(source.indexOf("  onPreviewSecondPointerDown("), source.indexOf("  isReadingPreviewGesture(", source.indexOf("  onPreviewSecondPointerDown(")));
  const finishSource = source.slice(source.indexOf("  onDocumentPointerFinish("), source.indexOf("  projectStrokePointsForLayoutRepair(", source.indexOf("  onDocumentPointerFinish(")));
  const clickSource = source.slice(source.indexOf("  onReadingClick("), source.indexOf("  canZoomReadingSurface(", source.indexOf("  onReadingClick(")));

  assert.match(directPointerSource, /directTaskBlock[\s\S]*this\.toolMode === TOOL_SELECT[\s\S]*this\.directMarkdownPointerId = event\.pointerId[\s\S]*this\.directMarkdownPointerElement = directTaskBlock[\s\S]*this\.onPointerDown\(event, true\)/);
  assert.match(finishSource, /this\.directMarkdownPointerId === event\.pointerId[\s\S]*this\.onPointerUp\(event\)[\s\S]*this\.directMarkdownPointerElement = null/);
  assert.match(source, /const target = this\.directMarkdownPointerId === event\.pointerId && this\.directMarkdownPointerElement\?\.isConnected[\s\S]*this\.directMarkdownPointerElement[\s\S]*this\.elementBelowCanvas/);
  assert.match(clickSource, /Date\.now\(\) <= this\.directMarkdownTaskClickUntil[\s\S]*li\.task-list-item[\s\S]*stopImmediatePropagation/);
});

test("long press opens the element menu without falling through to edit", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const longPressSource = source.slice(source.indexOf("  startSelectionLongPress("), source.indexOf("  clearSelectionLongPress("));
  const pointerUpSource = source.slice(source.indexOf("  onPointerUp(event"), source.indexOf("  finishPointerInteraction(", source.indexOf("  onPointerUp(event")));

  assert.match(source, /startPendingSelectionTap\(event, action\)[\s\S]*this\.startSelectionLongPress\(event, \{ pendingAction: action \}\)/);
  assert.match(longPressSource, /this\.selectionLongPressConsumedPointerId = state\.pointerId/);
  assert.match(longPressSource, /\["select-stroke", "select-markdown", "select-group"\]\.includes\(state\.pendingAction\.type\)[\s\S]*this\.applyPendingSelectionTap\(state\.pendingAction\)/);
  assert.match(longPressSource, /this\.pendingSelectionTap = null[\s\S]*this\.showSelectionMenu\(state\.client\)/);
  assert.match(pointerUpSource, /this\.selectionLongPressConsumedPointerId === event\.pointerId[\s\S]*this\.cancelPendingSelectionTap\(\)[\s\S]*return;/);
  assert.doesNotMatch(longPressSource, /startTextEdit|editFloatingTextStroke/);
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

test("NoteFlow dragging previews the same snapped and packed placement committed on release", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const dragSource = source.slice(source.indexOf("  startSelectedStrokeDrag("), source.indexOf("  startSelectedStrokeResize("));
  const moveSource = dragSource.slice(dragSource.indexOf("  moveSelectedStroke("), dragSource.indexOf("  finishSelectedStrokeDrag("));
  const finishSource = dragSource.slice(dragSource.indexOf("  finishSelectedStrokeDrag("), dragSource.indexOf("  cancelSelectedStrokeDrag("));
  const livePreviewSource = source.slice(source.indexOf("  applyDraggedNoteFlowLivePreview("), source.indexOf("  draggedNoteFlowIndexes("));
  const domPreviewSource = source.slice(source.indexOf("  rememberDraggedNoteFlowDomStyle("), source.indexOf("  applyDraggedNoteFlowLivePreview("));
  const placementSource = source.slice(source.indexOf("  updateDraggedNoteFlowPlacement("), source.indexOf("  syncMarkdownDropFromNoteFlowPlacement("));
  const geometrySource = source.slice(source.indexOf("  dragDropGeometrySnapshot("), source.indexOf("  markdownEdgeDropTarget("));
  const reflowSource = source.slice(source.indexOf("  reflowNoteFlowElementsAfterDrag("), source.indexOf("  queueDraggedNoteFlowRefresh("));
  const rowMetricsSource = source.slice(source.indexOf("  markdownDropRowMetrics("), source.indexOf("  async commitDraggedMarkdownBlocks("));

  assert.match(dragSource, /this\.dragNoteFlowOriginalBounds = new Map\(movableIndexes\.flatMap/);
  assert.match(moveSource, /const dragUsesNoteFlowPlacement = this\.usesDraggedNoteFlowPlacement\(\)[\s\S]*const dragEvent = coalescedEvents\[coalescedEvents\.length - 1\] \|\| event[\s\S]*this\.captureDraggedNoteFlowRawPreview\(\);/);
  assert.match(moveSource, /this\.applyDraggedNoteFlowPlacementFrame\(dragEvent\.clientX, dragEvent\.clientY\)/);
  assert.doesNotMatch(moveSource, /smoothDraggedClientEvent|queueDraggedNoteFlowPlacement/);
  assert.match(moveSource, /const hasDraggedNoteFlow = Boolean\(this\.dragNoteFlowOriginalBounds\?\.size\)/);
  assert.match(moveSource, /const previewDx = hasDraggedNoteFlow \? dx : snappedDx/);
  assert.match(moveSource, /const previewDy = hasDraggedNoteFlow \? dy : snappedDy/);
  assert.match(moveSource, /const usesNoteFlowPlacement = this\.usesDraggedNoteFlowPlacement\(\);[\s\S]*const floating = Boolean\(state\.block\?\.floating\);[\s\S]*"--notedraw-md-drag-x": floating \|\| !usesNoteFlowPlacement \? \`\$\{Math\.round\(clientDx\)\}px\` : "0px"/);
  assert.match(placementSource, /this\.refreshDraggedNoteFlowPreviewCandidate\(previousPlacement\.candidate\)\s*\|\|\s*previousPlacement\.candidate/);
  assert.match(placementSource, /this\.applyDraggedNoteFlowLivePreview\(this\.dragNoteFlowPlacement, \{ skipRestore: true, drop \}\)/);
  assert.doesNotMatch(placementSource, /this\.dragNoteFlowLastAppliedPlacement = this\.dragNoteFlowPlacement;/);
  assert.match(placementSource, /const targetChanged = previous\?\.candidate\?\.sourceElement !== flowTarget[\s\S]*const boundaryJitter = [\s\S]*const presentationChanged = targetChanged \|\| boundaryJitter \|\| previous\?\.flowOrder !== flowOrder/);
  assert.match(placementSource, /const previousRect = this\.noteFlowCandidateRect\(previousPlacement\.candidate, "inline"\)/);
  assert.doesNotMatch(placementSource, /debounceZone|dragNoteFlowRebuildSince/);
  assert.match(placementSource, /const inlineRow = this\.markdownDropRowMetrics\(inlineTarget, movingElements\)[\s\S]*const equalLaneWidth = Math\.max\([\s\S]*MIN_INLINE_NOTE_FLOW_ITEM_WIDTH_PX[\s\S]*inlineRow\.totalCount[\s\S]*const inlineEdgeBand = clamp\(targetHeight \* 0\.10, 2, 6\)[\s\S]*const inlineCaptureBand = clamp\(targetHeight \* 0\.85, 28, 72\)[\s\S]*const sameInlineCandidate[\s\S]*const inlineRowHit = sameInlineCandidate[\s\S]*targetRect\.top - inlineCaptureBand[\s\S]*targetRect\.bottom \+ inlineCaptureBand[\s\S]*const horizontalRoom = inlineRowHit[\s\S]*inlineRow\.canFit/);
  assert.doesNotMatch(placementSource, /rightIntentRatio:/);
  assert.match(placementSource, /const horizontalSide = intent === "inline-right" \? "right"[\s\S]*: keptPreviousInline[\s\S]*\? previousPlacement\.horizontalSide[\s\S]*: null/);
  assert.match(dragSource, /createComment\("notedraw-note-flow-drag-origin"\)[\s\S]*state\.domMarker = marker/);
  assert.match(livePreviewSource, /this\.restoreDraggedNoteFlowLivePreview\(\)[\s\S]*applyDraggedNoteFlowAnchorDomPreview\(resolved, drop\)[\s\S]*applyDraggedMarkdownDomPreview\(drop\)[\s\S]*applyDraggedNoteFlowReservationPreview\(liveResolved, movedIndexes, rowExtent\)/);
  assert.match(livePreviewSource, /const previousApplied = this\.dragNoteFlowLastAppliedPlacement[\s\S]*const previewStructureChanged = [\s\S]*previousApplied\.horizontalSide !== placement\.horizontalSide[\s\S]*previousApplied\.side !== placement\.side[\s\S]*previousApplied\.flowOrder !== placement\.flowOrder[\s\S]*const reuseAppliedPreview = options\.skipRestore === true[\s\S]*restoreDraggedNoteFlowLivePreview\(\)/);
  assert.doesNotMatch(livePreviewSource.slice(0, livePreviewSource.indexOf("const reuseAppliedPreview")), /inlineBoundary|placement\.boundary/);
  assert.match(livePreviewSource, /if \(reuseAppliedPreview\) \{[\s\S]*resolveDraggedNoteFlowPlacement\(previousApplied, movedIndexes\)[\s\S]*snapDraggedSelectionToNoteFlowPlacement\(stableResolved, movedIndexes\)[\s\S]*dragNoteFlowLastAppliedPlacement = previousApplied;[\s\S]*return movedIndexes;/);
  assert.match(livePreviewSource, /this\.dragNoteFlowLastAppliedPlacement = \{[\s\S]*\.\.\.liveResolved,[\s\S]*previewCandidates,[\s\S]*previewRowOffsets: this\.captureDraggedNoteFlowPreviewRowOffsets/);
  assert.match(livePreviewSource, /const liveResolved = this\.remeasureDraggedNoteFlowPlacement\(resolved\)[\s\S]*snapDraggedSelectionToNoteFlowPlacement\(liveResolved, movedIndexes\)[\s\S]*dragDropGeometrySnapshot\(\)\?\.noteFlowCandidates[\s\S]*reflowNoteFlowElementsAfterDrag\(movedIndexes, liveResolved, \{[\s\S]*preview: true/);
  assert.match(livePreviewSource, /const movedIndexes = Array\.from[\s\S]*resolveDraggedNoteFlowPlacement\(placement, movedIndexes\)[\s\S]*draggedNoteFlowRemainsInOriginGap\(movedIndexes, resolved\)[\s\S]*clearDraggedNoteFlowOriginReservationPreview\(movedIndexes\)/);
  assert.doesNotMatch(livePreviewSource, /refreshDraggedNoteFlowPreviewCandidate\(resolved\.candidate\)/);
  assert.match(livePreviewSource, /rowOffset \+ bounds\.maxY - bounds\.minY[\s\S]*this\.draggedNoteFlowPreviewHeight\(movedIndexes\)/);
  assert.match(geometrySource, /current\.scrollKey === scrollKey[\s\S]*this\.draggingStroke[\s\S]*current\.layoutGeneration === this\.layoutRefreshGeneration/);
  assert.match(domPreviewSource, /if \(domChanged && !this\.draggingStroke\) \{[\s\S]*this\.resetDragDropGeometry\(\)/);
  assert.match(domPreviewSource, /marker\.parentNode\.insertBefore\(dragElement, marker\.nextSibling\)/);
  assert.match(finishSource, /const visiblePreviewPlacement = this\.dragNoteFlowLastAppliedPlacement[\s\S]*if \(!visiblePreviewPlacement[\s\S]*const previewedPlacement = visiblePreviewPlacement[\s\S]*previewCandidates: previewedPlacement\.previewCandidates,[\s\S]*previewRowOffsets: previewedPlacement\.previewRowOffsets/);
  assert.match(finishSource, /previewCommitStates = new Map[\s\S]*points: stroke\.points\.map[\s\S]*this\.restoreDraggedNoteFlowLivePreview\(\{ preserveDom: preserveMarkdownDomPreview \}\);[\s\S]*if \(resolvedDropPlacement && previewCommitStates\?\.size\)[\s\S]*stroke\.points = state\.points\.map/);
  assert.match(finishSource, /else if \(resolvedDropPlacement\) \{[\s\S]*this\.snapDraggedSelectionToNoteFlowPlacement\(resolvedDropPlacement, movedIndexes\)[\s\S]*resolvedDropPlacement && !previewCommitStates\?\.size \? this\.reflowNoteFlowElementsAfterDrag\(movedIndexes, resolvedDropPlacement/);
  assert.match(finishSource, /preserveBoxGeometry: droppedNoteFlowIndexes\.has\(index\)[\s\S]*resolvedDropPlacement\?\.horizontalSide[\s\S]*\? null[\s\S]*this\.dragStrokeOriginalNoteFlows\.get\(index\)/);
  assert.match(finishSource, /clearSelectedStrokeDragState\(\{ preserveMarkdownDom: Boolean\(markdownDrop\?\.domPreview && !noOpMarkdownDrop\) \}\)[\s\S]*if \(didMove && markdownDrop && !noOpMarkdownDrop\) \{[\s\S]*commitDraggedMarkdownBlocks\(markdownDrop, drawingHistoryBefore\)[\s\S]*const committedChanged = Boolean\(committed && committed\.changed !== false\)[\s\S]*const horizontalCommit = markdownDrop\.side === "left" \|\| markdownDrop\.side === "right"[\s\S]*const revertBlockState = !committedChanged && !horizontalCommit[\s\S]*settleCommittedMarkdownDomPreview\(markdownDrop, committedChanged && !revertBlockState\)[\s\S]*\.catch\(\(error\) => \{[\s\S]*settleCommittedMarkdownDomPreview\(markdownDrop, false\)/);
  assert.match(domPreviewSource, /if \(this\.dragNoteFlowDomPreview === preview\) \{[\s\S]*this\.dragNoteFlowDomPreview = null/);
  assert.match(reflowSource, /this\.packInlineNoteFlowItems\(inlineItems, candidates/);
  assert.doesNotMatch(reflowSource, /inlineItems\.map\(\(item\) => \(\{/);
  assert.match(source, /syncMarkdownBlockPresentation\(\)[\s\S]*this\.draggingStroke && this\.dragNoteFlowDomPreview[\s\S]*!this\.allowMarkdownPresentationDuringDrag/);
  assert.match(finishSource, /this\.allowMarkdownPresentationDuringDrag = true;[\s\S]*syncMarkdownBlockPresentation\(\)[\s\S]*this\.allowMarkdownPresentationDuringDrag = false/);
  assert.match(rowMetricsSource, /const movingItemCount = Math\.max\(1, movingMarkdownCount \+ movingStrokeCount\)[\s\S]*const totalCount = orderedMemberIds\.length \+ movingItemCount[\s\S]*const requiredWidth = totalCount \* MIN_INLINE_NOTE_FLOW_ITEM_WIDTH_PX[\s\S]*const spans = distributeInlineRowSpans\(totalCount\)[\s\S]*const canFit = spans\.length === totalCount[\s\S]*orderedMemberIds/);
  assert.doesNotMatch(rowMetricsSource, /totalCount <= 4/);
  assert.doesNotMatch(rowMetricsSource, /itemCount \* 2/);
  assert.match(domPreviewSource, /rowMemberIds[\s\S]*markdownInlineRowSpan\(allocation, id, 12\)/);
  assert.match(domPreviewSource, /const markdownHeight = this\.draggedNoteFlowMarkdownStates\(\)\.reduce[\s\S]*Math\.max\(strokeHeight, markdownHeight\)/);
  assert.match(domPreviewSource, /if \(!placement\?\.candidate \|\| placement\.horizontalSide\)/);
  assert.doesNotMatch(domPreviewSource, /placement\.horizontalSide \|\| !indexes\?\.length/);
});

test("NoteFlow drag changes keep visual continuity without duplicate Markdown spacing", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const activationSource = source.slice(source.indexOf("  startPendingSelectionTap("), source.indexOf("  finishPendingSelectionTap("));
  const moveSource = source.slice(source.indexOf("  moveSelectedStroke(event)"), source.indexOf("  finishSelectedStrokeDrag", source.indexOf("  moveSelectedStroke(event)")));
  const animationSource = source.slice(source.indexOf("  captureNoteFlowPeerRects("), source.indexOf("  setDraggedNoteFlowDomStyle("));
  const livePreviewSource = source.slice(source.indexOf("  applyDraggedNoteFlowLivePreview("), source.indexOf("  refreshDraggedNoteFlowPreviewCandidate("));
  const placementSource = source.slice(source.indexOf("  updateDraggedNoteFlowPlacement("), source.indexOf("  syncMarkdownDropFromNoteFlowPlacement("));
  const cancelSource = source.slice(source.indexOf("  cancelSelectedStrokeDrag("), source.indexOf("  clearSelectedStrokeDragState("));

  assert.match(activationSource, /selectedDragActivationDistancePx\(event\.pointerType\)[\s\S]*startPoint: pending\.startClient|selectedDragActivationDistancePx\(event\.pointerType\)[\s\S]*startClient: pending\.startClient/);
  assert.match(moveSource, /movedDistance <= this\.selectedDragActivationDistancePx\(event\.pointerType\)/);
  assert.match(animationSource, /this\.dragMarkdownOriginalElements\?\.values[\s\S]*dragNoteFlowPeerAnimationFrameId[\s\S]*cancelAnimationFrame[\s\S]*dragNoteFlowPeerAnimatingElements[\s\S]*classList\?\.remove\("notedraw-note-flow-peer-animating"\)[\s\S]*requestAnimationFrame/);
  assert.match(animationSource, /this\.dragNoteFlowPeerAnimatingElements\.add\(element\)[\s\S]*this\.dragNoteFlowPeerAnimatingElements\.delete\(element\)/);
  assert.match(animationSource, /captureDraggedNoteFlowStrokeVisualPoints[\s\S]*interpolatedDragStrokePoints[\s\S]*animateDraggedNoteFlowStrokeShifts/);
  assert.match(animationSource, /DRAG_STROKE_ANIMATION_MS[\s\S]*requestAnimationFrame\(tick\)/);
  assert.doesNotMatch(animationSource, /contains\("is-notedraw-md-dragging"\)/);
  assert.match(livePreviewSource, /const previewTransition = Boolean\(placement\) && \(!previousApplied \|\| previewStructureChanged\)[\s\S]*const peerRects = previewTransition \? this\.captureNoteFlowPeerRects\(\) : null[\s\S]*const strokePoints = previewTransition \? this\.captureDraggedNoteFlowStrokeVisualPoints\(\) : null/);
  assert.match(livePreviewSource, /if \(strokePoints\) \{[\s\S]*const movedSet = new Set\(movedIndexes\)[\s\S]*animateDraggedNoteFlowStrokeShifts\([\s\S]*affectedIndexes\.filter\(\(index\) => !movedSet\.has\(index\)\)/);
  assert.match(livePreviewSource, /markdownDomPreview \? 0 : this\.draggedNoteFlowPreviewHeight\(movedIndexes\)[\s\S]*applyDraggedNoteFlowReservationPreview[\s\S]*animateNoteFlowPeerShifts/);
  assert.match(source, /clearDraggedNoteFlowOriginReservationPreview\(indexes\)[\s\S]*moved\.has\(state\.ownerStrokeIndex\)[\s\S]*state\.value \|\| null/);
  assert.match(placementSource, /const rowTolerance = clamp\(previousHeight \* 0\.1, 3, 7\)/);
  assert.match(cancelSource, /restoreDraggedNoteFlowLivePreview\(\);[\s\S]*clearNoteFlowPeerAnimations\(\);[\s\S]*clearDraggedNoteFlowPlacement\(\)/);
  assert.match(source, /if \(restoreOriginal && this\.dragNoteFlowConnectorOriginalStates\.size\)[\s\S]*stroke\.points = points\.map/);
  assert.match(source, /rememberDraggedNoteFlowConnectorStates\(elementIds\)[\s\S]*dragNoteFlowConnectorOriginalStates\.set/);
  assert.match(styles, /is-notedraw-md-dragging\.notedraw-note-flow-peer-animating[\s\S]*--notedraw-note-flow-peer-x[\s\S]*transition: transform 150ms/);
});

test("parallel drag peer animation excludes the blocks already moving in the DOM preview", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const peerSource = source.slice(source.indexOf("  captureNoteFlowPeerRects("), source.indexOf("  clearNoteFlowPeerAnimations(", source.indexOf("  captureNoteFlowPeerRects(")));

  assert.match(peerSource, /const draggedElements = new Set\(Array\.from\(this\.dragMarkdownOriginalElements\?\.values\?\.\(\) \|\| \[\]\)/);
  assert.match(peerSource, /draggedElements\.has\(flowElement\)/);
});

test("reading-view double clicks are consumed before Obsidian can switch to source mode", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const handler = source.slice(source.indexOf("  onPreviewDoubleClick("), source.indexOf("  rememberTextTap(", source.indexOf("  onPreviewDoubleClick(")));

  assert.match(handler, /this\.isReadingPreviewGesture\(event\)/);
  assert.match(handler, /if \(this\.active\) \{[\s\S]*this\.onCanvasDoubleClick\(event\)/);
  assert.match(handler, /event\.preventDefault\(\);[\s\S]*event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(source, /this\.previewGestureWindow\.addEventListener\("pointerdown", this\.onPreviewSecondPointerDown, true\)/);
  assert.match(source, /onPreviewSecondPointerDown\(event\)[\s\S]*this\.previewPrimaryPress = \{ \.\.\.point, time: now \}[\s\S]*now - previous\.time <= 550/);
  assert.match(source, /const path = event\?\.composedPath\?\.\(\)/);
  assert.match(source, /this\.active && \(event\.target === this\.canvas \|\| path\.includes\(this\.canvas\)\)[\s\S]*event\.preventDefault\(\);\s*return;/);
  assert.match(source, /enteredDifferentCandidate = Boolean\(freshRect[\s\S]*freshKey !== previousKey[\s\S]*clientY\) >= freshRect\.top[\s\S]*!enteredDifferentCandidate && previousRect && remainsInLane/);
});

test("reading selection preserves live parallel spans and NoteFlow ink overlap is isolated", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const presentationSource = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  selectMarkdownBlock(", source.indexOf("  syncMarkdownBlockPresentation()")));
  const alignmentSource = source.slice(source.indexOf("  alignNoteFlowStrokesToReservedRows("), source.indexOf("  frozenNoteFlowAnchorsReady(", source.indexOf("  alignNoteFlowStrokesToReservedRows(")));
  const mutationSource = source.slice(source.indexOf("  scheduleMarkdownMutationSync()"), source.indexOf("  updateFloatingControlsPosition(", source.indexOf("  scheduleMarkdownMutationSync()")));

  assert.match(presentationSource, /liveInlineSpan = element\.classList\?\.contains\("notedraw-md-inline-grid-item"\)/);
  assert.match(presentationSource, /block\.span = liveInlineSpan/);
  assert.match(presentationSource, /const pendingIdentityMembers = new Map\(\(pendingIdentity\?\.members \|\| \[\]\)\.map/);
  assert.match(presentationSource, /pendingMember\?\.path === block\.path[\s\S]*Number\(meta\.info\?\.lineStart\) === pendingMember\.lineStart/);
  assert.match(source, /restorePendingMarkdownIdentityPresentation\(mutations = \[\]\)[\s\S]*const members = \(pending\.members \|\| \[\]\)[\s\S]*block\.span = Number\(member\.span\)[\s\S]*this\.syncMarkdownBlockPresentation\(\)/);
  assert.match(source, /const row = this\.markdownDropRowMetrics\(element\);[\s\S]*const members = rowIds\.map[\s\S]*const flowElement = this\.markdownBlockFlowElement\(memberElement\) \|\| memberElement;[\s\S]*const liveInlineSpan = flowElement\.classList\?\.contains\("notedraw-md-inline-grid-item"\)[\s\S]*const persistedSpan = Number\(memberBlock\.span\)[\s\S]*textHint: normalizeRenderedText\(renderedMarkdownIdentityText\(memberElement\)\)\.slice\(0, 240\),[\s\S]*flowElement,[\s\S]*span,[\s\S]*widthScale: normalizeMarkdownBlockWidthScale\(memberBlock\.widthScale\)/);
  assert.doesNotMatch(source, /const liveWidthPercent = Number\.parseFloat\(memberElement\.style\?\.width/);
  const immediateRestoreSource = source.slice(source.indexOf("  restorePendingMarkdownIdentityPresentation("), source.indexOf("  rememberTextTap(", source.indexOf("  restorePendingMarkdownIdentityPresentation(")));
  assert.match(immediateRestoreSource, /mutation\?\.addedNodes/);
  assert.match(immediateRestoreSource, /mutation\?\.removedNodes[\s\S]*node === member\.flowElement/);
  assert.match(immediateRestoreSource, /const unmatchedMembers = members\.filter/);
  assert.match(immediateRestoreSource, /unmatchedMembers\.length === unmatchedDirectCandidates\.length/);
  assert.match(immediateRestoreSource, /const matchingHint = member\.textHint/);
  assert.match(immediateRestoreSource, /freshElement[\s\S]*applyMarkdownBlockFlowPresentation\(block, freshElement\)[\s\S]*applyMarkdownBlockWidthPresentation\(block, freshElement\)[\s\S]*applyMarkdownBlockHeightPresentation\(block, freshElement\)[\s\S]*markdownBlockElements\.set\(block\.id, freshElement\)/);
  assert.doesNotMatch(presentationSource, /if \(element\) \{\s*this\.pendingMarkdownIdentityRefresh = null;/);
  assert.match(mutationSource, /identityMutationPending = this\.pendingMarkdownIdentityRefresh\?\.expiresAt > Date\.now\(\)/);
  assert.match(mutationSource, /editingLayout \|\| identityMutationPending[\s\S]*delay: identityMutationPending \? 0 : void 0,[\s\S]*force: identityMutationPending/);
  assert.match(alignmentSource, /rowKey: target\.rowKey,[\s\S]*overlapGroup: isNoteFlowInkStroke\(target\.stroke\)/);
  assert.match(source, /selectedMarkdownInlineFrameLimitsCanvas\(\)[\s\S]*markdownInlineSelectionClientLimits/);
  assert.match(source, /markdownInlineSelectionClientLimits\(element, \{ left, right, top, bottom/);
  assert.match(source, /rect\.width -= inlineLimits\.minX - rect\.x[\s\S]*rect\.width = inlineLimits\.maxX - rect\.x/);
});

test("same-row horizontal NoteFlow drag keeps the origin reservation until the row changes", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const preview = source.slice(source.indexOf("  applyDraggedNoteFlowLivePreview("), source.indexOf("  remeasureDraggedNoteFlowPlacement("));

  assert.match(preview, /const resolved = this\.resolveDraggedNoteFlowPlacement\(placement, movedIndexes\)/);
  assert.match(preview, /if \(!this\.draggedNoteFlowRemainsInOriginGap\(movedIndexes, resolved\)\) \{\s*this\.clearDraggedNoteFlowOriginReservationPreview\(movedIndexes\);/);
});

test("parallel NoteFlow ordering uses peer geometry from before live preview packing", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const placement = source.slice(source.indexOf("  updateDraggedNoteFlowPlacement("), source.indexOf("  syncMarkdownDropFromNoteFlowPlacement("));

  assert.match(placement, /const original = this\.dragNoteFlowLivePreviewOriginals\.get\(index\)[\s\S]*peerStroke = original \? \{ \.\.\.stroke, points: original\.points \} : stroke[\s\S]*peerNoteFlow = original\?\.noteFlow \|\| stroke\.noteFlow/);
  assert.match(placement, /getStrokeBounds\(peerStroke[\s\S]*noteFlowCanonicalGapPlacement\([\s\S]*peerNoteFlow/);
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
  assert.match(drawSource, /setLineDash\(\[\]\)/);
  assert.match(drawSource, /setLineDash\(\[3, 2\]\)/);
  assert.match(drawSource, /this\.frameCornerRadius\(\)/);
  assert.match(handleSource, /getVisibleSelectionFrameCanvasRect/);
});

test("Markdown selection bounds exclude NoteFlow padding and include task checkboxes", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /markdownElementCanvasBounds\(this\.markdownBlockElementOrFallback\(block\), \{ forSelection: true \}\)/);
  assert.match(source, /markdownBlockElementOrFallback\(block\)[\s\S]*const mapped = this\.markdownBlockElement\(block\)[\s\S]*data-note-draw-markdown-block-id/);
  assert.match(source, /noteFlowAppliedVerticalInsets\(element\)/);
  assert.match(source, /input\.task-list-item-checkbox, input\[type='checkbox'\]/);
  assert.match(source, /listItem\.matches\?\.\("\.task-list-item, \[data-task\], \[data-task-status\]"\)/);
  assert.match(source, /const visibleRect = this\.markdownElementVisibleClientRect\(element\) \|\| elementRect/);
  // The task checkbox (left of the <li>) is enclosed by the selection frame
  // so the whole todo item is visibly selected.
  assert.match(source, /left = Math\.min\(left, checkboxRect\.left\)/);
  assert.match(source, /markdownElementTextClientRect\(contentElement \|\| element, visibleRect\)/);
  assert.match(source, /top = Math\.max\(visibleRect\.top, textRect\?\.top/);
  assert.match(source, /bottom = Math\.min\(visibleRect\.bottom, textRect\?\.bottom/);
});

test("Double-clicking the bottom-right resize handle resets elements to best fit", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const doubleClickSource = source.slice(source.indexOf("  onCanvasDoubleClick("), source.indexOf("  onPreviewDoubleClick("));
  const resetSource = source.slice(source.indexOf("  resetSelectedElementsToBestFit()"), source.indexOf("  cancelSelectedStrokeResize("));

  assert.match(doubleClickSource, /const resizeHandle = this\.findSelectionHandleAt\(point\);[\s\S]*if \(resizeHandle === "se" && this\.resetSelectedElementsToBestFit\(\)\)/);
  assert.match(resetSource, /block\.span = 12;[\s\S]*block\.widthScale = 1;[\s\S]*block\.minHeight = null;[\s\S]*block\.floating = false;[\s\S]*block\.floatingExplicit = false;[\s\S]*block\.floatBox = null;/);
  assert.match(resetSource, /refreshMarkdownBlockPresentation\(blocks\.map\(\(block\) => block\.id\)\)/);
  assert.match(source, /effectiveSelectionFramePaddingPx\(\)[\s\S]*const shrunk =[\s\S]*return Math\.max\(3, shrunk\);/);
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

test("Markdown DOM replacement preserves parallel width when rendered text changes", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const presentationSource = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  selectMarkdownBlock(", source.indexOf("  syncMarkdownBlockPresentation()")));
  const recordSource = source.slice(source.indexOf("  findMarkdownBlockRecordForElement("), source.indexOf("  markdownBlockElementForTarget(", source.indexOf("  findMarkdownBlockRecordForElement(")));
  const reconcileSource = source.slice(source.indexOf("  reconcileAutoNoteFlowMarkdownSpans()"), source.indexOf("  resolveDraggedNoteFlowPlacement(", source.indexOf("  reconcileAutoNoteFlowMarkdownSpans()")));

  assert.match(presentationSource, /const idCandidates =/);
  assert.match(presentationSource, /takeUnused\(idCandidates\.get\(block\.id\), block\)/);
  assert.doesNotMatch(presentationSource, /lineCandidates/);
  assert.match(presentationSource, /const scored = candidates\.map\(\(candidate, candidateOrder\)/);
  assert.match(presentationSource, /scored\.score >= 1000/);
  assert.match(presentationSource, /takeUnused\(exactCandidates\.get\(exactKey\), block\)[\s\S]*takeUnused\(hintCandidates\.get\(hintKey\), block\)/);
  assert.doesNotMatch(presentationSource, /takeUnused\(lineCandidates\.get\(lineKey\)/);
  assert.match(recordSource, /const compatible = \(block\) => explicitGroup[\s\S]*const matching = candidates\.filter\(\(block\) => compatible\(block\)/);
  assert.match(reconcileSource, /activeInlineFlows[\s\S]*hasSemanticInlineMatch/);
  assert.match(reconcileSource, /!this\.noteFlowMarkdownAnnotationComplete \|\| !this\.markdownBlockElement\(block\)\?\.isConnected/);
});

test("parallel Markdown rows keep their span while NoteFlow ink is temporarily absent", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const reconcileSource = source.slice(
    source.indexOf("  reconcileAutoNoteFlowMarkdownSpans()"),
    source.indexOf("  resolveDraggedNoteFlowPlacement(", source.indexOf("  reconcileAutoNoteFlowMarkdownSpans()"))
  );
  assert.match(reconcileSource, /Number\(block\.span\) > 0 && Number\(block\.span\) < 12/);
  assert.match(reconcileSource, /block\.noteFlowAutoSpan = false/);
});

test("NoteFlow release commits the exact candidate and boundary shown by the blue indicator", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const dragFinishSource = source.slice(source.indexOf("  finishSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag(", source.indexOf("  finishSelectedStrokeDrag(")));
  const placementSource = source.slice(source.indexOf("  updateDraggedNoteFlowPlacement("), source.indexOf("  captureNoteFlowAnchor(", source.indexOf("  updateDraggedNoteFlowPlacement(")));

  assert.match(dragFinishSource, /boundary: previewedPlacement\.boundary/);
  assert.match(dragFinishSource, /candidate: previewedPlacement\.candidate/);
  assert.match(dragFinishSource, /const visiblePreviewPlacement = this\.dragNoteFlowLastAppliedPlacement[\s\S]*this\.dragNoteFlowDropClientX = null;[\s\S]*this\.dragNoteFlowDropClientY = null;[\s\S]*if \(!visiblePreviewPlacement[\s\S]*const previewedPlacement = visiblePreviewPlacement/);
  assert.match(dragFinishSource, /const visibleDrop = this\.dragMarkdownDropTarget\?\.isConnected[\s\S]*captureMarkdownBlockDropTarget/);
  assert.match(placementSource, /const draggedClientBounds = this\.draggedNoteFlowClientBounds\(\)[\s\S]*const requestedClientY = Number\(boundary\) - draggedClientBounds\.top/);
  assert.match(placementSource, /const requestedClientX = Number\.isFinite\(targetClientX\)[\s\S]*targetClientX - draggedClientBounds\.left/);
  assert.match(source, /const anchorRect = anchor[\s\S]*noteFlowCandidateRect\(anchor, placementMode\)[\s\S]*placementMode === "inline" \? anchorRect\?\.top : side === "after" \? anchor\.bottom : anchor\.top/);
  assert.match(placementSource, /const candidate = placement\?\.candidate;[\s\S]*const exactCandidate = candidate/);
  assert.match(placementSource, /return exactCandidate \? \{[\s\S]*candidate: exactCandidate[\s\S]*\} : null/);
  assert.doesNotMatch(placementSource.slice(placementSource.indexOf("  resolveDraggedNoteFlowPlacement("), placementSource.indexOf("  snapDraggedSelectionToNoteFlowPlacement(")), /dragDropGeometrySnapshot|selectStoredNoteFlowAnchorCandidate/);
  assert.match(placementSource, /placement\?\.boundary !== null[\s\S]*placement\?\.boundary !== undefined[\s\S]*Number\.isFinite\(Number\(placement\.boundary\)\)/);
  assert.match(placementSource, /const hasExplicitBoundary = placement\?\.boundary !== null[\s\S]*const boundary = horizontalSide[\s\S]*hasExplicitBoundary/);
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

test("Markdown drop settlement remaps rendered blocks without auto-persisting stale source lines", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const annotationSource = source.slice(source.indexOf("  scheduleMarkdownAnnotationRefresh("), source.indexOf("  updateFloatingControlsPosition(", source.indexOf("  scheduleMarkdownAnnotationRefresh(")));
  const presentationSource = source.slice(source.indexOf("  syncMarkdownBlockPresentation()"), source.indexOf("  selectMarkdownBlock(", source.indexOf("  syncMarkdownBlockPresentation()")));

  assert.match(annotationSource, /options\.force === true/);
  assert.match(annotationSource, /this\.markdownAnnotationForce = this\.markdownAnnotationForce \|\| requestedForce/);
  assert.match(annotationSource, /const force = this\.markdownAnnotationForce \|\| this\.hasNoteFlowElements\(\)/);
  assert.match(annotationSource, /annotateRenderedMarkdownLines\([\s\S]*\{ force \}/);
  assert.match(annotationSource, /if \(force\) \{\s*this\.noteFlowMarkdownAnnotationComplete = true/);
  assert.match(source, /const sourceIndexes = new Map\([\s\S]*createMarkdownSourceIndex\(source\)/);
  assert.match(source, /resolveSourceDropTarget\(source, state\.sourceInfo, state\.sourceText, sourceIndex, state\.embedDestination\)/);
  assert.match(source, /markdownDragSourceIdentity\(element\)[\s\S]*embedDestination: sourceIdentity\.embedDestination/);
  assert.match(source, /hostLineElement = \(owner \|\| linkedFile \|\| element\)\.closest\?\.\("\[data-note-draw-line-start\],\[data-line\]"\)[\s\S]*parseInteger\(hostLineElement\?\.dataset\?\.noteDrawLineStart\)/);
  assert.match(source, /const sourcePath = isMarkdownEmbedBlockElement\(element\)[\s\S]*normalizeVaultPath\(fallbackPath\)[\s\S]*resolveRenderedSourcePath/);
  assert.match(source, /const embedIdentity = markdownDragSourceIdentity\(element\)[\s\S]*resolveMarkdownEmbedSourceTarget\(source, embedIdentity\.embedDestination, sourceInfo, sourceIndex\)/);
  assert.match(source, /target\?\.matches\?\.\(MARKDOWN_EMBED_SELECTOR\)[\s\S]*target\?\.closest\?\.\(MARKDOWN_EMBED_SELECTOR\)[\s\S]*target\?\.querySelector\?\.\(MARKDOWN_EMBED_SELECTOR\)/);
  assert.match(source, /linkedFileSelector = "\[data-cancip-inline-path\],\[data-file-path\],\[data-embed-path\]"[\s\S]*linkedFile\?\.getAttribute\?\.\("data-cancip-inline-path"\)/);
  assert.match(source, /changed: result\.changed !== false,[\s\S]*before: result\.before,[\s\S]*after: result\.after/);
  assert.match(presentationSource, /markdownMetadataChanged[\s\S]*block\.lineStart !== info\.lineStart/);
  assert.doesNotMatch(presentationSource, /scheduleDrawingSave\(this\.file, this\.drawingData, \{ userOperation: true \}\)/);
});

test("Markdown selection keeps complete owners while ordinary paragraph lines become NoteFlow targets", async () => {
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
  assert.match(presentationSource, /markdownBlockCandidateElements\(this\.previewEl\)/);
  assert.match(presentationSource, /connectedIds[\s\S]*selectedMarkdownBlockIds[\s\S]*invalidateSelectionFrameSnapshot/);
  assert.match(candidateSource, /querySelectorAll\?\.\("\[data-note-draw-line-start\]"\)/);
  assert.match(candidateSource, /querySelectorAll\?\.\("\[data-line\]"\)/);
  assert.match(candidateSource, /querySelectorAll\?\.\(NOTE_FLOW_RENDERED_OWNER_SELECTOR\)/);
  assert.match(candidateSource, /const owner = findNoteFlowMarkdownBlockElement\(sourceElement, this\.previewEl\)/);
  assert.match(candidateSource, /sourceElements\.add\(owner\)/);
  assert.match(candidateSource, /const canonical = sourceElement\.dataset\.noteDrawLineMapped === "true"/);
  assert.match(candidateSource, /const reliableOwnerRange = [\s\S]*mappedConfidence > 0/);
  assert.match(candidateSource, /if \(!canonical && !exactOwnDataLine && !reliableOwnerRange\) \{\s*continue/);
  assert.match(candidateSource, /this\.markdownElementVisibleClientRect\(element\)[\s\S]*this\.noteFlowEmptyOwnerClientRect\(element\)/);
  assert.match(source, /const nextBlockTop = Array\.from\(element\.parentElement\?\.children \|\| \[\]\)/);
  assert.match(candidateSource, /grouped\.get\(element\)[\s\S]*existing\.start = Math\.min[\s\S]*existing\.end = Math\.max/);
  assert.match(candidateSource, /identityQuality > existing\.identityQuality[\s\S]*existing\.blockKey = noteFlowBlockKey\(existing\)/);
  assert.match(candidateSource, /!candidate\.element\.matches\?\.\("li"\)/);
  assert.match(candidateSource, /candidate\.element\.contains\?\.\(other\.element\)/);
  assert.match(candidateSource, /const explicitLines = this\.noteFlowInlineLineCandidates[\s\S]*if \(explicitLines\.length <= 1\) \{\s*return \[candidate\]/);
  assert.doesNotMatch(candidateSource, /this\.noteFlowVisualLineCandidates\(paragraph/);
  assert.match(candidateSource, /explicitLines\.map[\s\S]*blockStart: line\.start[\s\S]*blockEnd: line\.end[\s\S]*blockKey: noteFlowBlockKey/);
  assert.match(candidateSource, /const cacheKey = [\s\S]*this\.dragDropScrollKey\(\)[\s\S]*noteFlowCandidateCache/);
  assert.match(edgeSource, /markdownEdgeDropTarget\(clientX, clientY[\s\S]*const intent = resolveDragDropHorizontalIntent/);
  assert.match(edgeSource, /forcedIntent = edgeTarget\?\.intent \|\| null/);
  assert.match(styles, /\.notedraw-text-sort-target-left \{[\s\S]*inset 4px 0 0/);
  assert.match(styles, /\.notedraw-text-sort-target-right \{[\s\S]*inset -4px 0 0/);
});

test("precisely mapped atomic Markdown blocks keep their own source line and identity", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const targetSource = source.slice(source.indexOf("function markdownBlockCandidateElementForTarget("), source.indexOf("function isMarkdownEmbedBlockElement(", source.indexOf("function markdownBlockCandidateElementForTarget(")));
  const recordSource = source.slice(source.indexOf("  findMarkdownBlockRecordForElement("), source.indexOf("  clearMarkdownBlockPresentation(", source.indexOf("  findMarkdownBlockRecordForElement(")));

  assert.match(targetSource, /const explicitLine = target\.closest\?\.\("\.notedraw-md-line-block"\)/);
  assert.match(targetSource, /const marked = target\.closest\?\.\("\[data-note-draw-markdown-block-id\]"\)/);
  assert.match(targetSource, /const owner = findNoteFlowMarkdownBlockElement\(target, root\)/);
  assert.match(targetSource, /\[metadataProperty, explicitLine, marked, owner, preciselyMapped, mappedChild\]/);
  assert.match(targetSource, /isMarkdownBlockCandidateElement\(candidate\)/);
  assert.match(targetSource, /target\.querySelectorAll\?\.\("\[data-note-draw-line-mapped='true'\]"\)/);
  assert.match(recordSource, /normalizeRenderedText\(renderedMarkdownIdentityText\(blockElement\)\)/);
  assert.match(styles, /\.notedraw-md-block\[data-note-draw-resized-height\] \{[\s\S]*min-height: var\(--notedraw-md-min-height\)/);
  assert.doesNotMatch(styles, /data-note-draw-resized-height="true"/);
});

test("multi-item inline rows use one allocation for preview and commit", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);
  const metricsSource = source.slice(source.indexOf("  markdownDropRowMetrics("), source.indexOf("  updateDraggedElementGroupMembership(", source.indexOf("  markdownDropRowMetrics(")));
  const previewSource = source.slice(source.indexOf("  applyDraggedNoteFlowAnchorDomPreview("), source.indexOf("  restoreDraggedNoteFlowLivePreview(", source.indexOf("  applyDraggedNoteFlowAnchorDomPreview(")));
  const anchorSource = source.slice(source.indexOf("  prepareMarkdownAnchorForInlineNoteFlow("), source.indexOf("  reconcileAutoNoteFlowMarkdownSpans(", source.indexOf("  prepareMarkdownAnchorForInlineNoteFlow(")));

  assert.match(metricsSource, /distributeInlineRowSpans\(totalCount\)/);
  assert.match(metricsSource, /const canFit = spans\.length === totalCount/);
  assert.doesNotMatch(metricsSource, /availableWidth \+ 0\.5 >= requiredWidth/);
  assert.match(metricsSource, /markdownInlineRowAllocation\(row, targetBlock, moving, drop\.side\)/);
  assert.match(metricsSource, /markdownInlineRowSpan\(allocation, state\.block\.id/);
  assert.match(previewSource, /markdownInlineRowAllocation\(drop\?\.row, targetBlock, moving, drop\?\.side\)/);
  assert.match(previewSource, /markdownInlineRowSpan\(allocation, state\.block\?\.id/);
  assert.match(anchorSource, /markdownInlineRowAllocation\(row, block, movingStates, placement\.horizontalSide\)/);
  assert.match(styles, /\.notedraw-md-inline-grid-item \{[\s\S]*min-width: 0[\s\S]*overflow-wrap: anywhere/);
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

test("boxed and locked groups keep member selection, exact frames, and drag membership", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(source, /findBoxedElementGroupAtPoint\(point\)/);
  assert.match(source, /findLockedElementGroupFrameAtPoint\(point\)[\s\S]*!this\.isElementGroupFullySelected\(lockedGroup\.id\)[\s\S]*type: "select-group"[\s\S]*startSelectedStrokeDrag\(event, point, -1, \{ preserveSelection: true \}\)/);
  assert.match(source, /type: "enter-stroke-group"[\s\S]*groupId: hitGroupId/);
  assert.match(source, /type: "select-group"[\s\S]*groupId: boxedGroup\.id/);
  assert.match(source, /applyPendingSelectionTap\(pending\)[\s\S]*this\.enteredElementGroupIds\.add\(pending\.groupId\)[\s\S]*this\.selectElementGroup\(pending\.groupId\)/);
  assert.match(source, /updateDraggedElementGroupMembership\(event, movedIndexes/);
  assert.match(source, /filter\(\(group\) => group\.boxed \|\| group\.locked\)[\s\S]*dragElementGroupBounds/);
  assert.match(source, /filter\(\(item\) => item\.boxed \|\| item\.locked\)/);
  assert.match(source, /item\.groupId = destination\.id/);
  assert.match(source, /item\.groupId = ""/);
  assert.match(source, /drawElementGroupBackgrounds\(\)/);
  assert.match(source, /this\.underlayCtx\.fillStyle = group\.backgroundColor/);
  assert.match(source, /elementGroupFramePaddingPx\(groupId\)[\s\S]*this\.elementFramePaddingPx\([\s\S]*groupMemberStrokeIndexes\(groupId\)[\s\S]*groupMemberMarkdownBlocks\(groupId\)\.length/);
  assert.match(source, /selectionFramePaddingPx\(\)[\s\S]*this\.elementFramePaddingPx\([\s\S]*this\.getSelectedStrokeIndexes\(\)[\s\S]*this\.getSelectedMarkdownBlocks\(\)\.length/);
  assert.match(source, /getElementGroupBounds\(groupId\)[\s\S]*markdownElementCanvasBounds\(this\.markdownBlockElement\(block\), \{ forSelection: true \}\)/);
  assert.match(source, /expandSelectedGroups\(\)[\s\S]*!this\.elementGroup\(id\)\?\.locked/);
  assert.match(source, /toggleSelectedStrokeLock\(\)[\s\S]*const groupId = shouldUnlock \|\| itemCount < 2[\s\S]*stroke\.groupId = groupId[\s\S]*block\.groupId = groupId/);
  assert.match(source, /pruneElementGroups\(\)[\s\S]*!group\.boxed && strokeIndexes\.length \+ blocks\.length < 2[\s\S]*groupId = ""/);
  assert.match(source, /toggleSelectedElementBox\(\)[\s\S]*!group\.backgroundColor[\s\S]*group\.backgroundColor = [\s\S]*group\.boxed = false/);
  assert.match(styles, /\.notedraw-md-block \{/);
  assert.match(styles, /isolation: isolate/);
  assert.match(styles, /pointer-events: none/);
});
