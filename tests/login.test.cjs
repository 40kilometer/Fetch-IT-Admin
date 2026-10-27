const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");
const { NextRequest } = require("next/server");

function fixture() {
  const root = path.resolve(__dirname, "..");
  const cache = new Map(), cookies = new Map(), events = [], logs = [];
  const password = crypto.randomBytes(20).toString("hex"), salt = crypto.randomBytes(16).toString("hex");
  const user = { id: "fixture-staff", email: "staff@example.invalid", name: "Fixture Staff", role: "ADMIN", isBanned: false, authIdentities: [{ passwordHash: salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex") }] };
  const state = { safe: true, failTransaction: false };
  const db = {
    user: { findUnique: async () => { events.push("account"); return user; } },
    adminAudit: { create: async ({ data }) => { events.push(data.action); return data; } },
    staffSession: { create: async ({ data }) => { events.push("session"); return data; } },
    $transaction: async callback => { if (state.failTransaction) throw new Error("fixture-sensitive-database-details"); return callback(db); },
    $queryRaw: async parts => {
      const query = parts.join("?");
      if (query.includes("RateLimitBucket")) return [{ hits: 1, retryAfter: 900 }];
      if (query.includes("rolsuper")) { events.push("guard"); return [{ unsafe: !state.safe, keys: !state.safe, settings: !state.safe, roles: !state.safe, auditRewrite: !state.safe, ownsTables: !state.safe }]; }
      return [];
    },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {}; cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports, Buffer, Date, setTimeout, clearTimeout, process: { env: { NODE_ENV: "production", ADMIN_SESSION_SECRET: "fixture-" + "a".repeat(64) } }, console: { info() {}, error: (...args) => logs.push(args) }, require: name => {
      if (name === "@/lib/db" || name === "./db") return { db };
      if (name === "./push-delivery") return { schedulePushDelivery() {} };
      if (name === "next/headers") return { cookies: async () => ({ set: (key, value) => cookies.set(key, value) }) };
      if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
      if (name.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), name + ".ts")));
      return require(name);
    } });
    return exports;
  }
  const route = load("src/app/api/auth/login/route.ts");
  const login = (secret = password) => route.POST(new NextRequest("https://staff.example.invalid/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://staff.example.invalid" }, body: JSON.stringify({ email: user.email, password: secret }) }));
  return { state, user, events, logs, cookies, login };
}

test("production privilege rejection fails closed before account verification", async () => {
  const f = fixture(); f.state.safe = false;
  const response = await f.login();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /temporarily unavailable/);
  assert.equal(f.events.includes("account"), false);
  assert.equal(f.cookies.size, 0);
  assert.equal(f.logs[0][1].stage, "runtime-access");
});

test("a database transaction failure has a safe distinct diagnostic stage", async () => {
  const f = fixture(); f.state.failTransaction = true;
  const response = await f.login();
  assert.equal(response.status, 503);
  assert.equal(f.logs[0][1].stage, "sign-in-transaction");
  assert(!JSON.stringify([await response.json(), f.logs]).includes("fixture-sensitive-database-details"));
});

test("invalid passwords remain credential errors rather than service errors", async () => {
  const f = fixture(), response = await f.login("incorrect");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Invalid credentials.");
  assert(f.events.includes("LOGIN_FAILED"));
  assert.equal(f.cookies.size, 0);
});

test("all staff roles can sign in with a safe production database", async () => {
  for (const role of ["ADMIN", "SUPPORT", "SUPPORT_SUPERVISOR", "FINANCE", "SAFETY"]) {
    const f = fixture(); f.user.role = role;
    const response = await f.login();
    assert.equal(response.status, 200, role);
    assert.equal((await response.json()).user.id, f.user.id);
    assert(f.events.indexOf("guard") < f.events.indexOf("account"));
    assert(f.events.includes("LOGIN_SUCCEEDED"));
    assert(f.events.includes("session"));
    assert.equal(f.cookies.size, 1);
  }
});
