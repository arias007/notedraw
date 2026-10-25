/**
 * Content identity for a note's Markdown text.
 *
 * NoteDraw writes hidden link blocks into the note and Obsidian touches mtime
 * on every save, so file stats cannot tell "the user edited the text" from
 * "the plugin saved a drawing". The hash is taken over the text itself, which
 * is the only thing that legitimately moves ink to a new paragraph.
 *
 * FNV-1a over UTF-16 code units plus the length: cheap enough to run on open,
 * and mixed with the length so a truncated document cannot collide with a
 * prefix of the same text.
 */
export function textContentHash(text) {
  const source = typeof text === "string" ? text : "";
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193) >>> 0;
  }
  return `${source.length.toString(36)}:${hash.toString(36)}`;
}

/**
 * A hash only counts as "changed" when both sides exist: a first run must not
 * trigger a corrective re-anchor pass.
 */
export function noteTextChanged(previousHash, nextHash) {
  const before = typeof previousHash === "string" ? previousHash.trim() : "";
  const after = typeof nextHash === "string" ? nextHash.trim() : "";
  return Boolean(before && after && before !== after);
}
