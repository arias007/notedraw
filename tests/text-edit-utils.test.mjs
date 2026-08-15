import assert from "node:assert/strict";
import test from "node:test";

import { createAsyncCommitBarrier, hoistPlainTextMarker } from "../src/text-edit-utils.mjs";

class FakeNode {
  constructor(tag = "#text", text = "") {
    this.tagName = tag === "#text" ? "" : tag.toUpperCase();
    this.nodeValue = tag === "#text" ? text : null;
    this.parentNode = null;
    this.children = [];
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get childNodes() {
    return this.children;
  }

  get nextSibling() {
    const index = this.parentNode?.children.indexOf(this) ?? -1;
    return index >= 0 ? this.parentNode.children[index + 1] || null : null;
  }

  appendChild(child) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, reference) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    const index = this.children.indexOf(reference);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  cloneNode() {
    return new FakeNode(this.tagName || "#text", this.nodeValue || "");
  }
}

function text(value) {
  return new FakeNode("#text", value);
}

function marker(value) {
  const node = new FakeNode("span");
  node.appendChild(text(value));
  return node;
}

function describe(node) {
  if (!node.tagName) {
    return node.nodeValue;
  }
  return `<${node.tagName.toLowerCase()}>${node.children.map(describe).join("")}</${node.tagName.toLowerCase()}>`;
}

test("plain-text marker is lifted out of every inline formatting ancestor", () => {
  const editor = new FakeNode("div");
  const strong = new FakeNode("strong");
  const emphasis = new FakeNode("em");
  const selected = marker("selected");
  strong.appendChild(text("before"));
  emphasis.appendChild(selected);
  strong.appendChild(emphasis);
  strong.appendChild(text("after"));
  editor.appendChild(strong);

  hoistPlainTextMarker(selected, editor, (node) => ["STRONG", "EM", "SPAN"].includes(node.tagName));

  assert.equal(describe(editor), "<div><strong>before</strong><span>selected</span><strong>after</strong></div>");
  assert.equal(selected.parentNode, editor);
});

test("commit barrier waits for edits already in flight and edits queued during the wait", async () => {
  let releaseFirst;
  let releaseSecond;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  const second = new Promise((resolve) => { releaseSecond = resolve; });
  const barrier = createAsyncCommitBarrier();

  barrier.track(first);
  const waiting = barrier.wait();
  barrier.track(second);
  releaseFirst(true);
  await Promise.resolve();
  let settled = false;
  waiting.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  releaseSecond(true);
  await waiting;
  assert.equal(settled, true);
});
