import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarkdownSourceIndex,
  findRenderedMarkdownSourceTargets,
  matchRenderedTextToMarkdown,
  resolveRenderedMarkdownSourceTarget
} from "../src/markdown-anchors.mjs";

test("a Markdown source index is reusable across rendered block lookups", () => {
  const source = Array.from({ length: 500 }, (_, index) => `- [ ] 任务 ${index}`).join("\n");
  const sourceIndex = createMarkdownSourceIndex(source);

  assert.equal(resolveRenderedMarkdownSourceTarget(source, "任务 17", {}, sourceIndex)?.line, 17);
  assert.equal(matchRenderedTextToMarkdown(source, "任务 319", sourceIndex)?.lineStart, 319);
  assert.equal(findRenderedMarkdownSourceTargets(source, "任务 499", sourceIndex)[0]?.line, 499);
  assert.equal(resolveRenderedMarkdownSourceTarget(`${source}\n额外`, "额外", {}, sourceIndex)?.line, 500);
});

test("rendered embed text matches a single Markdown line expanded by br tags", () => {
  const source = "第一段<br><br>第二段<br>第三段";
  const match = matchRenderedTextToMarkdown(source, "第一段\n第二段\n第三段");

  assert.deepEqual(match, { lineStart: 0, lineEnd: 0, confidence: 1 });
});

test("rendered headings and list items map to their Markdown source lines", () => {
  const source = [
    "# 标题",
    "",
    "- 第一项",
    "- 第二项"
  ].join("\n");

  assert.deepEqual(matchRenderedTextToMarkdown(source, "标题"), {
    lineStart: 0,
    lineEnd: 0,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "第二项"), {
    lineStart: 3,
    lineEnd: 3,
    confidence: 1
  });
});

test("task decorations may add harmless whitespace around an emoji", () => {
  const source = "- [ ] **医务科工作**: 远程，转诊📅 2026-08-03";

  assert.deepEqual(matchRenderedTextToMarkdown(source, "医务科工作: 远程，转诊 📅 2026-08-03"), {
    lineStart: 0,
    lineEnd: 0,
    confidence: 0.98
  });
});

test("a rendered multi-line block keeps the full source line range", () => {
  const source = "第一行\n第二行\n第三行";
  const match = matchRenderedTextToMarkdown(source, "第一行\n第二行\n第三行");

  assert.deepEqual(match, { lineStart: 0, lineEnd: 2, confidence: 1 });
});

test("the journal paragraph maps to one semantic block", () => {
  const source = [
    "## 干成为王",
    "![日记前言](../日记/日记插入/日记前言.md)",
    "",
    "## 今日计划",
    "- [ ] 晚间22",
    "",
    "可能的不知道，可能吧，使得漂亮为什么你是",
    "你的",
    "## 日记待办"
  ].join("\n");

  assert.deepEqual(matchRenderedTextToMarkdown(source, "可能的不知道，可能吧，使得漂亮为什么你是\n你的"), {
    lineStart: 6,
    lineEnd: 7,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "日记待办"), {
    lineStart: 8,
    lineEnd: 8,
    confidence: 1
  });
});

test("ATX and Setext headings terminate adjacent paragraphs", () => {
  const source = [
    "第一段",
    "## 无空行标题",
    "",
    "Setext 标题",
    "---",
    "下一段"
  ].join("\n");

  assert.deepEqual(matchRenderedTextToMarkdown(source, "第一段"), {
    lineStart: 0,
    lineEnd: 0,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "无空行标题"), {
    lineStart: 1,
    lineEnd: 1,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "Setext 标题"), {
    lineStart: 3,
    lineEnd: 4,
    confidence: 1
  });
});

test("fenced code, quotes, and containers keep their complete source ranges", () => {
  const source = [
    "```js",
    "const value = 1;",
    "```",
    "",
    "> 第一行",
    "> 第二行",
    "",
    "$$",
    "x + y",
    "$$",
    "",
    "::: note",
    "容器正文",
    ":::"
  ].join("\n");

  assert.deepEqual(matchRenderedTextToMarkdown(source, "const value = 1;"), {
    lineStart: 0,
    lineEnd: 2,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "第一行\n第二行"), {
    lineStart: 4,
    lineEnd: 5,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "x + y"), {
    lineStart: 7,
    lineEnd: 9,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "容器正文"), {
    lineStart: 11,
    lineEnd: 13,
    confidence: 1
  });
});

test("a single-line math block does not absorb the following paragraph", () => {
  const source = [
    "$$x + y$$",
    "下一段"
  ].join("\n");

  assert.deepEqual(matchRenderedTextToMarkdown(source, "x + y"), {
    lineStart: 0,
    lineEnd: 0,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "下一段"), {
    lineStart: 1,
    lineEnd: 1,
    confidence: 1
  });
});

test("nested list content belongs to its outer list item owner", () => {
  const source = [
    "- 外层任务",
    "  - 内层任务",
    "    内层续行",
    "- 同级任务"
  ].join("\n");

  assert.deepEqual(matchRenderedTextToMarkdown(source, "外层任务\n内层任务\n内层续行"), {
    lineStart: 0,
    lineEnd: 2,
    confidence: 1
  });
  assert.deepEqual(matchRenderedTextToMarkdown(source, "同级任务"), {
    lineStart: 3,
    lineEnd: 3,
    confidence: 1
  });
});

test("tables keep one semantic owner with or without edge pipes", () => {
  const withPipes = [
    "| 名称 | 状态 |",
    "| --- | --- |",
    "| NoteFlow | 稳定 |"
  ].join("\n");
  const withoutPipes = [
    "名称 | 状态",
    "--- | ---",
    "NoteFlow | 稳定"
  ].join("\n");

  for (const source of [withPipes, withoutPipes]) {
    assert.deepEqual(matchRenderedTextToMarkdown(source, "名称\t状态\nNoteFlow\t稳定"), {
      lineStart: 0,
      lineEnd: 2,
      confidence: 1
    });
  }
});

test("standalone media and thematic breaks retain semantic identities", () => {
  const media = findRenderedMarkdownSourceTargets("![架构图](assets/layout.png)", "架构图")[0];
  const breakTarget = findRenderedMarkdownSourceTargets("---", "---")[0];

  assert.deepEqual({ line: media.line, endLine: media.endLine, kind: media.kind }, {
    line: 0,
    endLine: 0,
    kind: "media"
  });
  assert.deepEqual({ line: breakTarget.line, endLine: breakTarget.endLine, kind: breakTarget.kind }, {
    line: 0,
    endLine: 0,
    kind: "thematic-break"
  });
});

test("unrelated rendered text does not create a false Markdown anchor", () => {
  assert.equal(matchRenderedTextToMarkdown("原始内容", "完全无关的内容"), null);
});

test("a unique drop target survives stale zero line metadata", () => {
  const source = [
    "## 干成为王",
    "![日记前言](日记前言.md)",
    "",
    "## 今日计划",
    "- [ ] 晚间22",
    "## 日记待办",
    "- [ ] **日记待办**: 📅 2026-08-09",
    "## 工作待办",
    "- [ ] **医务科工作**: 远程，转诊📅 2026-08-09",
    "## 交易日志",
    "- [ ] **写交易日志**📅 2026-08-09"
  ].join("\r\n");

  const target = resolveRenderedMarkdownSourceTarget(source, "交易日志", {
    lineStart: 0,
    lineEnd: 0
  });

  assert.equal(target.line, 9);
  assert.equal(target.endLine, 9);
  assert.equal(source.slice(target.start, target.end), "## 交易日志");
});

test("duplicate drop targets require an unambiguous nearby source line", () => {
  const source = [
    "## 重复",
    "正文",
    "## 重复"
  ].join("\n");

  assert.equal(resolveRenderedMarkdownSourceTarget(source, "重复", {
    lineStart: 1,
    lineEnd: 1
  }), null);
  assert.equal(resolveRenderedMarkdownSourceTarget(source, "重复", {
    lineStart: 2,
    lineEnd: 2
  })?.line, 2);
  assert.deepEqual(findRenderedMarkdownSourceTargets(source, "重复").map((target) => target.line), [0, 2]);
});
