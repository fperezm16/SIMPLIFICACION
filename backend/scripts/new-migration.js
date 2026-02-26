const fs = require("fs");
const path = require("path");

const rawName = process.argv[2] || "";
const normalizedName = rawName
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

if (!normalizedName) {
  console.error("Uso: npm run migrate:new -- nombre_de_migracion");
  process.exit(1);
}

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = [
  now.getFullYear(),
  pad(now.getMonth() + 1),
  pad(now.getDate()),
  "_",
  pad(now.getHours()),
  pad(now.getMinutes()),
  pad(now.getSeconds())
].join("");

const migrationsDir = path.resolve(__dirname, "..", "migrations");
if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

const filename = `${stamp}_${normalizedName}.sql`;
const fullPath = path.join(migrationsDir, filename);
const template = `-- Migration: ${filename}
-- Escribe SQL idempotente cuando sea posible.

`;

fs.writeFileSync(fullPath, template, "utf8");
console.log(`Migracion creada: ${fullPath}`);
