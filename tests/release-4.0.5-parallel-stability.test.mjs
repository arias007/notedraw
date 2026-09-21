import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

// The presentation decision lives on the controller class, which needs a live
// Obsidian DOM. Instead of hand-waving about it, lift the real method text out
// of the shipped source and run it against a fake element. That way the frozen
// window is exercised for real rather than asserted as a string.
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
      if (char === "`") {
        quote = char;
        index += 1;
        continue;
      }
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

function makeElement(tag = "li") {
  const classes = new Set();
  const props = new Map();
  return {
    tagName: tag.toUpperCase(),
    isConnected: true,
    parentElement: null,
    dataset: {},
    classList: {
      contains: (name) => classes.has(name),
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
          return classes.has(name);
        }
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
    matches: (selector) => selector === tag,
    hasClass: (name) => classes.has(name),
    cssProp: (name) => props.get(name) || ""
  };
}

async function loadControllerMethods() {
  const source = await readFile(sourceUrl, "utf8");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const markdownInlineWidthCss = (span, widthScale = 1) => `W${span}@${Number(widthScale) || 1}`;
  const build = (name) => {
    const body = extractMethodBody(source, name);
    // eslint-disable-next-line no-new-func
    return new Function(
      "clamp",
      "markdownInlineWidthCss",
      `"use strict"; return function ${body};`
    )(clamp, markdownInlineWidthCss);
  };
  return {
    markdownLayoutHoldActive: build("markdownLayoutHoldActive"),
    markdownLayoutHoldSpanFor: build("markdownLayoutHoldSpanFor"),
    armMarkdownRepackProjectionGate: build("armMarkdownRepackProjectionGate"),
    applyMarkdownBlockFlowPresentation: build("applyMarkdownBlockFlowPresentation")
  };
}

function makeController(methods, {
  holdUntil = 0,
  holdFile = "",
  holdSpans = null,
  lane = { id: "lane" },
  element = makeElement()
} = {}) {
  const controller = {
    destroyed: false,
    markdownLayoutHoldUntil: holdUntil,
    markdownLayoutHoldFile: holdFile,
    markdownLayoutHoldSpans: holdSpans,
    readingProjectionGateUntil: 0,
    draggingStroke: false,
    resizingSelection: false,
    gridRowEnsured: 0,
    gridRowReleased: 0,
    element,
    openReadingProjectionGate(duration) {
      this.readingProjectionGateUntil = Math.max(this.readingProjectionGateUntil, Date.now() + duration);
    },
    markdownBlockFlowElement: () => element,
    markdownBlockInlineLane: () => lane,
    markdownBlockGridContainer: () => null,
    ensureMarkdownBlockGridRow: () => {
      controller.gridRowEnsured += 1;
      return null;
    },
    releaseMarkdownBlockGridRow: () => {
      controller.gridRowReleased += 1;
      return false;
    },
    isOwnedMarkdownGridRow: () => false
  };
  Object.assign(controller, methods);
  return controller;
}

test("a frozen parallel row re-applies the captured span even when the record drifted", async () => {
  const methods = await loadControllerMethods();
  const element = makeElement("li");
  const controller = makeController(methods, {
    holdUntil: Date.now() + 1000,
    holdFile: "note.md",
    holdSpans: new Map([["task-b", { span: 3, widthScale: 1 }]]),
    element
  });

  // The record now claims a full-width block; the frozen window must win.
  controller.applyMarkdownBlockFlowPresentation(
    { id: "task-b", path: "note.md", span: 12, widthScale: 1, floating: false },
    element
  );

  assert.equal(element.hasClass("notedraw-md-inline-grid-item"), true);
  assert.equal(element.cssProp("--notedraw-md-inline-span"), "3");
  assert.equal(element.cssProp("--notedraw-md-inline-width"), "W3@1");
});

test("a block outside the frozen row may not start a new inline layout while the window is open", async () => {
  const methods = await loadControllerMethods();
  const element = makeElement("li");
  const controller = makeController(methods, {
    holdUntil: Date.now() + 1000,
    holdFile: "note.md",
    holdSpans: new Map([["task-b", { span: 3, widthScale: 1 }]]),
    element
  });

  controller.applyMarkdownBlockFlowPresentation(
    { id: "some-other-block", path: "note.md", span: 4, widthScale: 1, floating: false },
    element
  );

  assert.equal(element.hasClass("notedraw-md-inline-grid-item"), false);
  assert.equal(element.cssProp("--notedraw-md-inline-span"), "");
  // It must not be restructured into a grid row either, or it would move twice.
  assert.equal(controller.gridRowEnsured, 0);
});

test("an already-inline block keeps being maintained during the frozen window", async () => {
  const methods = await loadControllerMethods();
  const element = makeElement("li");
  element.classList.add("notedraw-md-inline-grid-item");
  const controller = makeController(methods, {
    holdUntil: Date.now() + 1000,
    holdFile: "note.md",
    holdSpans: new Map([["task-b", { span: 3, widthScale: 1 }]]),
    element
  });

  controller.applyMarkdownBlockFlowPresentation(
    { id: "task-c", path: "note.md", span: 3, widthScale: 1, floating: false },
    element
  );

  assert.equal(element.cssProp("--notedraw-md-inline-span"), "3");
});

test("without a frozen window the presentation behaves exactly as before", async () => {
  const methods = await loadControllerMethods();
  const element = makeElement("li");
  const controller = makeController(methods, { element });

  controller.applyMarkdownBlockFlowPresentation(
    { id: "plain-task", path: "note.md", span: 6, widthScale: 1, floating: false },
    element
  );

  assert.equal(element.hasClass("notedraw-md-inline-grid-item"), true);
  assert.equal(element.cssProp("--notedraw-md-inline-span"), "6");
  assert.equal(element.cssProp("--notedraw-md-inline-width"), "W6@1");
});

test("a frozen row that has no lane yet is left alone instead of being rebuilt", async () => {
  const methods = await loadControllerMethods();
  const element = makeElement("li");
  const controller = makeController(methods, {
    holdUntil: Date.now() + 1000,
    holdFile: "note.md",
    holdSpans: new Map([["task-b", { span: 3, widthScale: 1 }]]),
    lane: null,
    element
  });

  controller.applyMarkdownBlockFlowPresentation(
    { id: "task-b", path: "note.md", span: 3, widthScale: 1, floating: false },
    element
  );

  assert.equal(element.hasClass("notedraw-md-inline-grid-item"), false);
  assert.equal(element.hasClass("notedraw-md-grid-item"), false);
  assert.equal(controller.gridRowEnsured, 0);
  assert.equal(controller.gridRowReleased, 0);
});

test("repacking a row arms exactly one bounded projection hold per burst", async () => {
  const methods = await loadControllerMethods();
  const before = Date.now();
  const controller = makeController(methods, {
    lane: { id: "lane" },
    element: makeElement("li")
  });

  controller.armMarkdownRepackProjectionGate();
  const first = controller.readingProjectionGateUntil;
  assert.ok(first >= before + 450, "the first repack must open a projection hold");
  controller.armMarkdownRepackProjectionGate();
  assert.equal(controller.readingProjectionGateUntil, first, "a later repack must not extend the hold");

  controller.draggingStroke = true;
  controller.readingProjectionGateUntil = 0;
  controller.armMarkdownRepackProjectionGate();
  assert.equal(controller.readingProjectionGateUntil, 0, "a drag owns its own geometry and must not hold");
});
