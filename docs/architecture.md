# NoteDraw architecture

## Runtime layers

NoteDraw mounts one `PreviewDrawingController` per visible surface. A surface may be an Obsidian reading view, source view, embedded note, workspace file, or a registered web surface. The controller owns the DOM shell, canvas layers, selection state, drawing data, and surface-specific coordinate conversion. `NoteDrawPlugin` owns global settings, controller lookup, drawing persistence, shared toolbar state, and the public API.

The main rendering layers are:

1. Markdown and its renderer-owned DOM remain the source of text layout.
2. `underlayEmbedLayer` and `embedLayer` render imported assets below/above the drawing canvas.
3. `underlayCanvas`, `staticCanvas`, and the active `canvas` render persisted strokes, selection overlays, and live interaction frames.
4. NoteFlow reserves space in the Markdown flow instead of moving unrelated Markdown nodes.

## Coordinate contracts

Persisted freehand points are normalized to the canvas (`x` and `y` in `[0, 1]`) and may carry a responsive anchor. Element layouts keep a source frame, a box, metrics, and optional relation anchors. During a resize, `layout-coordinates.mjs` maps client points to the logical canvas and `element-layout.mjs` projects anchored boxes into the current Markdown lane. A projection must not silently mix CSS pixels, visual zoom pixels, and document-relative coordinates.

Reading zoom is visual: the Markdown line breaks stay fixed and the reading stage is transformed. Source/edit zoom is layout-aware and may reflow Markdown. Viewport changes such as split panes or Obsidian Ctrl+/− must not be handled as an instruction to keep old CSS-pixel positions; they should let the drawing and its Markdown anchors scale together.

## Markdown and NoteFlow

`markdown-anchors.mjs` maps rendered blocks back to stable source paths and line ranges. `markdown-block-records.mjs` stores the durable identity and inline width metadata. `markdown-inline-row.mjs` calculates deterministic row spans for Markdown and NoteDraw peers. `note-flow-layout.mjs` then reserves the real row height and applies the same allocation to preview and commit. The DOM preview used while dragging is temporary; only the pointer-up transaction persists source/layout changes.

Explicit relations (groups and connectors) may move related elements. Proximity alone is not a relation. This distinction prevents unrelated neighboring marks from snapping together after a viewport resize or a Markdown mutation.

## History and persistence

Controller history stores bounded before/after entries for drawing, Markdown, and compound operations. A history navigation first commits an active text editor, then applies one entry in order. Drawing snapshots are applied to the current controller immediately so undo/redo is visible in the same render turn; `scheduleDrawingSave` persists the snapshot asynchronously and coalesces writes. Markdown history uses Vault modify and a frame-batched annotation/embed/resize refresh so repeated navigation does not create a 48ms timer chain.

The drawing persistence layer merges non-replacement saves by stable record id. Replacement saves are explicit and are used by history navigation, deletion, and operations that intentionally replace the entire drawing. Any new persistence path must preserve this distinction.

## Performance guidance

- Pointer move, selection resize, and touch pinch paths should update only the interaction canvas or a frame-batched NoteFlow preview.
- Markdown remapping and embed repair should be scheduled once per animation frame and invalidated by a generation when the surface is replaced.
- Undo/redo calls are serialized per controller so rapid keyboard or button input cannot run overlapping Vault writes and renders.
- Full normalization and JSON serialization belong in persistence/history boundaries, not in every high-frequency pointer frame.

