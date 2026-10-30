const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {}; cache.set(filename, exports);
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if(name.endsWith("staff-drafts"))return {useStaffDraft:()=>({candidate:null,status:"",capture(){},clear(){},restore(){}}),DraftNotice:()=>null};
      if (name.endsWith('.css')) return {};
      if (name.startsWith('@/')) { const base = 'src/' + name.slice(2); return load(base + (fs.existsSync(path.join(root, base + '.ts')) ? '.ts' : '.tsx')); }
      if (name.startsWith('.')) { const base = path.resolve(path.dirname(filename), name); return load(base + (fs.existsSync(base + '.ts') ? '.ts' : '.tsx')); }
      return require(name);
    };
    new Function('exports', 'require', ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText)(exports, localRequire);
    return exports;
  }
  return load;
}

function fixture(overrides = {}) {
  const app = { id: 'application', userId: 'rider', version: 3, status: 'SUBMITTED', vehicleClass: 'MOTORCYCLE', services: ['DELIVERY'], fields: {}, fieldReviews: {},
    assignedToId: 'reviewer', documents: [{ id: 'document', kind: 'LICENSE', current: true, status: 'PENDING', pathname: 'private/file' }], events: [], emails: [], user: { id: 'rider', name: 'Rider', email: 'rider@example.invalid', isBanned: false }, ...overrides };
  let snapshots = 0, writes = 0, mails = 0;
  const copy = () => structuredClone(app);
  const db = {
    $queryRaw: async () => [],
    riderApplication: {
      findUnique: async () => { snapshots++; return copy(); },
      findUniqueOrThrow: async () => { snapshots++; return copy(); },
      update: async ({ data, include }) => { assert.equal(include, undefined); writes++; for (const [key, value] of Object.entries(data)) app[key] = key === 'version' ? app.version + value.increment : value; return copy(); },
    },
    riderApplicationDocument: { update: async ({ where, data }) => { writes++; const doc=app.documents.find(d => d.id === where.id);Object.assign(doc, data);return structuredClone(doc); } },
    riderApplicationEvent: { create: async ({ data }) => { writes++; const event = { id: 'saved-event', ...data }; app.events.unshift(event); return event; } },
    adminAudit: { create: async () => { writes++; } },
    riderServiceApproval: { findMany: async () => [] },
  };
  db.$transaction = callback => callback(db);
  const load = loader({ './db': { db }, './request-guard': { RateLimitError: class extends Error {} },
    './application-storage': {}, './application-mail': { sendApplicationEmail: async () => { mails++; }, orientationLetter() {}, applicationMessage() {} } });
  const actor = { id: 'reviewer', role: 'SAFETY', name: 'Reviewer' };
  const api = load('src/lib/application-staff-api.ts').staffApplicationRequest;
  const call = (body = {}, person = actor) => api(new NextRequest('https://admin.example.invalid/api/rider-applications/application', {
    method: 'POST', headers: { origin: 'https://admin.example.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review', section: 'identity', status: 'ACCEPTED', version: 3, ...body }),
  }), person, app.id);
  return { app, call, counts: () => ({ snapshots, writes, mails }) };
}

test('save returns the committed decision, incremented version and its audit event using one detail snapshot', async () => {
  const f = fixture();
  const section = Object.keys(loader()('src/lib/rider-application-policy.ts').SECTION_FIELDS)[0];
  const response = await f.call({ section });
  assert.equal(response.status, 200);
  const { application } = await response.json();
  assert.equal(application.version, 4); assert.equal(application.fieldReviews[section].status, 'ACCEPTED');
  assert.equal(application.events[0].action, 'REVIEW'); assert.equal(application.documents[0].pathname, undefined);
  assert.deepEqual(f.counts(), { snapshots: 1, writes: 3, mails: 0 });
});

test('document decisions return their new status immediately without sending an email', async () => {
  const f = fixture(), response = await f.call({ documentId: 'document', status: 'NEEDS_CORRECTION', reason: 'Please replace the blurred photo.' });
  assert.equal(response.status, 200);
  const { application } = await response.json();
  assert.equal(application.documents[0].status, 'NEEDS_CORRECTION');
  assert.equal(application.events[0].details.documentId, 'document');
  assert.deepEqual(f.counts(), { snapshots: 1, writes: 4, mails: 0 });
});

test('stale versions, another reviewer, banned applicants and expired documents still block writes', async () => {
  for (const [overrides, body, actor, status] of [
    [{}, { version: 2 }, undefined, 409],
    [{ assignedToId: 'someone-else' }, {}, undefined, 403],
    [{ user: { isBanned: true } }, {}, undefined, 403],
    [{ documents: [{ id: 'document', current: true, kind: 'LICENSE', expiresAt: new Date(0) }] }, { documentId: 'document' }, undefined, 400],
    [{}, {}, { id: 'support', name: 'Support', role: 'SUPPORT' }, 403],
  ]) {
    const f = fixture(overrides), response = await f.call(body, actor);
    assert.equal(response.status, status); assert.equal(f.counts().writes, 0);
  }
});

function hooks() {
  const values = []; let cursor = 0;
  const effects = [];
  const react = { ...require('react'),
    useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial; return [values[slot], value => { values[slot] = typeof value === 'function' ? value(values[slot]) : value; }]; },
    useRef(initial) { const slot = cursor++; return values[slot] ??= { current: initial }; },
    useCallback(fn) { return fn; }, useEffect(fn) { effects.push(fn); },
  };
  return { react, effects, render(component, props) { cursor = 0; return component(props); } };
}
function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children), ...elements(tree.props?.items?.map(item => item.content)), ...(tree.type?.name === "ApplicationChecklist" ? elements(tree.type(tree.props)) : [])];
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('rapid application actions send one request, retain the committed snapshot and unlock after failure',async()=>{
 const original=global.fetch,h=hooks(),pending=deferred(),initial=fixture().app;let posts=0;
 global.fetch=async(url,options)=>{if(options?.method==='POST'){posts++;return pending.promise}return Response.json({application:initial,actor:{id:'reviewer',canActivate:true}})};
 try{
  const Parent=loader({react:h.react,'next/link':{},'@/hooks/use-local-demo':{useLocalDemo:()=>({enabled:false})},'@/hooks/use-visible-poll':{useVisiblePoll(){}}})('src/components/rider-applications.tsx').RiderApplications;
  h.render(Parent,{id:initial.id});h.effects[0]();await new Promise(setImmediate);
  const getAction=()=>elements(h.render(Parent,{id:initial.id})).find(e=>e.type?.name==='ApplicationChecklist').props.onAction;
  const action=getAction(),first=action({action:'review',section:'personal',status:'ACCEPTED'});
  assert.equal(await action({action:'review',section:'personal',status:'ACCEPTED'}),false);assert.equal(posts,1);
  pending.resolve(Response.json({error:'Session expired. Sign in again.'},{status:401}));assert.equal(await first,false);
  let savedBody;global.fetch=async(url,options)=>{posts++;savedBody=JSON.parse(options.body);return Response.json({application:{...initial,version:initial.version+1}})};
  assert.equal(await getAction()({action:'review',section:'personal',status:'ACCEPTED'}),true);assert.equal(posts,2);assert.equal(savedBody.version,initial.version);
 }finally{global.fetch=original}
});

test('the client finishes after POST, avoids a trailing GET, and ignores a stale poll arriving after the save', async () => {
  const h = hooks(), initial = fixture().app, post = deferred(), stale = deferred();
  let poll, gets = 0, posts = 0;
  const nativeFetch = global.fetch;
  global.fetch = async (_url, options = {}) => {
    if (options.method === 'POST') { posts++; return post.promise; }
    gets++; return gets === 1 ? Response.json({ application: initial, actor: { id: 'reviewer', canActivate: false } }) : stale.promise;
  };
  try {
    const load = loader({ react: h.react, 'next/link': { __esModule: true, default: 'a' }, '@/hooks/use-local-demo': { useLocalDemo: () => ({ enabled: false }) },
      '@/hooks/use-visible-poll': { useVisiblePoll: (_key, callback, interval, immediate) => { poll = callback; assert.equal(interval, 10000); assert.equal(immediate, false); } } });
    const { RiderApplications } = load('src/components/rider-applications.tsx');
    h.render(RiderApplications, { id: initial.id });
    h.effects[0](); await new Promise(setImmediate);
    const tree = h.render(RiderApplications, { id: initial.id });
    const pendingPoll = poll(new AbortController().signal);
    const control = elements(tree).find(element => element.type?.name === 'ReviewControls');
    const saving = control.props.onReview('ACCEPTED', '');
    assert(elements(h.render(RiderApplications, { id: initial.id })).filter(e => e.type?.name === 'ReviewControls').every(e => e.props.disabled));
    post.resolve(Response.json({ application: { ...initial, version: 4, status: 'IN_REVIEW' } }));
    assert.equal(await saving, true); assert.equal(posts, 1); assert.equal(gets, 2);
    stale.resolve(Response.json({ application: initial })); await pendingPoll;
    const nextControl = elements(h.render(RiderApplications, { id: initial.id })).find(e => e.type?.name === 'ReviewControls');
    global.fetch = async (_url, options) => { assert.equal(JSON.parse(options.body).version, 4); return Response.json({ error: 'Conflict' }, { status: 409 }); };
    assert.equal(await nextControl.props.onReview('ACCEPTED', ''), false);
  } finally { global.fetch = nativeFetch; }
});

test('the review button shows Saving and confirms only a successful response', async () => {
  const h = hooks();
  const load = loader({ react: h.react, 'next/link': {}, '@/hooks/use-local-demo': { useLocalDemo: () => ({ enabled: false }) }, '@/hooks/use-visible-poll': { useVisiblePoll() {} } });
  const { RiderApplications } = load('src/components/rider-applications.tsx');
  // Obtain the private form through the rendered application using the same hook harness.
  const nativeFetch = global.fetch;
  global.fetch = async () => Response.json({ application: fixture().app });
  try {
    h.render(RiderApplications, { id: 'application' }); h.effects[0](); await new Promise(setImmediate);
    const Form = elements(h.render(RiderApplications, { id: 'application' })).find(e => e.type?.name === 'ReviewControls').type;
    for (const outcome of [true, false]) {
      const formHooks = hooks(), pending = deferred();
      // The component closes over its module's React binding, so use a fresh loader.
      const formLoad = loader({ react: formHooks.react, 'next/link': {}, '@/hooks/use-local-demo': { useLocalDemo: () => ({ enabled: false }) }, '@/hooks/use-visible-poll': { useVisiblePoll() {} } });
      const Parent = formLoad('src/components/rider-applications.tsx').RiderApplications;
      formHooks.render(Parent, { id: 'application' }); formHooks.effects[0](); await new Promise(setImmediate);
      const Control = elements(formHooks.render(Parent, { id: 'application' })).find(e => e.type?.name === Form.name).type;
      const local = hooks(); Object.assign(formHooks.react, local.react);
      const props = { disabled: false, onReview: () => pending.promise };
      const form = local.render(Control, props); form.props.onSubmit({ preventDefault() {} });
      const busy = local.render(Control, props); assert.equal(busy.props['aria-busy'], true);
      assert(elements(busy).some(e => e.type === 'button' && e.props.children === 'Saving…' && e.props.disabled));
      pending.resolve(outcome); await new Promise(setImmediate);
      const done = local.render(Control, props); assert.equal(done.props['aria-busy'], false);
      assert.equal(elements(done).some(e => e.props?.role === 'status' && e.props.className === 'success-message' && e.props.children === 'Item review saved. Checklist progress updated.'), outcome);
    }
  } finally { global.fetch = nativeFetch; }
});
