import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarkdownSourceIndex,
  findRenderedMarkdownSourceTargets,
  matchRenderedTextToMarkdown,
  resolveMarkdownEmbedSourceTarget,
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

test("embedded note moves resolve the host embed token instead of rendered child text", () => {
  const source = [
    "# 宿主笔记",
    "",
    "![[资料/项目说明.md|项目说明]]",
    "",
    "结尾"
  ].join("\n");
  const target = resolveMarkdownEmbedSourceTarget(source, "资料/项目说明", {
    lineStart: 2,
    lineEnd: 2
  }, createMarkdownSourceIndex(source));

  assert.equal(target?.line, 2);
  assert.equal(target?.text, "![[资料/项目说明.md|项目说明]]");
  assert.notEqual(target?.text, "被嵌入笔记渲染出的正文");
});

test("duplicate embedded notes use the host line and keep heading destinations distinct", () => {
  const source = [
    "![[项目#概览]]",
    "正文",
    "![[项目#任务|任务区]]"
  ].join("\n");

  assert.equal(resolveMarkdownEmbedSourceTarget(source, "项目#任务", { lineStart: 2 })?.line, 2);
  assert.equal(resolveMarkdownEmbedSourceTarget(source, "项目", {}) , null);
});

test("every draggable Markdown block kind resolves one stable host range", () => {
  const source = [
    "# 标题",
    "",
    "普通文字 [网页链接](https://example.com)",
    "",
    "~~删除线~~",
    "",
    "- [ ] 待办任务",
    "",
    "| 名称 | 说明 |",
    "| --- | --- |",
    "| Markdown | 轻量标记 |",
    "",
    "```js",
    "console.log(1)",
    "```",
    "",
    "![工作簿](资料/工作簿.xlsx)",
    "",
    "![嵌入笔记](资料/项目说明.md)",
    "",
    "> 引用内容"
  ].join("\n");
  const index = createMarkdownSourceIndex(source);
  const renderedCases = [
    ["标题", 0, 0],
    ["普通文字 网页链接", 2, 2],
    ["删除线", 4, 4],
    ["待办任务", 6, 6],
    ["名称\t说明\nMarkdown\t轻量标记", 8, 10],
    ["console.log(1)", 12, 14],
    ["引用内容", 20, 20]
  ];
  for (const [rendered, line, endLine] of renderedCases) {
    const target = resolveRenderedMarkdownSourceTarget(source, rendered, {
      lineStart: line,
      lineEnd: endLine
    }, index);
    assert.equal(target?.line, line, rendered);
    assert.equal(target?.endLine, endLine, rendered);
  }
  assert.equal(resolveMarkdownEmbedSourceTarget(source, "资料/工作簿.xlsx", { lineStart: 16 }, index)?.line, 16);
  assert.equal(resolveMarkdownEmbedSourceTarget(source, "资料/项目说明.md", { lineStart: 18 }, index)?.line, 18);
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

test("Callouts and footnote-style links keep one source identity across rendered drag text", () => {
  const source = [
    "### Callout",
    "",
    "> [!note]  ",
    "> 这是一条提示。",
    "",
    "> [!warning]- 自定义标题",
    "> 警告正文",
    "",
    "这里有一个脚注引用[^1](app://-/footnote)。",
    "",
    "普通脚注[^ref]。"
  ].join("\n");
  const sourceIndex = createMarkdownSourceIndex(source);
  const cases = [
    ["Note\n这是一条提示。", 3, 2, 3],
    ["自定义标题\n警告正文", 6, 5, 6],
    ["这里有一个脚注引用。", 8, 8, 8],
    ["普通脚注。", 10, 10, 10],
    ["普通脚注ref。", 10, 10, 10]
  ];

  for (const [rendered, staleLine, line, endLine] of cases) {
    const target = resolveRenderedMarkdownSourceTarget(source, rendered, {
      lineStart: staleLine,
      lineEnd: staleLine
    }, sourceIndex);
    assert.equal(target?.line, line, rendered);
    assert.equal(target?.endLine, endLine, rendered);
  }
  assert.deepEqual(matchRenderedTextToMarkdown(source, "Note\n这是一条提示。", sourceIndex), {
    lineStart: 2,
    lineEnd: 3,
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
  const alternateBreak = resolveRenderedMarkdownSourceTarget("***", "---", { lineStart: 0 });

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
  assert.deepEqual({ line: alternateBreak.line, endLine: alternateBreak.endLine, kind: alternateBreak.kind }, {
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
