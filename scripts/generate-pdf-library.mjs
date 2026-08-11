import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const pdfDirectory = path.join(process.cwd(), "public", "pdfs");
const manifestPath = path.join(process.cwd(), "public", "pdf-library.json");

await mkdir(pdfDirectory, { recursive: true });
const files = (await readdir(pdfDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
  .map((entry) => ({ name: entry.name.replace(/\.pdf$/i, ""), file: entry.name }))
  .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));

await writeFile(manifestPath, `${JSON.stringify(files, null, 2)}\n`, "utf8");
console.log(`PDF library: ${files.length} file(s)`);
