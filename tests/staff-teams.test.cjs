const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { NextRequest } = require("next/server");
const root = path.resolve(__dirname, "..");

function fixture(role = "ADMIN", options = {}) {
  const cache = new Map(), calls = [];
  const staff = { id: "actor", role, name: "Fixture Staff", email: "staff@example.invalid", isBanned: false, authInvalidBefore: null };
  const capture = (table, method, value) => async args => { calls.push({ table, method, args }); return value; };
  const db = {
    user: { findUnique: async () => staff, count: capture("user", "count", 0), findMany: capture("user", "findMany", options.people ?? []) },
    staffSession: { findUnique: async () => ({ userId: staff.id, expiresAt: new Date(Date.now() + 60000), revokedAt: null }) },
    workflowCase: { count: capture("workflowCase", "count", 2), groupBy: capture("workflowCase", "groupBy", []), findMany: capture("workflowCase", "findMany", []), create: async ({ data }) => ({ id: "new-case", ...data }) },
    supportTicket: { count: capture("supportTicket", "count", 3), groupBy: capture("supportTicket", "groupBy", []) },
    staffResource: { count: capture("staffResource", "count", 0), findMany: capture("staffResource", "findMany", []), create: async ({ data }) => { calls.push({ table: "resource-create", data }); return { id: "new-resource", ...data }; } },
    adminAudit: { create: async ({ data }) => { calls.push({ table: "audit-create", data }); return data; } },
    $queryRaw: async query => {
      if (Array.isArray(query)) return [{ unsafe: false, keys: false, roles: false, settings: false, auditRewrite: false, ownsTables: false }];
      calls.push({ table: "audit", query });
      return query.sql.includes("count(*)") ? [{ total: 0 }] : [];
    },
  };
  db.$transaction = callback => callback(db);
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
    const native = mod.require.bind(mod);
    mod.require = name => {
      if (name === "@/lib/db" || name === "./db") return { db };
      if (name === "./session") return { getAdminSession: async () => ({ uid: staff.id, sid: "fixture-session", exp: Date.now()+60000, iat: Date.now() }) };
      if (name === "next/link") return { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
      if(name === "./staff-demo") return {getDemoController:async()=>null};
      if (name === "next/navigation") return {
        redirect: target => { throw new Error("redirect:" + target); }, notFound: () => { throw new Error("not-found"); },
        usePathname: () => options.pathname ?? "/dashboard", useSearchParams: () => new URLSearchParams(options.search), useRouter: () => ({ refresh() {}, push() {},replace() {} }),
      };
      if (name.endsWith("action-form")) return { ActionForm: ({ label }) => React.createElement("button", null, label) };
      if (name.startsWith("@/") || name.startsWith(".")) {
        const candidate = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
        return load(candidate + (fs.existsSync(candidate + ".tsx") ? ".tsx" : ".ts"));
      }
      return native(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  }
  return { staff, calls, load };
}

for (const [role, slug] of [["SUPPORT", "customer-support"], ["SUPPORT_SUPERVISOR", "customer-support"], ["SAFETY", "safety"]]) {
  test(`${role} sees only its team's tools and no Admin staff/audit links`, () => {
    const f = fixture(role, { pathname: `/dashboard/teams/${slug}` });
    const { staffNavigation } = f.load("src/lib/staff-teams.ts"), groups = staffNavigation(role);
    assert.deepEqual(groups.map(group => group.team), [slug]);
    assert(!groups.flatMap(group => group.links).some(link => link.management));
    const Shell = f.load("src/app/dashboard/admin-shell.tsx").AdminShell;
    const html = renderToStaticMarkup(React.createElement(Shell, { admin: f.staff }, "Workspace"));
    for (const label of ["CS audit logs", "CS staff", "Finance audit logs", "Finance staff", "Safety audit logs", "Safety staff", "All reviews", "All audit logs"]) assert(!html.includes(">" + label + "<"), label);
    if (slug === "customer-support") { assert(html.includes("Support inbox")); assert(!html.includes("Payment records")); assert(!html.includes("Rider applications")); }
    if (slug === "finance") { assert(html.includes("Payment records")); assert(!html.includes("Support inbox")); assert(!html.includes("Rider applications")); }
    if (slug === "safety") { assert(html.includes("Rider applications")); assert(!html.includes("Support inbox")); assert(!html.includes("Payment records")); }
  });
}

test("Admin receives staff and audit pages inside every team section", () => {
  const f = fixture(), { staffNavigation } = f.load("src/lib/staff-teams.ts"), groups = staffNavigation("ADMIN");
  assert.equal(groups.filter(group => group.team).length, 2);
  for (const [slug, prefix] of [["customer-support", "CS"], ["safety", "Safety"]]) {
    const links = groups.find(group => group.team === slug).links;
    assert(links.some(link => link.label === prefix + " staff" && link.management));
    assert(links.some(link => link.label === prefix + " audit logs" && link.management));
  }
  assert(groups.find(group => group.label === "Operations"));
});

test("supervisors retain support workload without gaining Admin management pages", () => {
  const { staffNavigation } = fixture().load("src/lib/staff-teams.ts");
  assert(staffNavigation("SUPPORT_SUPERVISOR")[0].links.some(link => link.href === "/dashboard/team"));
  assert(!staffNavigation("SUPPORT")[0].links.some(link => link.href === "/dashboard/team"));
});

test("current-page matching distinguishes team reviews and nested management pages", () => {
  const { staffNavigation, isStaffNavActive } = fixture().load("src/lib/staff-teams.ts");
  const links = staffNavigation("ADMIN").flatMap(group => group.links);
  for (const [pathname, search, expected] of [["/dashboard/cases", "team=safety", "Safety reviews"], ["/dashboard/teams/customer-support/audit", "", "CS audit logs"], ["/dashboard/resources", "team=safety", "Knowledge & updates"]]) {
    const active = links.filter(link => isStaffNavActive(link.href, pathname, new URLSearchParams(search)));
    assert.equal(active.length, 1); assert.equal(active[0].label, expected);
  }
});

for (const role of ["SUPPORT", "SUPPORT_SUPERVISOR", "SAFETY"]) {
  test(`${role} cannot open any staff roster or team audit page directly`, async () => {
    for (const team of ["customer-support", "safety"]) for (const route of ["staff", "audit"]) {
      const f = fixture(role), Page = f.load(`src/app/dashboard/teams/[team]/${route}/page.tsx`).default;
      await assert.rejects(Page({ params: Promise.resolve({ team }), searchParams: Promise.resolve({}) }), /redirect:\/dashboard\/workspace/);
      assert.equal(f.calls.length, 0, "Management records must not be queried before authorization");
    }
  });
}

test("cross-team overview links cannot expose another role's team", async () => {
  for (const [role, team] of [["SUPPORT", "safety"], ["SAFETY", "customer-support"]]) {
    const f = fixture(role), Page = f.load("src/app/dashboard/teams/[team]/page.tsx").default;
    await assert.rejects(Page({ params: Promise.resolve({ team }) }), /redirect:/);
    assert.equal(f.calls.length, 0);
  }
});

test("team overviews scope their queues and hide management cards from staff", async () => {
  for (const [role, slug, kind] of [["SUPPORT", "customer-support", "ESCALATION"], ["SAFETY", "safety", "SAFETY"]]) {
    const f = fixture(role), Page = f.load("src/app/dashboard/teams/[team]/page.tsx").default;
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ team: slug }) }));
    assert(!html.includes("Team management"));
    assert(f.calls.filter(call => call.table === "workflowCase").every(call => JSON.stringify(call.args.where).includes(role === "SUPPORT" ? '"createdById":"actor"' : `"kind":"${kind}"`)));
  }
});

test("Admin team roster filters never widen to other staff roles", async () => {
  const f = fixture(), Page = f.load("src/app/dashboard/teams/[team]/staff/page.tsx").default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ team: "customer-support" }), searchParams: Promise.resolve({ q: "Alex", status: "active", page: "999" }) }));
  const query = f.calls.find(call => call.table === "user" && call.method === "findMany").args;
  assert.deepEqual(query.where.role.in, ["SUPPORT", "SUPPORT_SUPERVISOR"]);
  assert.equal(query.where.isBanned, false); assert.equal(query.skip, 0);
  assert(html.includes("CS staff")); assert(html.replace(/<!--.*?-->/g, "").includes("No CS staff match"));
});

test("Admin's team review context fixes the case kind and preserves it in filters", async () => {
  const f = fixture(), Page = f.load("src/app/dashboard/cases/page.tsx").default;
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ team: "customer-support", kind: "FINANCE", assigned: "support-person" }) }));
  const query = f.calls.find(call => call.table === "workflowCase").args;
  assert(query.where.AND.some(part => part.kind === "ESCALATION"));
  assert(query.where.AND.some(part => part.assignedToId === "support-person"));
  assert(!html.includes('name="team"')); assert(!html.includes('Queue default'));
});

test("staff cannot switch team reviews or resources through query parameters", async () => {
  for (const page of ["resources"]) {
    const f = fixture("SUPPORT"), Page = f.load(`src/app/dashboard/${page}/page.tsx`).default;
    await assert.rejects(Page({ searchParams: Promise.resolve({ team: "safety" }) }), /redirect:/);
    assert.equal(f.calls.length, 0);
  }
});

test("Admin team resources apply the same relevant categories as that team", async () => {
  const f = fixture(), Page = f.load("src/app/dashboard/resources/page.tsx").default;
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ team: "customer-support", kind: "SAFETY_GUIDE" }) }));
  const query = f.calls.find(call => call.table === "staffResource").args;
  assert.deepEqual(query.where.kind.in, ["KNOWLEDGE", "TEMPLATE", "ANNOUNCEMENT"]);
  assert(html.includes('name="team" value="customer-support"')); assert(!html.includes('value="SAFETY_GUIDE"'));
});

test("invalid teams and invalid audit dates do not query management records", async () => {
  const f = fixture(), Page = f.load("src/app/dashboard/teams/[team]/audit/page.tsx").default;
  await assert.rejects(Page({ params: Promise.resolve({ team: "unknown" }), searchParams: Promise.resolve({}) }), /not-found/);
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ team: "safety" }), searchParams: Promise.resolve({ from: "2026-10-30", to: "2026-10-01" }) }));
  assert(html.includes('role="alert"')); assert.equal(f.calls.length, 0);
});

test("publishing preserves team audit context and enforces the team's resource categories", async () => {
  for (const [role, team, kind, expected] of [["ADMIN", "safety", "ANNOUNCEMENT", 201], ["ADMIN", "safety", "KNOWLEDGE", 403], ["SUPPORT_SUPERVISOR", "safety", "KNOWLEDGE", 403], ["SUPPORT_SUPERVISOR", "customer-support", "TEMPLATE", 201]]) {
    const f = fixture(role), post = f.load("src/app/api/resources/route.ts").POST;
    const response = await post(new NextRequest("https://fixture.invalid/api/resources", { method: "POST", headers: { origin: "https://fixture.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ team, kind, title: "Fixture", body: "Fixture guidance" }) }));
    assert.equal(response.status, expected, role + " " + kind);
    const audit = f.calls.find(call => call.table === "audit-create");
    if (expected === 201) assert.equal(audit.data.details.team, team);
    else assert.equal(audit, undefined);
  }
});

test("retired Finance role cannot submit new reviews", async () => {
  const f=fixture("FINANCE"),post=f.load("src/app/api/cases/route.ts").POST;
  const response=await post(new NextRequest("https://fixture.invalid/api/cases",{method:"POST",headers:{origin:"https://fixture.invalid","Content-Type":"application/json"},body:JSON.stringify({kind:"FINANCE",title:"Review",summary:"Facts",priority:"NORMAL"})}));
  assert.equal(response.status,401);
});
