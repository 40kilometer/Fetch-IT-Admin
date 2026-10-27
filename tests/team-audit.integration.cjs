// Executes the real audit SQL against PostgreSQL CTE fixtures. Every query is a
// SELECT; fixtures shadow table names without creating schemas or changing data.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { parseEnv } = require("node:util");
const ts = require("typescript");
const { Prisma, PrismaClient } = require("@prisma/client");
const root = path.resolve(__dirname, "..");

test("team audit isolation, pagination, dates and search execute correctly in PostgreSQL", { skip: process.env.RUN_TEAM_AUDIT_INTEGRATION !== "1" }, async () => {
  const connection = process.env.TEAM_AUDIT_DATABASE_URL ?? parseEnv(fs.readFileSync(path.join(root, ".env.production.repair.local"), "utf8")).DATABASE_URL;
  const db = new PrismaClient({ datasourceUrl: connection });
  const users = [{ id: "cs", role: "SUPPORT" }, { id: "finance", role: "FINANCE" }, { id: "safety", role: "SAFETY" }, { id: "admin", role: "ADMIN" }];
  const cases = [{ id: "cs-case", kind: "ESCALATION" }, { id: "finance-case", kind: "FINANCE" }, { id: "safety-case", kind: "SAFETY" }];
  const event = (id, actorId, entityType, entityId, action = "UPDATED", details = {}) => ({ id, actorId, actorName: actorId + " fixture", entityType, entityId, action, details, createdAt: "2026-10-27T04:00:00Z" });
  const events = [event("cs-login", "cs", "AUTH", "cs", "LOGIN_SUCCEEDED"), event("finance-login", "finance", "AUTH", "finance", "LOGIN_SUCCEEDED"), event("safety-login", "safety", "AUTH", "safety", "LOGIN_SUCCEEDED"),
    event("cs-ticket", "admin", "SUPPORT", "ticket"), event("cs-case-event", "admin", "CASE", "cs-case"), event("finance-case-event", "admin", "CASE", "finance-case"), event("safety-case-event", "admin", "CASE", "safety-case"),
    event("payment", "admin", "BOOKING", "booking", "PAYMENT_UPDATED"), event("application", "admin", "RIDER_APPLICATION", "application"),
    event("cs-guide", "admin", "RESOURCE", "guide", "RESOURCE_PUBLISHED", { kind: "KNOWLEDGE" }), event("safety-guide", "admin", "RESOURCE", "guide", "RESOURCE_PUBLISHED", { kind: "SAFETY_GUIDE" }),
    event("finance-update", "admin", "RESOURCE", "update", "RESOURCE_PUBLISHED", { team: "finance", kind: "ANNOUNCEMENT" }), event("admin-login", "admin", "AUTH", "admin", "LOGIN_SUCCEEDED"), event("shared-news", "admin", "RESOURCE", "news", "RESOURCE_PUBLISHED", { kind: "ANNOUNCEMENT" })];
  const cte = Prisma.sql`WITH "User" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(users)}::jsonb) AS u(id text, role text)),
    "WorkflowCase" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(cases)}::jsonb) AS c(id text, kind text)),
    "AdminAudit" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(events)}::jsonb) AS a(id text, "actorId" text, "actorName" text, action text, "entityType" text, "entityId" text, details jsonb, "createdAt" timestamptz))`;
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
    const native = mod.require.bind(mod);
    mod.require = name => name === "./db" ? { db: { $queryRaw: query => db.$queryRaw(Prisma.sql`${cte} ${query}`) } } : name.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), name + ".ts"))) : native(name);
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  }
  try {
    const { readTeamAudit } = load("src/lib/team-audit.ts"), { STAFF_TEAMS } = load("src/lib/staff-teams.ts");
    const expected = { "customer-support": ["cs-login", "cs-ticket", "cs-case-event", "cs-guide"], finance: ["finance-login", "finance-case-event", "payment", "finance-update"], safety: ["safety-login", "safety-case-event", "application", "safety-guide"] };
    const filters = { q: "", from: "", to: "", page: "999" };
    for (const team of STAFF_TEAMS) {
      const result = await readTeamAudit(team, filters);
      assert.deepEqual(result.events.map(event => event.id).sort(), expected[team.slug].sort());
      assert.equal(result.total, 4); assert.equal(result.page, 1);
      assert.equal((await readTeamAudit(team, { ...filters, q: "' OR 1=1 --" })).total, 0);
      assert.equal((await readTeamAudit(team, { ...filters, from: "2026-10-28" })).total, 0);
    }
    const finance = STAFF_TEAMS.find(team => team.slug === "finance");
    assert.equal((await readTeamAudit(finance, { ...filters, q: "PAYMENT_UPDATED" })).events[0].id, "payment");
    assert.equal((await readTeamAudit(finance, { ...filters, from: "2026-10-27", to: "2026-10-27" })).total, 4);
  } finally { await db.$disconnect(); }
});
