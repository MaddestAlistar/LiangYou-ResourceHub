import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const text = name => readFileSync(name, "utf8");
const data = JSON.parse(text("data/projects.json"));
const html = text("index.html");
const css = text("style.css");
const js = text("app.js");

assert(Array.isArray(data.projects) && data.projects.length >= 3, "Live projects missing");
assert(Array.isArray(data.future) && data.future.length >= 1, "Future roadmap missing");
assert.equal(new Set([...data.projects, ...data.future].map(p => p.id)).size, data.projects.length + data.future.length, "Duplicate IDs");

for (const p of data.projects) {
  assert(p.stage === "live" && p.title && p.description && p.repo, "Incomplete project data");
  assert(Array.isArray(p.apps) && p.apps.length > 0, "Missing app compatibility data");
  assert(Array.isArray(p.imports) && p.imports.length > 0, "Missing subscriptions");
  assert(Array.isArray(p.steps) && p.steps.length > 0, "Missing onboarding steps");
  for (const imp of p.imports) {
    const url = new URL(imp.url);
    assert(url.protocol === "https:" && url.hostname === "raw.githubusercontent.com", "Unexpected import host");
    assert(url.pathname.startsWith("/MaddestAlistar/"), "Unexpected import owner");
    assert(imp.name && imp.detail, "Import labels are required");
  }
  for (const picture of p.images) assert(new URL(picture).protocol === "https:", "Preview must use HTTPS");
}
for (const p of data.future) assert(p.title && p.description && p.id, "Incomplete roadmap item");
for (const marker of ["projectGrid", "projectDialog", "roadmapGrid", "projectSearch", "libraryCount", "style.css", "app.js"]) {
  assert(html.includes(marker), "Missing HTML marker: " + marker);
}
assert(js.includes('fetch("./data/projects.json"'), "Catalog not loaded dynamically");
assert(css.includes("@media(max-width:580px)"), "Mobile layout missing");
assert(text(".nojekyll") === "", "Do not delete .nojekyll");
console.log("PASS: resource catalogue (" + data.projects.length + " live / " + data.future.length + " planned), imports, entrypoints, mobile styles.");
