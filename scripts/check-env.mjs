import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");
const banned = [
  "VITE_MISTRAL_API_KEY",
  "VITE_SUPABASE_SECRET_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY"
];

const envKeys = readKeys(envPath);
const exampleKeys = readKeys(examplePath);
const failures = [];

for (const key of banned) {
  if (envKeys.has(key) || exampleKeys.has(key)) {
    failures.push(`Banned frontend secret variable found: ${key}`);
  }
}

for (const key of ["MISTRAL_API_KEY", "MISTRAL_MODEL", "VITE_API_BASE_URL"]) {
  if (!exampleKeys.has(key)) {
    failures.push(`Missing .env.example key: ${key}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Environment template check passed. Secret values were not printed.");

function readKeys(filePath) {
  const keys = new Set();
  if (!fs.existsSync(filePath)) {
    return keys;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}
