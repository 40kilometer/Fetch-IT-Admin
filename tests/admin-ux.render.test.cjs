const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");
function loader(db) {
  const cache = new Map(), staff = { id: "admin", role: "ADMIN", name: "Test admin" };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
    const original = mod.require.bind(mod);
    mod.require = name => {
      if (name === "@/lib/db") return { db };
      if (name === "@/lib/admin-access") return { requireAdminPage: async () => staff };
      if (name === "@/lib/staff-access") return { requireStaffPage: async () => staff };
      if (name === "next/link") return { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
      if (name === "next/navigation") return { notFound() { throw Error("not found"); } };
      if (name.endsWith("action-form")) return { ActionForm: ({ label }) => React.createElement("button", null, label) };
      if (name.endsWith("reply-form")) return { ReplyForm: () => null };
      if (name.endsWith("ban-button")) return { BanButton: () => null };
      if (name.endsWith("dashboard-charts")) return { DashboardCharts: () => null };
      if (name.startsWith("@/") || name.startsWith(".")) {
        const candidate = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
        return load(candidate + (fs.existsSync(candidate + ".tsx") ? ".tsx" : ".ts"));
      }
      return original(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  }
  return load;
}

test("a conversation over 200 messages opens at the latest message and exposes all older pages", async () => {
  const messages = Array.from({ length: 251 }, (_, index) => ({ id: String(index).padStart(4, "0"), authorRole: "CUSTOMER", authorName: "Customer", body: "Message-" + index, createdAt: new Date(1700000000000 + index * 1000) }));
  const db = { supportTicket: { findFirst: async () => ({ id: "ticket", customerId: "customer", customer: { name: "Customer", email: "customer@example.invalid" }, booking: null, message: "Original request", createdAt: messages[0].createdAt, updatedAt: messages.at(-1).createdAt, status: "OPEN", priority: "HIGH", assignedAdminId: null }), findMany: async () => [] },
    user: { findMany: async () => [] }, supportInternalNote: { count: async () => 0, findMany: async () => [] },
    supportMessage: { count: async () => messages.length, findMany: async options => {
      assert.deepEqual(options.where, { ticketId: "ticket" }); assert.equal(options.orderBy[0].createdAt, "desc");
      return messages.toReversed().slice(options.skip, options.skip + options.take);
    } } };
  const Page = loader(db)("src/app/dashboard/support/[id]/page.tsx").default;
  const first = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "ticket" }), searchParams: Promise.resolve({}) }));
  assert(first.includes("Message-250")); assert(!first.includes(">Message-0<")); assert(first.includes("Earlier messages")); assert(first.includes("page=2"));
  const last = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "ticket" }), searchParams: Promise.resolve({ page: "6" }) }));
  assert(last.includes(">Message-0<")); assert(last.includes("Jump to latest messages")); assert(last.includes("Newer messages"));
});

test("directory page beyond the end is clamped and search filters remain in links", async () => {
  let seen;
  const db = { user: { count: async () => 26, findMany: async options => { seen = options; return []; } } };
  const Directory = loader(db)("src/components/account-directory.tsx").AccountDirectory;
  const html = renderToStaticMarkup(await Directory({ role: "CUSTOMER", query: { page: "999", q: "Alex & Jo", status: "restricted" } }));
  assert.equal(seen.skip, 25); assert.equal(seen.take, 25); assert.equal(seen.where.isBanned, true); assert.equal(seen.where.role, "CUSTOMER");
  assert(html.includes("Alex &amp; Jo")); assert(html.includes("q=Alex+%26+Jo")); assert(html.includes("status=restricted"));
});

test("case screens show the next valid action and hide self approval and terminal actions", async () => {
  const record = { id: "case", title: "Review", kind: "FINANCE", summary: "Facts", priority: "HIGH", status: "AWAITING_ADMIN", createdById: "admin", createdByName: "Test admin", assignedToId: "admin", notes: [], version: 2, bookingId: null };
  const db = { workflowCase: { findFirst: async () => record }, user: { findMany: async () => [], findUnique: async () => ({ name: "Reviewer" }) } };
  const Page = loader(db)("src/app/dashboard/cases/[id]/page.tsx").default;
  async function render() { return renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "case" }) })); }
  let html = await render();
  assert(html.includes("Waiting for a different administrator")); assert(!html.includes(">Record decision<")); assert(!html.includes(">Submit recommendation<"));
  record.createdById = "creator"; record.assignedToId = "reviewer";
  html = await render(); assert(html.includes(">Record decision<")); assert(!html.includes(">Record resolution and close case<"));
  record.status = "RESOLVED"; record.assignedToId = null;
  html = await render();
  for (const label of ["Claim case", "Assign reviewer", "Append evidence", "Submit recommendation", "Record decision", "Record resolution and close case"]) assert(!html.includes(">" + label + "<"), label);
});
