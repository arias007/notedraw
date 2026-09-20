import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  platform: "browser",
  target: "es2020",
  format: "cjs",
  external: ["obsidian"],
  loader: {
    ".jpg": "dataurl",
    ".jpeg": "dataurl",
    ".png": "dataurl",
    ".webp": "dataurl",
  },
  outfile: "main.js",
  sourcemap: false,
  treeShaking: true,
  // Minifying roughly halves the bundle Obsidian must parse at startup, and
  // keeping UTF-8 verbatim avoids bloating Chinese text into escape sequences.
  minify: true,
  charset: "utf8",
  legalComments: "none",
});
