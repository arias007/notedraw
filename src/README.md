# Source Layout

`src/main.js` is the build entry. It exports the NoteDraw Obsidian plugin class from `src/notedraw-plugin.js`.

The release artifact remains the Obsidian-standard root `main.js`, generated with:

```bash
npm run build
```

This first source split keeps behavior unchanged while making future module extraction easier.
