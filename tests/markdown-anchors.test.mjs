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
