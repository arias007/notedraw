import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dedupeMarkdownBlockRecords } from "../src/markdown-block-records.mjs";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

// Same approach as the 4.0.5 suite: lift the real method text out of the
// shipped source and run it, so the identity rules are exercised for real
// instead of being asserted as a string.
function extractMethodBody(source, name) {
  const marker = `\n  ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`method ${name} not found`);
  }
  const open = source.indexOf("{", start + marker.length - 1);
  let depth = 0;
  let index = open;
  let quote = "";
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === quote) {
        quote = "";
      }
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      index = source.indexOf("\n", index);
      if (index < 0) break;
      continue;
    }
    if (char === "/" && next === "*") {
      index = source.indexOf("*/", index);
      if (index < 0) break;
      index += 2;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start + 1, index + 1);
      }
    }
    index += 1;
  }
  throw new Error(`unbalanced method ${name}`);
}

const normalizeVaultPath = (value) => String(value || "").replace(/^\.\//, "").replace(/\\/g, "/");
const normalizeRenderedText = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
const renderedMarkdownIdentityText = (element) => String(element?.textContent || "");
const getSourceInfo = (element) => {
  const start = Number(element?.dataset?.noteDrawLineStart);
  const end = Number(element?.dataset?.noteDrawLineEnd);
  return {
    lineStart: Number.isFinite(start) ? start : null,
    lineEnd: Number.isFinite(end) ? end : null
  };
};
const markdownElementRenderKind = (element) => (element?.matches?.("li.task-list-item") ? "task" : "");
const isConcreteMarkdownBlockElement = () => true;
const hashString = (value) => String(value).length.toString(36);

function makeRecord(overrides = {}) {
  return {
    id: "rec",
    path: "note.md",
    lineStart: 0,
    lineEnd: 0,
    textHint: "",
    renderKind: "",
    span: 12,
    widthScale: 1,
    floating: false,
    explicitLineGroup: "",
    ...overrides
  };
}

function makeElement({ text = "", lineStart = null, lineEnd = null, tags = [] } = {}) {
  const classes = new Set();
  const props = new Map();
  const dataset = {};
  if (lineStart !== null) dataset.noteDrawLineStart = String(lineStart);
  if (lineEnd !== null) dataset.noteDrawLineEnd = String(lineEnd);
  const element = {
    tagName: "LI",
    isConnected: true,
    textContent: text,
    dataset,
    classList: {
      contains: (name) => classes.has(name),
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        if (force) classes.add(name);
        else classes.delete(name);
        return Boolean(force);
      }
    },
    style: {
      getPropertyValue: (name) => props.get(name) || "",
      setProperty: (name, value) => props.set(name, String(value)),
      removeProperty: (name) => props.delete(name)
    },
    matches: (selector) => tags.includes(selector),
    hasClass: (name) => classes.has(name),
    closest: () => element,
    cssProp: (name) => props.get(name) || ""
  };
  return element;
}

async function buildMethods() {
  const source = await readFile(sourceUrl, "utf8");
  const build = (name, names, values) => {
    const body = extractMethodBody(source, name);
    // eslint-disable-next-line no-new-func
    return new Function(...names, `"use strict"; return function ${body};`)(...values);
  };
  return {
    source,
    findMarkdownBlockRecordForElement: build(
      "findMarkdownBlockRecordForElement",
      ["normalizeVaultPath", "getSourceInfo", "renderedMarkdownIdentityText", "normalizeRenderedText"],
      [normalizeVaultPath, getSourceInfo, renderedMarkdownIdentityText, normalizeRenderedText]
    ),
    ensureMarkdownBlockRecord: build(
      "ensureMarkdownBlockRecord",
      [
        "normalizeVaultPath",
        "getSourceInfo",
        "renderedMarkdownIdentityText",
        "normalizeRenderedText",
        "markdownElementRenderKind",
        "isConcreteMarkdownBlockElement",
        "hashString",
        "normalizeMarkdownBlocks"
      ],
      [
        normalizeVaultPath,
        getSourceInfo,
        renderedMarkdownIdentityText,
        normalizeRenderedText,
        markdownElementRenderKind,
        isConcreteMarkdownBlockElement,
        hashString,
        (value) => value
      ]
    )
  };
}

// ---------------------------------------------------------------------------
// Deduplication must never widen a record's line range.
// ---------------------------------------------------------------------------

test("merging same-hint duplicates keeps the tight range instead of widening it", () => {
  const merged = dedupeMarkdownBlockRecords([
    makeRecord({ id: "tight", lineStart: 2, lineEnd: 2, textHint: "Task B", span: 3, noteFlowAutoSpan: false }),
    makeRecord({ id: "wide", lineStart: 2, lineEnd: 6, textHint: "Task B", span: 12 })
  ]);

  assert.equal(merged.length, 1);
  // The widened 2..6 range stops matching the live task once Obsidian
  // re-renders, which silently drops the side-by-side row.
  assert.equal(merged[0].lineStart, 2);
  assert.equal(merged[0].lineEnd, 2);
  assert.equal(merged[0].span, 3, "the parallel layout must survive the merge");
});

test("the surviving duplicate keeps the parallel layout even when the wide record comes first", () => {
  const merged = dedupeMarkdownBlockRecords([
    makeRecord({ id: "wide", lineStart: 2, lineEnd: 6, textHint: "Task B", span: 12 }),
    makeRecord({ id: "tight", lineStart: 2, lineEnd: 2, textHint: "Task B", span: 4, widthScale: 0.5 })
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].lineEnd, 2);
  assert.equal(merged[0].span, 4);
  assert.equal(merged[0].widthScale, 0.5);
});

test("records that share a line range but not their text are not merged away", () => {
  const merged = dedupeMarkdownBlockRecords([
    makeRecord({ id: "task-a", lineStart: 4, lineEnd: 4, textHint: "Task A", span: 3 }),
    // Task renderers number items from zero, so this task's synthetic line
    // coincides with Task A's real source line. Merging on the range alone
    // deleted this record and left the task in a vertical row.
    makeRecord({ id: "task-c", lineStart: 4, lineEnd: 4, textHint: "Task C", span: 3 })
  ]);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((record) => record.textHint).sort(), ["Task A", "Task C"]);
});

test("records that describe the same range and text are still merged", () => {
  const merged = dedupeMarkdownBlockRecords([
    makeRecord({ id: "a", lineStart: 4, lineEnd: 4, textHint: "Task A", span: 12 }),
    makeRecord({ id: "b", lineStart: 4, lineEnd: 4, textHint: "Task A", span: 3, widthScale: 0.5 })
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].span, 3);
});

// ---------------------------------------------------------------------------
// Rendered text outranks a bare line range.
// ---------------------------------------------------------------------------

test("a renumbered record is not stolen by whichever block now sits on its old line", async () => {
  const { findMarkdownBlockRecordForElement } = await buildMethods();
  const taskA = makeRecord({ id: "task-a", lineStart: 2, lineEnd: 2, textHint: "Task A", span: 3 });
  const taskB = makeRecord({ id: "task-b", lineStart: 4, lineEnd: 4, textHint: "Task B", span: 3 });
  const controller = {
    file: { path: "note.md" },
    markdownBlockRecords: () => [taskA, taskB],
    markdownBlockElements: new Map()
  };

  // Task B moved up to line 2 after a re-render; Task A's record still claims
  // line 2. The old code matched the bare range and returned Task A.
  const element = makeElement({ text: "Task B", lineStart: 2, lineEnd: 2 });

  assert.equal(controller.findMarkdownBlockRecordForElement?.call, undefined);
  const match = findMarkdownBlockRecordForElement.call(controller, element);
  assert.equal(match?.id, "task-b");
});

test("an element with no rendered text is never guessed onto a line range", async () => {
  const { findMarkdownBlockRecordForElement } = await buildMethods();
  const taskA = makeRecord({ id: "task-a", lineStart: 2, lineEnd: 2, textHint: "Task A", span: 3 });
  const controller = {
    file: { path: "note.md" },
    markdownBlockRecords: () => [taskA],
    markdownBlockElements: new Map()
  };

  const element = makeElement({ text: "", lineStart: 2, lineEnd: 2 });
  assert.equal(findMarkdownBlockRecordForElement.call(controller, element), null);
});

test("an unrecorded task is not matched onto a neighbour by its synthetic line", async () => {
  const { findMarkdownBlockRecordForElement } = await buildMethods();
  // Task renderers number items from zero, so "Task C" renders with
  // data-line="4" while Task A's record legitimately owns source line 4.
  const taskA = makeRecord({ id: "task-a", lineStart: 4, lineEnd: 4, textHint: "Task A", span: 3 });
  const controller = {
    file: { path: "note.md" },
    markdownBlockRecords: () => [taskA],
    markdownBlockElements: new Map()
  };

  const taskC = makeElement({ text: "Task C", lineStart: 4, lineEnd: 4, tags: ["li.task-list-item"] });
  // Resolving Task C to Task A's record stopped a record from being created for
  // it, so it could never join the parallel row.
  assert.equal(findMarkdownBlockRecordForElement.call(controller, taskC), null);
});

// ---------------------------------------------------------------------------
// A block already shown in a parallel row must not be re-described as full width.
// ---------------------------------------------------------------------------

test("a new record adopts the live inline span instead of defaulting to full width", async () => {
  const { ensureMarkdownBlockRecord } = await buildMethods();
  const element = makeElement({ text: "Task B", lineStart: 2, lineEnd: 2, tags: ["li.task-list-item"] });
  element.classList.add("notedraw-md-inline-grid-item");
  element.style.setProperty("--notedraw-md-inline-span", "3");

  const records = [];
  const controller = {
    surfaceType: "preview",
    file: { path: "note.md" },
    markdownBlockRecords: () => records,
    markdownBlockElements: new Map(),
    findMarkdownBlockRecordForElement: () => null
  };

  const record = ensureMarkdownBlockRecord.call(controller, element);
  assert.equal(record.span, 3, "a fresh full-width record would collapse the row");
  assert.equal(record.renderKind, "task");
});

test("a stale task kind is cleared once the record is bound to a paragraph", async () => {
  const { ensureMarkdownBlockRecord } = await buildMethods();
  const stale = makeRecord({ id: "paragraph", lineStart: 0, lineEnd: 0, textHint: "NoteDraw Inline Test", renderKind: "task" });
  const element = makeElement({ text: "NoteDraw Inline Test", lineStart: 0, lineEnd: 0 });
  const controller = {
    surfaceType: "preview",
    file: { path: "note.md" },
    markdownBlockRecords: () => [stale],
    markdownBlockElements: new Map(),
    findMarkdownBlockRecordForElement: () => stale
  };

  ensureMarkdownBlockRecord.call(controller, element);
  // Keeping "task" here dragged the paragraph into the task-list
  // reconciliations on every later pass, which caused further misbinding.
  assert.equal(stale.renderKind, "");
});

// ---------------------------------------------------------------------------
// Structural invariants of the binding pass itself.
// ---------------------------------------------------------------------------

test("the binding pass only rewrites a record when the match is trusted", async () => {
  const { source } = await buildMethods();
  const body = extractMethodBody(source, "syncMarkdownBlockPresentation");

  assert.match(body, /adoptText && meta\.hint[\s\S]{0,120}block\.textHint = meta\.hint/,
    "textHint may only be written for a trusted match");
  assert.match(body, /adoptText && !holdActive && !elementIsTask[\s\S]{0,80}Number\.isFinite\(info\.lineStart\)[\s\S]{0,320}block\.lineStart = info\.lineStart/,
    "line numbers may only be learned from a settled, non-task render");
  assert.match(body, /const elementIsTask = Boolean\(element\.matches\?\.\("li\.task-list-item"\)\)/,
    "task renderers synthesise 0-based line numbers and must never be adopted");
  assert.match(body, /blockHintStillRendered[\s\S]{0,160}blockHint === elementHint \|\| \(rangeUnique && !blockHintStillRendered\)/,
    "a bare line-range match must be rejected when the record's own text is still rendered");
});

test("the binding pass prefers text identity over a bare line range", async () => {
  const { source } = await buildMethods();
  const body = extractMethodBody(source, "syncMarkdownBlockPresentation");
  const hintIndex = body.indexOf("takeUnused(hintCandidates.get(hintKey), block)");
  const rangeIndex = body.indexOf("takeUnusedRange(rangeCandidates.get(rangeKey), block)");
  assert.ok(hintIndex > 0 && rangeIndex > 0);
  assert.ok(hintIndex < rangeIndex, "hint matching must be consulted before the raw line range");
});

test("an unmatched but still connected block keeps its presentation", async () => {
  const { source } = await buildMethods();
  const body = extractMethodBody(source, "syncMarkdownBlockPresentation");

  assert.match(body, /!next\.has\(id\) && element\?\.isConnected[\s\S]{0,260}applyMarkdownBlockFlowPresentation\(record, element\)/,
    "clearing the presentation of a connected block is what turned a hiccup into a vertical row");
});

test("the identity marker is trusted without re-deriving the text", async () => {
  const { source } = await buildMethods();
  const body = extractMethodBody(source, "syncMarkdownBlockPresentation");

  assert.match(body, /const previousMatches = !used\.has\(previous\) && previous\?\.isConnected[\s\S]{0,160}noteDrawMarkdownBlockId === block\.id/);
  assert.doesNotMatch(body, /const previousMatches = [^;]*identityMatches\(block, previous\)/);
});

test("list reconciliation tolerates a render that drops or adds a single row", async () => {
  const { source } = await buildMethods();
  const body = extractMethodBody(source, "syncMarkdownBlockPresentation");

  assert.match(body, /const pairAt = \(recordIndex, candidateIndex\)/);
  assert.match(body, /pairAt\(anchor\.recordIndex \+ \(index - anchor\.candidateIndex\), index\)/);
  assert.match(body, /pairAt\(index, index\)/, "positional fallback must exist");
  // The old guard required the record count to equal the rendered row count
  // exactly, so one lost row collapsed the whole list.
  assert.doesNotMatch(body, /taskRecords\.length === group\.length/);
});

test("the binding pass never resolves a task item by a bare line range", async () => {
  const { source } = await buildMethods();
  const body = extractMethodBody(source, "syncMarkdownBlockPresentation");
  assert.match(body, /const match = takeUnusedRange\(rangeCandidates\.get\(rangeKey\), block\)[\s\S]{0,120}!match\.matches\?\.\("li\.task-list-item"\)/);
  const recordSource = extractMethodBody(source, "findMarkdownBlockRecordForElement");
  assert.match(recordSource, /const rangeFallbackAllowed = Boolean\(hint\) && !blockElement\.matches\?\.\("li\.task-list-item"\)/);
});

test("element type wins over a stale render kind when the binding is trusted", async () => {
  const { source } = await buildMethods();
  const body = extractMethodBody(source, "syncMarkdownBlockPresentation");
  assert.match(body, /const elementKind = markdownElementRenderKind\(element\)[\s\S]{0,160}block\.renderKind = ""/);
});
