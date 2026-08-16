import assert from "node:assert/strict";
import test from "node:test";

import { preservesAllMovedMarkdownBlocks } from "../src/markdown-reorder.mjs";

test("Markdown reorder preserves adjacent heading blocks", () => {
  const source = "## 二级标题\n\n### 三级标题\n\n正文";
  assert.equal(preservesAllMovedMarkdownBlocks(source, ["## 二级标题", "### 三级标题"]), true);
  assert.equal(preservesAllMovedMarkdownBlocks("## 二级标题\n\n正文", ["## 二级标题", "### 三级标题"]), false);
});

test("Markdown reorder accounts for duplicate moving blocks independently", () => {
  assert.equal(preservesAllMovedMarkdownBlocks("相同\n\n相同", ["相同", "相同"]), true);
  assert.equal(preservesAllMovedMarkdownBlocks("相同", ["相同", "相同"]), false);
});
