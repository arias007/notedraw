function normalizedSource(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

export function preservesAllMovedMarkdownBlocks(source, movedBlocks) {
  let remaining = normalizedSource(source);
  for (const block of movedBlocks || []) {
    const needle = normalizedSource(block).trim();
    if (!needle) {
      return false;
    }
    const index = remaining.indexOf(needle);
    if (index < 0) {
      return false;
    }
    remaining = `${remaining.slice(0, index)}${remaining.slice(index + needle.length)}`;
  }
  return true;
}
