/**
 * Drawing storage identity.
 *
 * The per-note drawing file used to be named by replacing every non
 * [a-zA-Z0-9._/-] character with "_" and every "/" with "__".  For a vault
 * whose notes have non-ASCII names that collapses whole path segments into
 * runs of underscores: "生活/身体/舞蹈.md" and "生活/身体/运动.md" both became
 * "____________.md.json".  Two different notes then shared one drawing file,
 * so ink drawn on one note showed up on the other (and the last writer won).
 *
 * The fix is to keep a short human-readable ASCII prefix for eyeballing the
 * folder and append a 64-bit path hash, which makes the name unique per vault
 * path regardless of the script the note name is written in.  The legacy name
 * is still produced so existing files can be found and migrated on read.
 */

const UNSAFE_PATH_CHARS = /[^a-zA-Z0-9._/-]/g;

function normalizeSlashes(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

/**
 * The pre-4.1 file name.  Kept only so drawings written by older versions can
 * still be located.  DO NOT use it for new files: it collides for every pair of
 * notes whose names have the same number of non-ASCII characters.
 */
export function legacyDrawingFileName(filePath = "") {
  const encoded = normalizeSlashes(filePath)
    .replace(UNSAFE_PATH_CHARS, "_")
    .replace(/\//g, "__");
  return `${encoded}.json`;
}

/**
 * Two independent 32-bit mixes rendered base 36 → 14 ASCII characters.
 * Deterministic across platforms and cheap enough to call in a render path.
 */
export function drawingPathHash(filePath = "") {
  const input = normalizeSlashes(filePath);
  let first = 0x811c9dc5;
  let second = 0x9e3779b1;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    let mixed = (second ^ code) >>> 0;
    mixed = Math.imul(mixed, 0x85ebca6b) >>> 0;
    mixed = (mixed ^ (mixed >>> 13)) >>> 0;
    second = (mixed + index + 1) >>> 0;
  }
  const head = first.toString(36).padStart(7, "0");
  const tail = (second ^ input.length) >>> 0;
  return `${head}${tail.toString(36).padStart(7, "0")}`;
}

export function drawingFileNamePrefix(filePath = "", maxLength = 40) {
  const limit = Math.max(4, Number(maxLength) || 40);
  const path = normalizeSlashes(filePath);
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .replace(UNSAFE_PATH_CHARS, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[-._]+/, "")
    .replace(/[-._]+$/, "");
  // A note named entirely in a non-ASCII script leaves nothing readable
  // behind, so fall back to a neutral prefix; the hash still identifies it.
  const readable = stem.replace(/[^A-Za-z0-9]/g, "").length >= 2 ? stem : "nd";
  return readable.length > limit ? readable.slice(0, limit) : readable;
}

/**
 * Collision-free drawing file name for one vault path.
 * Example: "生活/身体/舞蹈.md" → "_________-1a2b3c4d5e6f7g.json"
 */
export function drawingFileName(filePath = "", options = {}) {
  const path = normalizeSlashes(filePath);
  return `${drawingFileNamePrefix(path, options.maxPrefix ?? 48)}-${drawingPathHash(path)}.json`;
}

/**
 * True when a stored drawing record claims to belong to `filePath`.
 * Records without a sourcePath (very old exports) are treated as unowned so
 * they can still be adopted instead of silently dropped.
 */
export function drawingRecordBelongsToPath(record, filePath = "") {
  const owner = normalizeSlashes(record?.sourcePath ?? "").replace(/^\/+/, "");
  if (!owner) {
    return true;
  }
  return owner === normalizeSlashes(filePath).replace(/^\/+/, "");
}
