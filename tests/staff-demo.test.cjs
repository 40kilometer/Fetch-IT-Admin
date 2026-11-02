const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');

function fixture() {
  let now = Date.now();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const cookies = new Map(), options = new Map(), sessions = new Map(), audit = [], cache = new Map();
  const password = crypto.randomBytes(20).toString('hex'), salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
  const users = new Map([
    ['ADMIN', { email: 'admin@fixture.invalid', role: 'ADMIN' }], ['OTHER_ADMIN', { email: 'other@fixture.invalid', role: 'ADMIN' }],
    ['SUPPORT', { email: 'cs@staff.fetchit.invalid', role: 'SUPPORT' }], ['SUPPORT_SUPERVISOR', { email: 'cs-supervisor@staff.fetchit.invalid', role: 'SUPPORT_SUPERVISOR' }],
    ['FINANCE', { email: 'finance@staff.fetchit.invalid', role: 'FINANCE' }], ['SAFETY', { email: 'safety@staff.fetchit.invalid', role: 'SAFETY' }],
  ].map(([id, value]) => [id, { id, name: id, isBanned: false, authInvalidBefore: null, authIdentities: [{ provider: 'PASSWORD', passwordHash }], ...value }]));
  const state = { safe: true };
  const db = {
    user: { findUnique: async ({ where }) => where.id ? users.get(where.id) ?? null : [...users.values()].find(user => user.email === where.email) ?? null },
    staffSession: {
      findUnique: async ({ where }) => sessions.get(where.id) ?? null,
      create: async ({ data }) => { const row = { revokedAt: null, ...data }; sessions.set(row.id, row); return row; },
      updateMany: async ({ where, data }) => { let count = 0; for (const row of sessions.values()) if ((!where.id || row.id === where.id) && (!where.userId || row.userId === where.userId)) { Object.assign(row, data); count++; } return { count }; },
    },
    adminAudit: { create: async ({ data }) => { audit.push(data); return data; } },
    $queryRaw: async parts => parts.join('?').includes('rolsuper') ? [{ unsafe: !state.safe, keys: false, settings: false, roles: false, auditRewrite: false, ownsTables: false }] : parts.join('?').includes('RateLimitBucket') ? [{ hits: 1, retryAfter: 900 }] : [],
  };
  db.$transaction = async callback => { if (state.failTransaction) throw new Error('Database unavailable'); return callback(db); };
  const env = { NODE_ENV: 'production', ADMIN_SESSION_SECRET: crypto.randomBytes(32).toString('hex') };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {}; cache.set(filename, exports); const native = createRequire(filename);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports, Buffer, Date: Clock, process: { env }, setTimeout, clearTimeout, console: { info() {}, error() {} }, require: name => {
      if (name === '@/lib/db' || name === './db') return { db };
      if (name === './push-delivery') return { schedulePushDelivery() {} };
      if (name === 'next/headers') return { cookies: async () => ({ get: key => cookies.has(key) ? { value: cookies.get(key) } : undefined, set: (key, value, settings) => { cookies.set(key, value); options.set(key, settings); }, delete: key => cookies.delete(key) }) };
      if (name === 'next/navigation') return { redirect: target => { throw new Error('redirect:' + target); } };
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
      return native(name);
    } });
    return exports;
  }
  const session = load('src/lib/session.ts'), access = load('src/lib/staff-access.ts'), demo = load('src/lib/staff-demo.ts'), route = load('src/app/api/auth/demo/route.ts');
  function startAs(id = 'ADMIN') {
    const user = users.get(id), token = session.createAdminSessionToken({ uid: user.id, email: user.email, name: user.name });
    const payload = session.verifyAdminSessionToken(token);
    sessions.set(payload.sid, { id: payload.sid, userId: user.id, revokedAt: null, expiresAt: new Clock(payload.exp) });
    cookies.set('fetchit_admin_session', token);
    return payload;
  }
  function request(method = 'GET', body, origin = 'https://fixture.invalid') {
    return new NextRequest('https://fixture.invalid/api/auth/demo', { method, headers: { ...(origin ? { origin } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  function legacySwitch() {
    const parent=startAs();
    const grant={uid:parent.uid,sid:parent.sid,iat:parent.iat,exp:now+3600000};
    const value=Buffer.from(JSON.stringify(grant)).toString('base64url');
    cookies.set('fetchit_staff_demo',value+'.'+crypto.createHmac('sha256',env.ADMIN_SESSION_SECRET).update('staff-demo:'+value).digest('base64url'));
    const user=users.get('SAFETY');
    const token=session.createAdminSessionToken({uid:user.id,email:user.email,name:user.name,demo:{uid:parent.uid,sid:parent.sid}},grant.exp);
    const child=session.verifyAdminSessionToken(token);
    sessions.set(child.sid,{id:child.sid,userId:user.id,revokedAt:null,expiresAt:new Clock(child.exp)});
    cookies.set('fetchit_admin_session',token);
    return {parent,child};
  }
  return { legacySwitch, users, cookies, options, sessions, audit, state, session, access, demo, route, load, startAs, request, password, advance: ms => now += ms, now: () => now };
}


for(const actor of [null,'ADMIN','SUPPORT','SUPPORT_SUPERVISOR','SAFETY'])test(`${actor??'Anonymous'} cannot switch accounts through the retired endpoint`,async()=>{
  const f=fixture();if(actor)f.startAs(actor);
  const before=f.sessions.size;
  for(const method of ['GET','POST','DELETE']) {
    const response=await f.route[method](f.request(method,method==='POST'?{role:'ADMIN'}:undefined));
    assert.equal(response.status,410);assert.match((await response.json()).error,/sign in/i);
  }
  assert.equal(f.sessions.size,before);assert.equal(f.audit.length,0);assert.equal(f.cookies.has('fetchit_staff_demo'),false);
});
test('previously switched sessions are denied even with a valid controller grant',async()=>{
  const f=fixture();f.legacySwitch();
  assert.equal(await f.access.currentStaff(),null);
  assert.equal(await f.access.currentStaff('safety'),null);
});
test('password sign-in closes legacy switching authority and creates a normal role-scoped session',async()=>{
  const f=fixture(),{parent,child}=f.legacySwitch();
  const response=await f.load('src/app/api/auth/login/route.ts').POST(new NextRequest('https://fixture.invalid/api/auth/login',{method:'POST',headers:{origin:'https://fixture.invalid','Content-Type':'application/json'},body:JSON.stringify({email:f.users.get('SUPPORT').email,password:f.password})}));
  assert.equal(response.status,200);assert(f.sessions.get(parent.sid).revokedAt);assert(f.sessions.get(child.sid).revokedAt);
  assert.equal(f.cookies.has('fetchit_staff_demo'),false);
  assert.equal((await f.access.currentStaff('support')).id,'SUPPORT');
  assert.equal(await f.access.currentStaff('operations'),null);assert.equal((await f.session.getAdminSession()).demo,undefined);
});
test('ordinary sign-in sessions retain permission, restriction and revocation checks',async()=>{
  for(const role of ['ADMIN','SUPPORT','SUPPORT_SUPERVISOR','SAFETY']) {
    const f=fixture(),session=f.startAs(role);assert.equal((await f.access.currentStaff()).id,role);
    f.sessions.get(session.sid).revokedAt=new Date();assert.equal(await f.access.currentStaff(),null);
    f.sessions.get(session.sid).revokedAt=null;f.users.get(role).isBanned=true;assert.equal(await f.access.currentStaff(),null);
  }
  const f=fixture();f.startAs('FINANCE');assert.equal(await f.access.currentStaff(),null);
});
test('logout cleans up both legacy sessions and clears cookies even on database failure',async()=>{
  for(const fail of [false,true]) {
    const f=fixture(),{parent,child}=f.legacySwitch();f.state.failTransaction=fail;
    const response=await f.load('src/app/api/auth/logout/route.ts').POST(f.request('POST'));
    assert.equal(response.status,fail?503:200);assert.equal(f.cookies.size,0);
    if(!fail){assert(f.sessions.get(parent.sid).revokedAt);assert(f.sessions.get(child.sid).revokedAt);}
  }
});
test('old staff picker URLs redirect to password sign-in',()=>{
  const f=fixture();
  for(const file of ['src/app/staff/page.tsx','src/app/demo/page.tsx']) {
    // These pages contain no JSX; the fixture loader supports .tsx paths too.
    const page=f.load(file);assert.throws(()=>Object.values(page)[0](),/redirect:\/login/);
  }
});
