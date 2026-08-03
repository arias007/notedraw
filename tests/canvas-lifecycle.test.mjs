import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("canvas layers stay hidden until their backing stores are initialized", async () => {
  const [source, styles] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(styles, /\.notedraw-static-canvas,\s*\.notedraw-canvas\s*\{[^}]*display:\s*none;/s);
  assert.match(styles, /\.notedraw-shell\.has-notedraw-canvas \.notedraw-static-canvas,[^}]*\.is-drawing-active \.notedraw-canvas\s*\{[^}]*display:\s*block;/s);
  assert.match(source, /this\.previewEl\.addClass\("has-notedraw-canvas"\)/);
  assert.match(source, /resetCanvasSurface\(\)\s*\{[^}]*removeClass\("has-notedraw-canvas"\)/s);
  assert.match(source, /this\.staticCanvas\.width = 1;\s*this\.staticCanvas\.height = 1;/s);
  assert.match(source, /this\.canvas\.width = 1;\s*this\.canvas\.height = 1;/s);
});

test("a visible source surface releases cached reading controllers after transitions settle", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /if \(isSourceMode\(view\)\) \{\s*if \(sourceVisible\) \{\s*for \(const rootPreview of findRootPreviewsForView\(view\)\) \{[\s\S]*controller\?\.destroy\?\.\(\);\s*resetDormantRootPreview\(view, rootPreview\);/s);
  assert.match(source, /sourceController\?\.syncFloatingControlClasses\(\);\s*if \(!previewVisible\) \{\s*continue;/s);
  assert.match(source, /previewController\.file\?\.path !== view\.file\?\.path/s);
  assert.match(source, /previewController = this\.resolveLivePreviewController\(view\)/);
});

test("root reading controllers wait for Markdown and clear only dormant preview geometry", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /if \(!isRootPreviewReady\(view, preview\)\) \{\s*existingController\?\.destroy\?\.\(\);\s*resetDormantRootPreview\(view, preview\);\s*return;/s);
  assert.match(source, /if \(!preview \|\| !view\?\.file\) \{/);
  assert.match(source, /if \(!isRootPreviewReady\(view, preview\)\) \{\s*resetDormantRootPreview\(view, preview\);\s*return null;/s);
  assert.match(source, /for \(const property of \["min-height", "padding-bottom"\]\)/);
  assert.match(source, /shouldResetDormantRootPreview\(rootPreviewLifecycleState\(view, preview\)\)/);
});

test("virtual Markdown recycling cannot discard a live reading controller", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /if \(previewController\?\.plugin === this && !previewController\.destroyed && previewController\.file\?\.path === view\.file\?\.path\) \{\s*previewController\.syncFloatingControlClasses\(\);\s*continue;/s);
  assert.match(source, /const rendererPreview = view\?\.previewMode\?\.renderer\?\.previewEl;/);
  assert.match(source, /return previews\.find\(\(preview\) => preview === rendererPreview\)/);
});
