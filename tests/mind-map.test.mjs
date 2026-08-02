import assert from "node:assert/strict";
import test from "node:test";

import { layoutMindMap, parseMarkdownMindMap, replaceMarkdownMindMapNodeText } from "../src/mind-map.mjs";

test("mind map parser preserves heading, list, task, quote, table, and paragraph relationships", () => {
  const model = parseMarkdownMindMap(`---
tag: demo
---
# Project
Opening paragraph.

## Work
- First
  - Nested
- [x] Complete

> Important

| Name | Value |
| --- | --- |
| A | 1 |
` , { title: "Example" });

  const byText = new Map(model.nodes.map((node) => [node.text, node]));
  assert.equal(byText.get("Project").parentId, "root");
  assert.equal(byText.get("Work").parentId, byText.get("Project").id);
  assert.equal(byText.get("Opening paragraph.").parentId, byText.get("Project").id);
  assert.equal(byText.get("Nested").parentId, byText.get("First").id);
  assert.equal(byText.get("[x] Complete").type, "task");
  assert.equal(byText.get("Important").type, "quote");
  assert.equal(byText.get("A | 1").type, "table");
  assert.equal(byText.get("Project").sourceText, "# Project");
  assert.ok(Number.isInteger(byText.get("Opening paragraph.").sourceEndLine));
  assert.equal(model.truncated, false);
});

test("mind map layout emits stable editable nodes and parent-child edges inside the available width", () => {
  const model = parseMarkdownMindMap("# A\n## B\n- C\n- D\n## E", { title: "Map" });
  const geometry = layoutMindMap(model, {
    originX: 40,
    originY: 80,
    canvasWidth: 760,
    canvasHeight: 900
  });

  assert.equal(geometry.nodes.length, model.nodes.length);
  assert.equal(geometry.edges.length, model.nodes.length - 1);
  assert.ok(geometry.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.ok(geometry.nodes.every((node) => node.x >= 0 && node.x + node.width <= 760.001));
  const root = geometry.nodes.find((node) => node.id === "root");
  const child = geometry.nodes.find((node) => node.parentId === "root");
  assert.ok(child.x > root.x);
});

test("mind map parser reports truncation without breaking parent references", () => {
  const model = parseMarkdownMindMap("# A\n- one\n- two\n- three\n- four", { title: "Map", maxNodes: 4 });
  const ids = new Set(model.nodes.map((node) => node.id));

  assert.equal(model.nodes.length, 4);
  assert.equal(model.truncated, true);
  assert.ok(model.nodes.every((node) => node.parentId === null || ids.has(node.parentId)));
});

test("mind map nodes keep renderable inline Markdown and embeds without exposing heading markers", () => {
  const model = parseMarkdownMindMap([
    "## **Rendered** heading",
    "- See [[Reference|linked note]]",
    "- ![[diagram.png]]",
    "![remote](https://example.com/image.png)"
  ].join("\n"), { title: "Map" });

  const heading = model.nodes.find((node) => node.type === "heading");
  const linked = model.nodes.find((node) => node.markdown.includes("[[Reference"));
  const embedded = model.nodes.find((node) => node.markdown.includes("![[diagram.png]]"));
  const remote = model.nodes.find((node) => node.markdown.includes("![remote]"));

  assert.equal(heading.markdown, "**Rendered** heading");
  assert.doesNotMatch(heading.markdown, /^#+\s/);
  assert.equal(linked.text, "See linked note");
  assert.equal(embedded.text, "diagram.png");
  assert.equal(remote.text, "remote");
});

test("linked mind map node edits preserve Markdown structure", () => {
  const source = "# Heading\n\n- [ ] Task\n- Item\n\n> Quote";
  const headingResult = replaceMarkdownMindMapNodeText(
    source,
    parseMarkdownMindMap(source, { title: "Linked" }).nodes.find((node) => node.type === "heading"),
    "Updated heading"
  );
  assert.match(headingResult.source, /^# Updated heading/m);

  const taskModel = parseMarkdownMindMap(headingResult.source, { title: "Linked" });
  const taskResult = replaceMarkdownMindMapNodeText(
    headingResult.source,
    taskModel.nodes.find((node) => node.type === "task"),
    "[x] Done"
  );
  assert.match(taskResult.source, /^- \[x\] Done/m);

  const quoteModel = parseMarkdownMindMap(taskResult.source, { title: "Linked" });
  const quoteResult = replaceMarkdownMindMapNodeText(
    taskResult.source,
    quoteModel.nodes.find((node) => node.type === "quote"),
    "Updated quote"
  );
  assert.match(quoteResult.source, /^> Updated quote/m);
});
