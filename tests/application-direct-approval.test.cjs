const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename);
    const exports = {}; cache.set(filename, exports);
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.endsWith('.css')) return {};
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name + '.ts'));
      return require(name);
    };
    new Function('exports', 'require', ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText)(exports, localRequire); return exports;
  }
  return load;
}
function fixture(role = 'SAFETY', overrides = {}) {
  const policy = loader()('src/lib/rider-application-policy.ts');
  const actor = { id: 'reviewer', role, name: 'Same Reviewer' };
  const fields = { legalName: 'Test Rider', birthDate: '1990-01-01', address: 'Test address', mobile: '09123456789', emergencyName: 'Contact', emergencyRelationship: 'Sibling', emergencyPhone: '09987654321', licenceNumber: 'TEST123', licenceCodes: 'A', licenceExpiry: '2099-01-01', nbiExpiry: '2099-01-01', vehicleMake: 'Test', vehicleModel: 'Test', vehicleYear: '2025', plateNumber: 'TEST123', registrationExpiry: '2099-01-01', capacity: '10', displacement: '125', ownership: 'OWNER', operatingArea: 'Lingayen' };
  const app = { id: 'application', userId: 'rider', version: 1, isDemo: false, status: 'IN_REVIEW', vehicleClass: 'MOTORCYCLE', services: ['DELIVERY'], fields,
    assignedToId: actor.id, recommendedById: actor.id, fieldReviews: Object.fromEntries(Object.keys(policy.SECTION_FIELDS).map(key => [key, { status: 'ACCEPTED', reviewerId: actor.id }])),
    emailVerifiedAt: new Date(), verifiedEmail: 'rider@example.invalid', user: { id: 'rider', name: 'Test Rider', email: 'rider@example.invalid', isBanned: false },
    documents: policy.requiredDocuments('MOTORCYCLE', ['DELIVERY'], fields).map(kind => ({ id: kind, kind, current: true, status: 'ACCEPTED' })), events: [], emails: [], ...overrides };
  const audits = [], approvals = []; let profileWrites = 0;
  const copy = () => structuredClone(app);
  const db = { $queryRaw: async () => [],
    riderApplication: { findUnique: async () => copy(), findUniqueOrThrow: async () => copy(), update: async ({ data }) => { for (const [key, value] of Object.entries(data)) app[key] = key === 'version' ? app.version + value.increment : value; return copy(); } },
    riderApplicationEvent: { create: async ({ data }) => { app.events.unshift({ id: 'event-' + app.events.length, createdAt: new Date(), ...data }); } },
    adminAudit: { create: async ({ data }) => { audits.push(data); } },
    riderApplicationEmail: { create: async ({ data }) => { app.emails.unshift({ id: 'email-' + app.emails.length, status: 'PENDING', ...data }); } },
    riderServiceApproval: { findFirst: async () => null, findMany: async () => approvals, upsert: async ({ create }) => { approvals.push(create); } },
    riderProfile: { update: async () => { profileWrites++; } },
  }; db.$transaction = callback => callback(db);
  const load = loader({ './db': { db }, './request-guard': { RateLimitError: class extends Error {} }, './application-storage': {}, './application-mail': { sendApplicationEmail: async () => {}, orientationLetter: async () => Buffer.from('PDF'), applicationMessage: () => ({ text: 'Preview' }) } });
  const review = (action, body = {}, person = actor) => load('src/lib/rider-application.ts').reviewApplication(app.id, person, { action, version: app.version, ...body });
  const request = (method = 'GET', body, person = actor) => load('src/lib/application-staff-api.ts').staffApplicationRequest(new NextRequest('https://admin.example.invalid/api/rider-applications/application', { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }), person, app.id);
  return { app, actor, audits, approvals, review, request, load, profileWrites: () => profileWrites };
}
const schedule = () => ({ orientationAt: new Date(Date.now() + 86400000).toISOString(), venue: 'Test orientation venue', instructions: 'Bring the original documents.' });

for (const role of ['ADMIN', 'SAFETY']) {
  test(`${role} can approve directly, assess and activate their own review with an audit for every decision`, async () => {
    const f = fixture(role);
    const approved = await f.review('schedule', schedule());
    assert.equal(approved.status, 'ORIENTATION_SCHEDULED');
    assert.equal(f.audits[0].details.directApproval, true); assert.equal(f.audits[0].details.approverRole, role);
    await assert.rejects(f.review('assessment', { attended: true, passed: true, notes: 'Assessment passed.' }), /after the scheduled orientation/);
    f.app.orientationAt = new Date(Date.now() - 60000); // Simulate the scheduled time passing.
    await f.review('assessment', { attended: true, passed: true, notes: 'Assessment passed.' });
    const activated = await f.review('activate', { services: ['DELIVERY'] });
    assert.equal(activated.status, 'ACTIVE'); assert.equal(f.approvals.length, 1);
    assert(f.approvals.every(a => a.approvedById === f.actor.id));
    assert.deepEqual(f.audits.map(a => a.action), ['APPLICATION_SCHEDULE', 'APPLICATION_ASSESSMENT', 'APPLICATION_ACTIVATE']);
    assert(f.audits.every(a => a.actorId === f.actor.id && a.actorName === f.actor.name && a.entityType === 'RIDER_APPLICATION'));
    assert.deepEqual(activated.events.map(e => e.action), ['ACTIVATE', 'ASSESSMENT', 'SCHEDULE']);
  });
  test(`${role} can approve a legacy recommendation made by the same account`, async () => {
    const f = fixture(role, { status: 'RECOMMENDED' });
    assert.equal((await f.review('schedule', schedule())).status, 'ORIENTATION_SCHEDULED');
  });
}

test('Safety approval retains assignment boundaries and cannot reopen applications', async () => {
  const unclaimed = fixture('SAFETY', { assignedToId: null });
  await assert.rejects(unclaimed.review('schedule', schedule()), /Claim this application/);
  const other = fixture('SAFETY', { assignedToId: 'other-reviewer' });
  await assert.rejects(other.review('schedule', schedule()), /Claim this application/);
  assert.equal((await other.request()).status, 403);
  assert.equal((await other.request('POST', { action: 'preview', ...schedule() })).status, 403);
  const own = fixture(); await assert.rejects(own.review('reopen', { reason: 'Reopen for testing.' }), /Admin access required/);
  const response = await own.request(); const { actor } = await response.json();
  assert.equal(actor.canActivate, true); assert.equal(actor.canManage, false);
  assert.equal((await own.request('POST', { action: 'preview', ...schedule() })).status, 200);
  assert.equal(own.audits.length, 0);
});

test('direct approval still requires a complete accepted checklist, verification, orientation and assessment', async () => {
  for (const overrides of [{ fieldReviews: {} }, { documents: [] }, { emailVerifiedAt: null }, { user: { isBanned: true } }]) {
    const f = fixture('SAFETY', overrides); await assert.rejects(f.review('schedule', schedule())); assert.equal(f.audits.length, 0);
  }
  const notAssessed = fixture('ADMIN', { status: 'ORIENTATION_SCHEDULED' });
  await assert.rejects(notAssessed.review('activate', { services: ['DELIVERY'] }), /assessment passes/);
  const incomplete = fixture('SAFETY', { status: 'ASSESSED', attendedAt: null, assessmentPassedAt: null });
  await assert.rejects(incomplete.review('activate', { services: ['DELIVERY'] }), /successful orientation and assessment/);
  for (const role of ['SUPPORT', 'SUPPORT_SUPERVISOR', 'FINANCE', 'RIDER']) {
    await assert.rejects(fixture(role).review('schedule', schedule()), /reviewer access required/);
  }
});

test('Safety can complete an assessed demo but cannot grant it real services', async () => {
  const f = fixture('SAFETY', { isDemo: true, status: 'ASSESSED', attendedAt: new Date(), assessmentPassedAt: new Date(), assessedById: 'reviewer' });
  await assert.rejects(f.review('activate', { services: ['DELIVERY'] }));
  assert.equal((await f.review('complete-demo', { services: ['DELIVERY'] })).status, 'DEMO_COMPLETED');
  assert.equal(f.approvals.length, 0); assert.equal(f.profileWrites(), 0);
  assert.equal(f.audits[0].action, 'APPLICATION_COMPLETE-DEMO');
});

test('Admin and Safety UI expose direct approval and expanded audit history without a recommendation step', () => {
  for (const role of ['ADMIN', 'SAFETY']) {
    const f = fixture(role); let state = 0;
    const react = { ...React, useState: initial => [state++ === 0 ? { application: f.app, actor: { id: f.actor.id, canActivate: true, canManage: role === 'ADMIN' } } : initial, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn, useEffect() {} };
    const load = loader({ react, 'next/link': { __esModule: true, default: 'a' }, '@/hooks/use-local-demo': { useLocalDemo: () => ({ enabled: false }) }, '@/hooks/use-visible-poll': { useVisiblePoll() {} } });
    const Component = load('src/components/rider-applications.tsx').RiderApplications;
    const html = renderToStaticMarkup(React.createElement(Component, { id: f.app.id }));
    assert(html.includes('Approve &amp; send invitation with PDF')); assert(!html.includes('Recommend approval'));
    assert(html.includes('details class="oa-card" open=""')); assert(html.includes('Application audit history'));
    assert.equal(html.includes('Reopen &amp; revoke service access'), role === 'ADMIN');
  }
});
