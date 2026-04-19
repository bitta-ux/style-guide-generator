# Style Guide Generator — Figma Plugin
**by Bitta.ux**

## What This Plugin Does

Scans your Figma file's variables and text styles, then generates a pixel-perfect, live-linked style guide directly on your current page. Color swatches are bound to your actual Figma variables — so when tokens update, the style guide updates too.

---

Available on the Figma Community: [Style Guide Generator by Bitta.ux] (https://www.figma.com/community/plugin/1608716453645387605/style-guide-generator-by-bitta-ux)

---


## Generated Sections

| Section | What it shows |
|---|---|
| 🎨 Primitive Colors | All color variables grouped by collection, with shade scales and hex values |
| ✍️ Typography | Every text style as a specimen with Font Family, Weight, Size, Line Height, Letter Spacing |

## How to Use

### Install
1. Open **Figma Desktop App**
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select `manifest.json` from this folder

### Generate
1. Open a Figma file that has variables and/or text styles set up
2. Run the plugin from **Plugins → Development → Style Guide Generator**
3. Click **🔍 Scan File** — stats appear showing what was found
4. Check the templates you want to generate
5. Click **✨ Generate Style Guide**
6. Style guide frames are generated on your **current page**

## File Structure

```
style-guide-plugin/
├── manifest.json   — Plugin config
├── code.js         — Core logic + template rendering
├── ui.html         — Plugin UI
└── README.md       — This file
```

## Notes

- The plugin **does not require any JSON upload** — it reads directly from your file's variables
- Re-running the plugin **replaces** any previously generated style guide frames cleanly
- All UI uses **Inter** — make sure it's available in your Figma environment
- Variable binding: color swatches are bound via `figma.variables.setBoundVariableForPaint()`

## Author

Name: Bitta Singha
- Linkedin: www.linkedin.com/in/bitta-singha-97a22a1b6
- Instagram: [@bitta.ux](https://instagram.com/bitta.ux)

## License

MIT
