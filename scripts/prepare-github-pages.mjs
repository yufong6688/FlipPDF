import { access, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

if (process.env.GITHUB_PAGES === "true") {
  const clientDirectory = path.join(process.cwd(), "dist", "client");
  const prefixedDirectory = path.join(clientDirectory, "FlipPDF");
  const prefixedAssets = path.join(prefixedDirectory, "_next");
  const targetAssets = path.join(clientDirectory, "_next");

  await access(prefixedAssets);
  await rm(targetAssets, { recursive: true, force: true });
  await rename(prefixedAssets, targetAssets);
  await rm(prefixedDirectory, { recursive: true, force: true });
  await writeFile(path.join(clientDirectory, ".nojekyll"), "", "utf8");
}
