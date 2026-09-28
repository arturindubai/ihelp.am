// Генерация PNG-иконок из public/img/icon.svg с помощью sharp.
// Запускать из корня проекта: node scripts/gen-icons.mjs
import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public/img/icon.svg"));

const icons = [
  { size: 192, out: "public/icon-192.png" },
  { size: 512, out: "public/icon-512.png" },
  { size: 180, out: "public/icon-180.png" },
];

for (const { size, out } of icons) {
  await sharp(svg).resize(size, size).png().toFile(join(root, out));
  console.log(`✓ ${out} (${size}x${size})`);
}
