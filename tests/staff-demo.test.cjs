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
  return { users, cookies, options, sessions, audit, state, session, access, demo, route, load, startAs, request, password, advance: ms => now += ms, now: () => now };
}

test('anonymous demo page stays locked and cannot mint a staff session', async () => {
  const f = fixture(), status = await f.route.GET(f.request());
  assert.deepEqual(await status.json(), { unlocked: false, canStart: false, currentRole: null, expiresAt: null, controllerName: null, currentEmail: null, canUseAdmin: false });
  assert.equal((await f.route.POST(f.request('POST', { role: 'ADMIN' }))).status, 401);
  assert.equal(f.sessions.size, 0); assert.equal(f.cookies.size, 0);
});

test('ordinary staff cannot unlock demo access or elevate to Admin', async () => {
  for (const role of ['SUPPORT', 'SUPPORT_SUPERVISOR', 'SAFETY']) {
    const f = fixture(); f.users.get(role).email = "ordinary@fixture.invalid"; f.startAs(role);
    assert.equal((await f.demo.demoStatus()).canStart, false);
    assert.equal((await f.route.POST(f.request('POST', { role: 'ADMIN' }))).status, 401);
    assert.equal(f.sessions.size, 1); assert.equal(f.cookies.has('fetchit_staff_demo'), false);
  }
});

test('designated real demo staff can unlock staff switching with their own account and can never switch into Admin', async () => {
  for (const startingRole of ['SUPPORT', 'SUPPORT_SUPERVISOR', 'SAFETY']) {
    const f = fixture(); f.startAs(startingRole);
    const status = await f.demo.demoStatus(); assert.equal(status.canStart, true); assert.equal(status.canUseAdmin, false);
    for (const role of ['SUPPORT', 'SUPPORT_SUPERVISOR', 'SAFETY']) {
      assert.equal((await f.route.POST(f.request('POST', { role }))).status, 200);
      const user = await f.access.currentStaff(); assert.equal(user.id, role); assert.equal(user.email, f.users.get(role).email); assert.equal(user.name, role);
    }
    assert.equal((await f.route.POST(f.request('POST', { role: 'ADMIN' }))).status, 403);
    assert.equal((await f.route.DELETE(f.request('DELETE'))).status, 200);
    assert.equal((await f.access.currentStaff()).id, startingRole);
    assert.equal(f.cookies.has('fetchit_staff_demo'), false);
  }
});

test('demo access cannot bypass the production database permission check', async () => {
  const f = fixture(); f.startAs(); f.state.safe = false;
  assert.equal((await f.route.POST(f.request('POST', { role: 'SUPPORT' }))).status, 503);
  assert.equal(f.sessions.size, 1); assert.equal(f.cookies.has('fetchit_staff_demo'), false);
});

test('Admin unlocks every allowed role with sessions capped to the demo window', async () => {
  const f = fixture(), parent = f.startAs();
  assert.equal((await f.demo.demoStatus()).canStart, true);
  for (const role of ['SUPPORT', 'SUPPORT_SUPERVISOR', 'SAFETY', 'ADMIN']) {
    const response = await f.route.POST(f.request('POST', { role, userId: 'OTHER_ADMIN' }));
    assert.equal(response.status, 200, role);
    const user = await f.access.currentStaff();
    assert.equal(user.id, role); assert.equal(user.role, role);
    assert.equal(user.name, role);
    assert.equal(user.demo.controllerName, 'ADMIN');
    const child = await f.session.getAdminSession();
    assert(child.exp <= f.now() + 60 * 60_000); assert.equal(child.demo.sid, parent.sid);
    assert.equal(f.sessions.get(parent.sid).revokedAt, null);
    assert.equal(f.options.get('fetchit_staff_demo').httpOnly, true); assert.equal(f.options.get('fetchit_staff_demo').secure, true);
    assert.equal(f.options.get('fetchit_admin_session').httpOnly, true); assert.equal(f.options.get('fetchit_admin_session').secure, true);
    assert(f.options.get('fetchit_admin_session').maxAge <= 3600);
  }
  assert.equal([...f.sessions.values()].filter(row => !row.revokedAt).length, 2, 'Only the controller and latest demo session remain active');
  assert.equal(f.audit.filter(event => event.action === 'DEMO_ROLE_SWITCHED').length, 4);
  assert(f.audit.every(event => event.actorId === 'ADMIN'));
});

test('staff permissions still apply inside an Admin-authorized demonstration', async () => {
  const f = fixture(); f.startAs(); await f.demo.switchDemoRole('SUPPORT');
  assert.equal(await f.access.currentStaff('operations'), null);
  assert.equal(await f.access.currentStaff('finance'), null);
  assert.equal(await f.access.currentStaff('safety'), null);
  assert.equal((await f.access.currentStaff('support')).id, 'SUPPORT');
});

test('demo child cookies do not work without their controller grant', async () => {
  const f = fixture(); f.startAs(); await f.demo.switchDemoRole('SAFETY');
  f.cookies.delete('fetchit_staff_demo');
  assert.equal(await f.access.currentStaff(), null);
  assert.equal((await f.route.POST(f.request('POST', { role: 'ADMIN' }))).status, 401);
});

test('controller revocation, account restriction, password reset and role change end delegated access', async () => {
  for (const change of ['revoke', 'ban', 'reset', 'role']) {
    const f = fixture(), parent = f.startAs(); await f.demo.switchDemoRole('SAFETY');
    if (change === 'revoke') f.sessions.get(parent.sid).revokedAt = new Date(f.now());
    if (change === 'ban') f.users.get('ADMIN').isBanned = true;
    if (change === 'reset') f.users.get('ADMIN').authInvalidBefore = new Date(f.now());
    if (change === 'role') f.users.get('ADMIN').role = 'SUPPORT';
    assert.equal(await f.access.currentStaff(), null, change);
    assert.equal((await f.route.POST(f.request('POST', { role: 'ADMIN' }))).status, 401, change);
  }
});

test('tampered, expired, and mismatched controller grants fail closed', async () => {
  for (const change of ['tamper', 'expire', 'mismatch']) {
    const f = fixture(); f.startAs(); await f.demo.switchDemoRole('SUPPORT');
    if (change === 'tamper') f.cookies.set('fetchit_staff_demo', f.cookies.get('fetchit_staff_demo') + 'x');
    if (change === 'expire') f.advance(60 * 60_000 + 1);
    if (change === 'mismatch') {
      const child = await f.session.getAdminSession();
      const token = f.session.createAdminSessionToken({ uid: child.uid, email: child.email, name: child.name, demo: { uid: 'OTHER_ADMIN', sid: 'other-parent' } }, child.exp);
      const payload = f.session.verifyAdminSessionToken(token);
      f.sessions.set(payload.sid, { id: payload.sid, userId: child.uid, revokedAt: null, expiresAt: new Date(child.exp) });
      f.cookies.set('fetchit_admin_session', token);
    }
    assert.equal(await f.access.currentStaff(), null, change);
  }
});

test('missing, restricted, and reassigned demonstration accounts are not silently recreated', async () => {
  for (const change of ['delete', 'ban', 'role']) {
    const f = fixture(); f.startAs();
    if (change === 'delete') f.users.delete('SAFETY');
    if (change === 'ban') f.users.get('SAFETY').isBanned = true;
    if (change === 'role') f.users.get('SAFETY').role = 'ADMIN';
    assert.equal((await f.route.POST(f.request('POST', { role: 'SAFETY' }))).status, 409);
    assert.equal(f.sessions.size, 1); assert.equal(f.cookies.has('fetchit_staff_demo'), false);
  }
});

test('unsupported roles, cross-origin requests, and missing origins cannot switch sessions', async () => {
  const f = fixture(); f.startAs();
  assert.equal((await f.route.POST(f.request('POST', { role: 'SUPERADMIN' }))).status, 400);
  for (const origin of ['https://other.invalid', '']) {
    assert.equal((await f.route.POST(f.request('POST', { role: 'SUPPORT' }, origin))).status, 403);
    assert.equal((await f.route.DELETE(f.request('DELETE', undefined, origin))).status, 403);
  }
  assert.equal(f.sessions.size, 1);
});

test('finishing restores normal Admin access without extending its original expiry', async () => {
  const f = fixture(), parent = f.startAs(); await f.demo.switchDemoRole('SAFETY');
  const child = await f.session.getAdminSession(); f.advance(10 * 60_000);
  assert.equal((await f.route.DELETE(f.request('DELETE'))).status, 200);
  const restored = await f.session.getAdminSession();
  assert.equal(restored.uid, 'ADMIN'); assert.equal(restored.demo, undefined); assert(restored.exp <= parent.exp);
  assert(f.sessions.get(parent.sid).revokedAt); assert(f.sessions.get(child.sid).revokedAt);
  assert.equal(f.cookies.has('fetchit_staff_demo'), false);
  assert.equal((await f.access.currentStaff('operations')).demo, null);
});

test('normal password sign-in closes the previous demo authority', async () => {
  const f = fixture(), parent = f.startAs(); await f.demo.switchDemoRole('SAFETY');
  const child = await f.session.getAdminSession();
  const login = f.load('src/app/api/auth/login/route.ts').POST;
  const response = await login(new NextRequest('https://fixture.invalid/api/auth/login', { method: 'POST', headers: { origin: 'https://fixture.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.users.get('SUPPORT').email, password: f.password }) }));
  assert.equal(response.status, 200);
  assert(f.sessions.get(parent.sid).revokedAt); assert(f.sessions.get(child.sid).revokedAt);
  assert.equal(f.cookies.has('fetchit_staff_demo'), false);
  assert.equal((await f.access.currentStaff()).id, 'SUPPORT');
  assert.equal((await f.demo.demoStatus()).canStart, true);
});

test('logging out closes the demo grant and revokes both sessions', async () => {
  const f = fixture(), parent = f.startAs(); await f.demo.switchDemoRole('SUPPORT');
  const oldCookies = new Map(f.cookies), child = await f.session.getAdminSession();
  const logout = f.load('src/app/api/auth/logout/route.ts').POST;
  assert.equal((await logout(f.request('POST'))).status, 200);
  assert.equal(f.cookies.size, 0); assert(f.sessions.get(parent.sid).revokedAt); assert(f.sessions.get(child.sid).revokedAt);
  for (const [key, value] of oldCookies) f.cookies.set(key, value);
  assert.equal(await f.access.currentStaff(), null); assert.equal(await f.demo.getDemoController(), null);
});

test('a cleanup failure still clears both browser authentication cookies', async () => {
  const f = fixture(); f.startAs(); await f.demo.switchDemoRole('SUPPORT'); f.state.failTransaction = true;
  const logout = f.load('src/app/api/auth/logout/route.ts').POST;
  assert.equal((await logout(f.request('POST'))).status, 503);
  assert.equal(f.cookies.size, 0);
});

test('retired Finance demo identity cannot authenticate, present, or be switched into',async()=>{
  const f=fixture();f.startAs('FINANCE');assert.equal(await f.access.currentStaff(),null);assert.equal((await f.demo.demoStatus()).canStart,false);
  f.startAs();assert.equal((await f.route.POST(f.request('POST',{role:'FINANCE'}))).status,400);
});
