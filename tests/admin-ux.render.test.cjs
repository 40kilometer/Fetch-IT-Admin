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
      if (name === "@/lib/staff-notifications") return { refreshOperationalSignals:async()=>{} };
      if (name === "next/link") return { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
      if (name === "next/navigation") return { notFound() { throw Error("not found"); }, useRouter:()=>({refresh(){},push(){}}) };
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

test("completed cash without confirmation is distinguished from Paid without changing saved payment state",async()=>{
  const base={id:'booking',refCode:'FIT-TEST',status:'DELIVERED',totalFare:294,paymentMethod:'CASH',paymentStatus:'UNPAID',customerPaidAmount:null,riderReceivedAmount:null,demoCommission:null,demoRiderEarnings:null,demoPayoutAt:null};
  const rows=[base,{...base,id:'paid',refCode:'FIT-PAID',paymentStatus:'PAID',customerPaidAmount:294,riderReceivedAmount:294},{...base,id:'cancelled',refCode:'FIT-CANCELLED',status:'CANCELLED'}];
  const load=loader({booking:{count:async()=>rows.length,findMany:async()=>rows}});
  const Page=load('src/app/dashboard/finance/page.tsx').default;
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
  assert.match(html,/>Cash not confirmed</);assert.match(html,/Service completed\. Cash collection has not been confirmed/);
  assert.match(html,/>Paid</);assert.match(html,/>No payment recorded</);assert.match(html,/Customer confirmed: Not recorded/);assert.match(html,/Rider confirmed: Not recorded/);
  assert.doesNotMatch(html,/>Unpaid</);assert.equal(base.paymentStatus,'UNPAID');assert.equal(base.customerPaidAmount,null);
  const {paymentPresentation}=load('src/lib/payment-presentation.ts');
  assert.equal(paymentPresentation({...base,status:'IN_TRANSIT'}).label,'Unpaid');
  assert.equal(paymentPresentation({...base,paymentStatus:'PENDING',riderReceivedAmount:294}).label,'Awaiting confirmation / review');
  assert.equal(paymentPresentation({...base,paymentStatus:'REFUNDED'}).label,'Refunded');
  assert.equal(paymentPresentation({...base,paymentStatus:'FAILED'}).label,'Failed');
  assert.equal(paymentPresentation({...base,paymentMethod:'DEMO_GCASH'}).label,'Unpaid');
  assert.equal(paymentPresentation({...base,status:'CANCELLED',riderReceivedAmount:294}).label,'Unpaid');
  const Status=load('src/components/payment-record-status.tsx').PaymentRecordStatus;
  assert.match(renderToStaticMarkup(React.createElement(Status,{record:base})),/Cash not confirmed/);
});

test('shared advisories show published operating guidance separately from monitored incidents',async()=>{
  const db={platformIncident:{findMany:async()=>[]},staffResource:{findMany:async input=>{assert.equal(input.where.kind,'ANNOUNCEMENT');return [{id:'advisory',title:'Shift coverage',body:'Claim work and record the next step.',updatedAt:new Date()}];}}};
  const Page=loader(db)('src/app/dashboard/incidents/page.tsx').default;
  const html=renderToStaticMarkup(await Page());assert.match(html,/Team advisories/);assert.match(html,/Shift coverage/);assert.match(html,/Claim work and record the next step/);
});

test("support conversation omits only the synthetic original already present on its current page", async () => {
  const createdAt=new Date('2026-10-28T08:52:20.000Z');
  const ticket={id:'ticket',customerId:'customer',customer:{name:'Customer',email:'customer@example.invalid'},booking:null,message:'Initial request text',createdAt,updatedAt:createdAt,status:'OPEN',priority:'NORMAL',assignedAdminId:null};
  let messages=[{id:'initial',authorId:'customer',authorRole:'CUSTOMER',authorName:'Customer',body:ticket.message,createdAt}];
  const db={supportTicket:{findFirst:async()=>ticket,findMany:async()=>[]},user:{findMany:async()=>[]},supportInternalNote:{count:async()=>0,findMany:async()=>[]},supportMessage:{count:async()=>messages.length,findMany:async()=>messages}};
  const Page=loader(db)('src/app/dashboard/support/[id]/page.tsx').default;
  const render=async()=>renderToStaticMarkup(await Page({params:Promise.resolve({id:'ticket'}),searchParams:Promise.resolve({})}));
  let html=await render();
  assert.doesNotMatch(html,/class="original-request"/);
  assert.equal(html.split('Initial request text').length-1,1);
  messages=[{...messages[0],id:'later',createdAt:new Date(createdAt.getTime()+1000)}];
  html=await render();
  assert.match(html,/class="original-request"/);
  assert.equal(html.split('Initial request text').length-1,2);
  messages=[];
  html=await render();
  assert.match(html,/class="original-request" open=""/);
  assert.equal(html.split('Initial request text').length-1,1);
});

test("original request matching requires the same customer, event time and exact body",()=>{
  const {originalRequestInThread}=loader({})('src/lib/support-conversation.ts');
  const request={message:'Same words',customerId:'customer',createdAt:new Date('2026-10-28T08:52:20Z')};
  const message={body:request.message,authorId:request.customerId,authorRole:'CUSTOMER',createdAt:request.createdAt};
  assert.equal(originalRequestInThread(request,[message]),true);
  for(const change of [{authorId:'another'},{authorId:null},{authorRole:'SUPPORT'},{body:'Different words'},{createdAt:new Date(request.createdAt.getTime()+1)}])assert.equal(originalRequestInThread(request,[{...message,...change}]),false);
  assert.equal(originalRequestInThread(request,[]),false);
  assert.equal(originalRequestInThread({...request,createdAt:new Date('invalid')},[message]),false);
});

test("case screens show the next valid action and hide self approval and terminal actions", async () => {
  const record = { id: "case", title: "Review", kind: "FINANCE", summary: "Facts", priority: "HIGH", status: "AWAITING_ADMIN", createdById: "admin", createdByName: "Test admin", assignedToId: "admin", notes: [], version: 2, bookingId: null };
  const db = { workflowNote:{count:async()=>0,findMany:async()=>[]},workflowCase: { findFirst: async () => record }, user: { findMany: async () => [], findUnique: async () => ({ name: "Reviewer" }) } };
  const Page = loader(db)("src/app/dashboard/cases/[id]/page.tsx").default;
  async function render() { return renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "case" }),searchParams:Promise.resolve({}) })); }
  let html = await render();
  assert(html.includes("A different Admin must decide")); assert(!html.includes(">Approve recommendation<")); assert(!html.includes(">Request Admin decision<"));
  record.createdById = "creator"; record.assignedToId = "reviewer";
  html = await render(); assert(html.includes(">Approve recommendation<")); assert(!html.includes(">Record resolution<"));
  record.status = "RESOLVED"; record.assignedToId = null;
  html = await render();
  for (const label of ["Start review", "Assign reviewer", "Save internal note", "Request Admin decision", "Approve recommendation", "Record resolution"]) assert(!html.includes(">" + label + "<"), label);
});
