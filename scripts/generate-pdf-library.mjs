import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const pdfDirectory = path.join(process.cwd(), "public", "pdfs");
const manifestPath = path.join(process.cwd(), "public", "pdf-library.json");

await mkdir(pdfDirectory, { recursive: true });
const entries = (await readdir(pdfDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"));
const files = [];
for (const entry of entries) {
  const contents = await readFile(path.join(pdfDirectory, entry.name));
  files.push({
    name: entry.name.replace(/\.pdf$/i, ""),
    file: entry.name,
    version: createHash("sha256").update(contents).digest("hex").slice(0, 12),
  });
}
files.sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));

await writeFile(manifestPath, `${JSON.stringify(files, null, 2)}\n`, "utf8");
console.log(`PDF library: ${files.length} file(s)`);
