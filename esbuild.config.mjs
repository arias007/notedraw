import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  platform: "node",
  target: "es2020",
  format: "cjs",
  external: ["obsidian"],
  outfile: "main.js",
  sourcemap: false,
  treeShaking: true,
  legalComments: "none",
});
