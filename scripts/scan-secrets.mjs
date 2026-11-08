import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  /PAYPAL_CLIENT_SECRET\s*=\s*[^<\s].+/i,
  /MANDATE_SECRET\s*=\s*[^<\s].{8,}/i,
  /OWNER_API_KEY\s*=\s*[^<\s].{16,}/i,
  /AZURE_AI_API_KEY\s*=\s*[^<\s].{16,}/i,
  /DATABASE_URL\s*=\s*postgres[^<\s]+/i,
];

const files = execSync("git ls-files", { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.endsWith(".example") && !file.includes("scan-secrets"));

const hits = [];
for (const file of files) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.test(text)) hits.push(`${file} matches ${pattern}`);
  }
}

if (hits.length) {
  console.error("Secret scan failed:\n" + hits.join("\n"));
  process.exit(1);
}

console.log("Secret scan passed.");
