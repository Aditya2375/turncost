import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("docs/src", { recursive: true });
for (const f of ["index.html", "styles.css"]) copyFileSync(f, `docs/${f}`);
for (const f of ["model.js", "app.js"])
  copyFileSync(`web/src/${f}`, `docs/src/${f}`);
