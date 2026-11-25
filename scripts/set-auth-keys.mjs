// Sets Convex Auth's signing keys + SITE_URL on a Convex deployment.
// Usage (production):
//   CONVEX_DEPLOY_KEY='prod:...' node scripts/set-auth-keys.mjs https://your-app.vercel.app
// Without CONVEX_DEPLOY_KEY it targets the deployment in .env.local.
// Refuses to replace existing keys (that would sign everyone out) unless --force.
// --print: don't touch any deployment, just print the three values to paste
//          into the Convex dashboard (Settings → Environment variables).
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const siteUrl = process.argv[2];
const force = process.argv.includes("--force");
const printOnly = process.argv.includes("--print");
if (!siteUrl || !/^https?:\/\//.test(siteUrl)) {
  console.error("Usage: node scripts/set-auth-keys.mjs <site url, e.g. https://your-app.vercel.app> [--force]");
  process.exit(1);
}
// Run the Convex CLI with this same Node binary: works on Windows too
// (npx is npx.cmd there, which execFileSync can't start without a shell).
const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("convex/package.json"));
const cli = join(pkgDir, require("convex/package.json").bin.convex);
function makeKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).trim().replace(/\n/g, " ");
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey.export({ format: "jwk" }) }] });
  return { pem, jwks };
}

if (printOnly) {
  const { pem, jwks } = makeKeys();
  console.log("Add these 3 variables in the Convex dashboard (Production → Settings → Environment variables).");
  console.log("Copy each value exactly, on one line, without the label.\n");
  console.log("JWT_PRIVATE_KEY\n" + pem + "\n");
  console.log("JWKS\n" + jwks + "\n");
  console.log("SITE_URL\n" + siteUrl.replace(/\/$/, ""));
  process.exit(0);
}

const convex = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const existing = convex("env", "list");
if (/^JWT_PRIVATE_KEY\b/m.test(existing) && !force) {
  console.log("JWT_PRIVATE_KEY already set; keeping it. Re-run with --force to rotate (signs everyone out).");
} else {
  const { pem, jwks } = makeKeys();
  convex("env", "set", "JWT_PRIVATE_KEY", "--", pem);
  convex("env", "set", "JWKS", "--", jwks);
  console.log("Set JWT_PRIVATE_KEY and JWKS");
}
convex("env", "set", "SITE_URL", siteUrl.replace(/\/$/, ""));
console.log(`Set SITE_URL=${siteUrl.replace(/\/$/, "")}`);
