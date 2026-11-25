// Sets Convex Auth's signing keys + SITE_URL on a Convex deployment.
// Usage (production):
//   CONVEX_DEPLOY_KEY='prod:...' node scripts/set-auth-keys.mjs https://your-app.vercel.app
// Without CONVEX_DEPLOY_KEY it targets the deployment in .env.local.
// Refuses to replace existing keys (that would sign everyone out) unless --force.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

const siteUrl = process.argv[2];
const force = process.argv.includes("--force");
if (!siteUrl || !/^https?:\/\//.test(siteUrl)) {
  console.error("Usage: node scripts/set-auth-keys.mjs <site url, e.g. https://your-app.vercel.app> [--force]");
  process.exit(1);
}
const convex = (...args) => execFileSync("npx", ["convex", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const existing = convex("env", "list");
if (/^JWT_PRIVATE_KEY\b/m.test(existing) && !force) {
  console.log("JWT_PRIVATE_KEY already set; keeping it. Re-run with --force to rotate (signs everyone out).");
} else {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).trim().replace(/\n/g, " ");
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey.export({ format: "jwk" }) }] });
  convex("env", "set", "JWT_PRIVATE_KEY", "--", pem);
  convex("env", "set", "JWKS", "--", jwks);
  console.log("Set JWT_PRIVATE_KEY and JWKS");
}
convex("env", "set", "SITE_URL", siteUrl.replace(/\/$/, ""));
console.log(`Set SITE_URL=${siteUrl.replace(/\/$/, "")}`);
