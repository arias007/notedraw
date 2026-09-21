import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

test("completing a parallel task recovers the row without toggling the toolbar", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const rememberStart = source.indexOf("  rememberMarkdownIdentityMutation(event) {");
  const rememberSource = source.slice(rememberStart, source.indexOf("  restorePendingMarkdownIdentityPresentation(mutations = [])", rememberStart));
  // The restore ladder used to give up silently when the renderer replaced
  // task members in a way the parent+index fallback could not match; the row
  // stayed collapsed until the user toggled the magic wand. Now every ladder
  // tick detects the collapsed row and borrows the wand-close settlement.
  assert.match(rememberSource, /pendingIdentitySettlementQueued = false/);
  assert.match(rememberSource, /if \(delay > 0 && this\.pendingMarkdownIdentityRowCollapsed\(\)\) \{\s*this\.recoverPendingMarkdownIdentityRowWithSettlement\(\);\s*\}/);
  assert.match(rememberSource, /for \(const delay of \[1100, 2200\]\) \{[\s\S]*pendingMarkdownIdentityRowCollapsed\(\)[\s\S]*recoverPendingMarkdownIdentityRowWithSettlement\(\)[\s\S]*reconcileSettledReadingSurface\(\)/);

  const collapsedStart = source.indexOf("  pendingMarkdownIdentityRowCollapsed() {");
  const collapsedSource = source.slice(collapsedStart, source.indexOf("  recoverPendingMarkdownIdentityRowWithSettlement()", collapsedStart));
  assert.match(collapsedSource, /notedraw-md-inline-grid-item/);
  assert.match(collapsedSource, /--notedraw-md-inline-span/);

  const recoverStart = source.indexOf("  recoverPendingMarkdownIdentityRowWithSettlement() {");
  const recoverSource = source.slice(recoverStart, recoverStart + 900);
  // The recovery reuses the exact magic-wand close path rather than the
  // signature-guarded reconcile, and only queues one settlement per click.
  assert.match(recoverSource, /this\.pendingIdentitySettlementQueued\)[\s\S]*return true/);
  assert.match(recoverSource, /this\.queueReadingSurfaceSettlement\(\)/);
  assert.match(recoverSource, /this\.ensureDrawingsLoaded\(\)\.then\(queue\)/);
});
