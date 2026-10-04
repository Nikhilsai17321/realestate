import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "dist");
const target = join(root, "public");

if (!existsSync(source)) throw new Error("Run the Vite build before publishing static files.");
for (const entry of readdirSync(target)) {
  if (entry !== "robots.txt") rmSync(join(target, entry), { recursive: true, force: true });
}
cpSync(source, target, { recursive: true, force: true });
