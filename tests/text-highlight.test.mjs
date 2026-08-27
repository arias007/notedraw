import assert from "node:assert/strict";
import test from "node:test";

import { pickAnchoredTextHighlightLine, pickTextHighlightLine } from "../src/text-highlight.mjs";

test("text highlight follows the line supported by most of the stroke", () => {
  const first = { id: "first", left: 100, right: 420, top: 100, bottom: 120 };
  const second = { id: "second", left: 100, right: 420, top: 132, bottom: 152 };
  const points = [
    { x: 110, y: 139 },
    { x: 180, y: 140 },
    { x: 250, y: 141 },
    { x: 320, y: 140 },
    { x: 400, y: 121 }
  ];

  assert.equal(pickTextHighlightLine([first, second], points)?.id, "second");
});

test("text highlight can attach just outside a line but rejects unrelated text", () => {
  const line = { id: "line", left: 120, right: 360, top: 220, bottom: 242 };

  assert.equal(pickTextHighlightLine([line], [{ x: 88, y: 232 }])?.id, "line");
  assert.equal(pickTextHighlightLine([line], [{ x: 20, y: 320 }]), null);
});

test("anchored text highlight restores the saved visual line instead of the first line", () => {
  const lines = [
    { id: "block", lineIndex: 0, left: 100, right: 420, top: 100, bottom: 120 },
    { id: "block", lineIndex: 1, left: 100, right: 420, top: 132, bottom: 152 },
    { id: "block", lineIndex: 2, left: 100, right: 420, top: 164, bottom: 184 }
  ];

  assert.equal(pickAnchoredTextHighlightLine(lines, { lineIndex: 2 })?.top, 164);
  assert.equal(pickAnchoredTextHighlightLine(lines, { preferredY: 145 })?.top, 132);
});
