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
      if (name.startsWith('@/')) { const base = 'src/' + name.slice(2); return load(base + (fs.existsSync(path.join(root, base + '.ts')) ? '.ts' : '.tsx')); }
      if (name.startsWith('.')) { const base = path.resolve(path.dirname(filename), name); return load(base + (fs.existsSync(base + '.ts') ? '.ts' : '.tsx')); }
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
  const audits = [], approvals = [], sentMails = []; let profileWrites = 0;
  const copy = () => structuredClone(app);
  const db = { $queryRaw: async () => [],
    riderApplication: { findUnique: async () => copy(), findUniqueOrThrow: async () => copy(), update: async ({ data }) => { for (const [key, value] of Object.entries(data)) app[key] = key === 'version' ? app.version + value.increment : value; return copy(); } },
    riderApplicationEvent: { findFirst: async ({ where }) => structuredClone(app.events.find(e => e.action === where.action) ?? null), create: async ({ data }) => { app.events.unshift({ id: 'event-' + app.events.length, createdAt: new Date(), ...data }); } },
    adminAudit: { create: async ({ data }) => { audits.push(data); } },
    riderApplicationEmail: { create: async ({ data }) => { app.emails.unshift({ id: 'email-' + app.emails.length, status: 'PENDING', ...data }); } },
    riderServiceApproval: { findFirst: async ({ where }) => approvals.find(a => a.userId === where.userId && where.service.in.includes(a.service)) ?? null, findMany: async () => approvals, upsert: async ({ create }) => { approvals.push(create); } },
    riderProfile: { update: async () => { profileWrites++; } },
  }; db.$transaction = callback => callback(db);
  const load = loader({ './db': { db }, './request-guard': { RateLimitError: class extends Error {} }, './application-storage': {}, './application-mail': { sendApplicationEmail: async id => { sentMails.push(id); }, orientationLetter: async () => Buffer.from('PDF'), applicationMessage: () => ({ text: 'Preview' }) } });
  const review = (action, body = {}, person = actor) => load('src/lib/rider-application.ts').reviewApplication(app.id, person, { action, version: app.version, ...body });
  const request = (method = 'GET', body, person = actor) => load('src/lib/application-staff-api.ts').staffApplicationRequest(new NextRequest('https://admin.example.invalid/api/rider-applications/application', { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }), person, app.id);
  return { app, actor, audits, approvals, sentMails, review, request, load, profileWrites: () => profileWrites };
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

test('Safety can claim an unassigned orientation or assessment without resetting its result', async () => {
  for (const status of ['ORIENTATION_SCHEDULED', 'ASSESSED', 'REJECTED']) {
    const at = new Date(Date.now() - 60000), f = fixture('SAFETY', { assignedToId: null, status, orientationAt: at, assessedById: 'prior-reviewer', assessmentNotes: 'Prior recorded result.' });
    const claimed = await f.review('claim'); assert.equal(claimed.status, status); assert.equal(claimed.assignedToId, f.actor.id);
    assert.equal(claimed.orientationAt.getTime(), at.getTime()); assert.equal(claimed.assessedById, 'prior-reviewer');
  }
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

for (const role of ['ADMIN', 'SAFETY']) for (const action of ['activate', 'complete-demo']) {
 test(role + ' activates approved autofilled applications through ' + action, async () => {
  const f = fixture(role, { isDemo: true, status: 'ASSESSED', orientationAt: new Date(Date.now()-60000), attendedAt: new Date(), assessmentPassedAt: new Date(), assessedById: 'reviewer', assessmentNotes: 'Assessment passed.' });
  assert.equal((await f.review(action, { services: ['DELIVERY'] })).status, 'ACTIVE');
  assert.equal(f.approvals.length, 1); assert.equal(f.profileWrites(), 1); assert.equal(f.audits[0].details.autofilled, true);
  assert.equal(f.app.emails[0].payload.demo, undefined); assert.equal(f.app.emails[0].payload.autofilled, true);
  const response=await f.request('GET');assert.equal(response.status,200);assert.equal((await response.json()).approvals.length,1);
 });
}
test('previously completed autofill applications can receive the missing service approvals', async () => {
 const f=fixture('ADMIN',{isDemo:true,status:'DEMO_COMPLETED',orientationAt:new Date(Date.now()-60000),attendedAt:new Date(),assessmentPassedAt:new Date(),assessedById:'reviewer',assessmentNotes:'Passed.'});
 assert.equal((await f.review('activate',{services:['DELIVERY']})).status,'ACTIVE'); assert.equal(f.approvals.length,1);
 await assert.rejects(f.review('activate',{services:['DELIVERY']}),/already active/);
 const missing=fixture('ADMIN',{isDemo:true,status:'DEMO_COMPLETED'}); await assert.rejects(missing.review('activate',{services:['DELIVERY']}));
});

test('Admin and Safety UI expose direct approval and accessible audit history without a recommendation step', () => {
  for (const role of ['ADMIN', 'SAFETY']) {
    const f = fixture(role); let state = 0;
    const react = { ...React, useState: initial => [state++ === 0 ? { application: f.app, actor: { id: f.actor.id, canActivate: true, canManage: role === 'ADMIN' } } : initial, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn, useEffect() {} };
    const load = loader({ react, 'next/link': { __esModule: true, default: 'a' }, '@/hooks/use-local-demo': { useLocalDemo: () => ({ enabled: false }) }, '@/hooks/use-visible-poll': { useVisiblePoll() {} } });
    const Component = load('src/components/rider-applications.tsx').RiderApplications;
    const html = renderToStaticMarkup(React.createElement(Component, { id: f.app.id }));
    assert(html.includes('Approve &amp; send invitation with PDF')); assert(!html.includes('Recommend approval'));
    assert(html.includes('aria-label="Application stages"')); assert(html.includes('History · 0')); assert(html.includes('Application audit history')); assert(html.includes('role="tabpanel"'));
    assert.equal(html.includes('Reopen &amp; revoke service access'), role === 'ADMIN');
  }
});

test('Safety decisions stay locked until orientation elapsed and its result selects approve or reject', async () => {
  const { orientationDecision } = loader()('src/lib/application-decisions.ts');
  const at = Date.now(), base = { status: 'ASSESSED', orientationAt: new Date(at + 60000), assessedById: 'reviewer', assessmentNotes: 'Passed.', attendedAt: new Date(), assessmentPassedAt: new Date() };
  assert.equal(orientationDecision(base, at).canApprove, false);
  assert.equal(orientationDecision({ ...base, orientationAt: new Date(at - 1) }, at).canApprove, true);
  assert.equal(orientationDecision({ ...base, orientationAt: new Date(at - 1), assessedById: null }, at).canApprove, false);
  const failed = { ...base, status: 'ORIENTATION_SCHEDULED', orientationAt: new Date(at - 1), attendedAt: null, assessmentPassedAt: null };
  assert.equal(orientationDecision(failed, at).canApprove, false); assert.equal(orientationDecision(failed, at).canReject, true);
  const f = fixture('SAFETY', failed);
  assert.equal((await f.review('reject', { reason: 'Rider did not attend orientation.' })).status, 'REJECTED');
  assert.equal(f.audits[0].details.reason, 'Rider did not attend orientation.'); assert.equal(f.app.emails[0].kind, 'REJECTED');
  await assert.rejects(fixture('SAFETY', base).review('reject', { reason: 'Not yet.' }));
});

test('Safety force approval queues a reasoned immutable request; only Admin can activate its exact selected services', async () => {
  const f = fixture('SAFETY', { status: 'ORIENTATION_SCHEDULED', orientationAt: new Date(Date.now() + 86400000) });
  await assert.rejects(f.review('force-approval', { services: ['DELIVERY'], reason: 'x' }));
  const pending = await f.review('force-approval', { services: ['DELIVERY'], reason: 'Orientation result needs a management exception.' });
  assert.equal(pending.status, 'FORCE_APPROVAL_PENDING'); assert.equal(f.approvals.length, 0); assert.equal(f.profileWrites(), 0);
  const proposal = pending.events[0].details;
  assert.equal(proposal.requestedById, f.actor.id); assert.equal(proposal.applicationVersion, pending.version);
  await assert.rejects(f.review('approve-force', { requestId: proposal.requestId }), /Admin must decide/);
  await assert.rejects(f.review('deny-force', { requestId: proposal.requestId, reason: 'Not allowed.' }), /Admin must decide/);
  const admin = { id: 'admin', name: 'Admin Reviewer', role: 'ADMIN' };
  await assert.rejects(f.review('approve-force', { requestId: 'forged' }, admin), /no longer pending/);
  const approved = await f.review('approve-force', { requestId: proposal.requestId, services: ['RIDE'] }, admin);
  assert.equal(approved.status, 'ACTIVE'); assert.deepEqual(f.approvals.map(a => a.service), ['DELIVERY']);
  assert.equal(f.approvals[0].approvedById, admin.id); assert.equal(approved.attendedAt, undefined);
  assert.equal(f.audits[1].details.reason, proposal.reason); assert.equal(f.audits[1].details.requestedById, f.actor.id);
  await assert.rejects(f.review('approve-force', { requestId: proposal.requestId }, admin), /no longer pending/);
});

test('Admin can force approval immediately with a reason; denying a staff request restores its previous stage', async () => {
  const direct = fixture('ADMIN');
  assert.equal((await direct.review('force-approval', { services: ['DELIVERY'], reason: 'Approved management exception for this applicant.' })).status, 'ACTIVE');
  assert.equal(direct.audits.length, 1); assert.equal(direct.audits[0].details.forceApproval, true);
  const denied = fixture('SAFETY', { status: 'REJECTED' });
  const pending = await denied.review('force-approval', { services: ['DELIVERY'], reason: 'Please review the failed assessment exception.' });
  const requestId = pending.events[0].details.requestId;
  await denied.review('deny-force', { requestId, reason: 'Applicant must repeat the orientation.' }, { id: 'admin', name: 'Admin', role: 'ADMIN' });
  assert.equal(denied.app.status, 'REJECTED'); assert.equal(denied.approvals.length, 0);
  const incomplete = fixture('ADMIN', { documents: [] });
  await assert.rejects(incomplete.review('force-approval', { services: ['DELIVERY'], reason: 'Still needs accepted documents.' }));
  const stale = fixture('SAFETY');
  const proposed = await stale.review('force-approval', { services: ['DELIVERY'], reason: 'Management exception requested.' });
  stale.app.version++;
  await assert.rejects(stale.review('approve-force', { requestId: proposed.events[0].details.requestId }, { id: 'admin', name: 'Admin', role: 'ADMIN' }), /no longer pending/);
});

test('autofill does not change the audited Admin force approval behavior', async () => {
 const f=fixture('ADMIN',{isDemo:true});
 assert.equal((await f.review('force-approval',{services:['DELIVERY'],reason:'Approve for the presentation after checklist review.'})).status,'ACTIVE');
 assert.equal(f.approvals.length,1);assert.equal(f.profileWrites(),1);assert.equal(f.audits[0].details.autofilled,true);
});
test('the API sends no activation email for a pending Safety request and sends it after Admin approval', async () => {
  const f = fixture('SAFETY');
  let response = await f.request('POST', { action: 'force-approval', version: f.app.version, reason: 'Management exception requested.', services: ['DELIVERY'] });
  assert.equal(response.status, 200); assert.equal(f.sentMails.length, 0); assert.equal(f.approvals.length, 0);
  const pending = (await response.json()).application;
  response = await f.request('POST', { action: 'approve-force', version: pending.version, requestId: pending.events[0].details.requestId }, { id: 'admin', role: 'ADMIN', name: 'Admin' });
  assert.equal(response.status, 200); assert.equal(f.sentMails.length, 1); assert.equal(f.approvals.length, 1);
});

test('Approve and Reject buttons follow the result gate while Force approval and Admin decisions use a reason', () => {
  const now = Date.now();
  const cases = [
    [{ status: 'ASSESSED', orientationAt: new Date(now + 60000), assessedById: 'reviewer', assessmentNotes: 'Passed.', attendedAt: new Date(), assessmentPassedAt: new Date() }, false, false],
    [{ status: 'ASSESSED', orientationAt: new Date(now - 60000), assessedById: 'reviewer', assessmentNotes: 'Passed.', attendedAt: new Date(), assessmentPassedAt: new Date() }, true, false],
    [{ status: 'ORIENTATION_SCHEDULED', orientationAt: new Date(now - 60000), assessedById: 'reviewer', assessmentNotes: 'Absent.', attendedAt: null, assessmentPassedAt: null }, false, true],
    [{ status: 'ORIENTATION_SCHEDULED', orientationAt: new Date(now - 60000) }, false, false],
  ];
  function render(app, admin = false) {
    let slot = 0;
    const react = { ...React, useEffect() {}, useState(initial) { const index = slot++; const value = index === 0 ? now : index === 1 ? ['DELIVERY'] : [3, 4, 5].includes(index) ? 'Recorded decision reason.' : typeof initial === 'function' ? initial() : initial; return [value, () => {}]; } };
    const Component = loader({ react })('src/components/application-service-decision.tsx').ApplicationServiceDecision;
    return renderToStaticMarkup(React.createElement(Component, { application: app, admin, disabled: false, onAction: async () => true }));
  }
  for (const [overrides, approve, reject] of cases) {
    const html = render(fixture('SAFETY', overrides).app);
    for (const [label, enabled] of [['Approve rider services', approve], ['Reject application', reject], ['Force approval', true]]) {
      const match = html.match(new RegExp('<button([^>]*)>' + label + '</button>')); assert(match, label);
      assert.equal(!match[1].includes('disabled'), enabled, label);
    }
  }
  const pending = fixture('SAFETY', { status: 'FORCE_APPROVAL_PENDING' }).app;
  pending.events = [{ action: 'FORCE_APPROVAL_REQUESTED', details: { requestId: 'request', reason: 'Recorded reason.', requestedById: 'staff', requestedByName: 'Safety Staff', requestedByRole: 'SAFETY', requestedAt: new Date().toISOString(), applicationVersion: pending.version, previousStatus: 'IN_REVIEW', vehicleClass: 'MOTORCYCLE', services: ['DELIVERY'] } }];
  assert(!render(pending).includes('Approve force request'));
  const adminHtml = render(pending, true); assert(adminHtml.includes('Approve force request')); assert(adminHtml.includes('Recorded reason.'));
});

test('only Admin receives notifications of pending force requests', async () => {
  let queries = 0;
  const db = { booking: { findMany: async () => [] }, supportTicket: { findMany: async () => [] }, supportMessage: { findMany: async () => [] }, workflowCase: { findMany: async () => [] }, riderApplication: { findMany: async () => { queries++; return [{ id: 'app', version: 2, updatedAt: new Date(), user: { name: 'Rider' } }]; } } };
  for (const role of ['ADMIN', 'SAFETY']) {
    const load = loader({ '@/lib/db': { db }, '@/lib/admin-access': {}, '@/lib/staff-access': { currentStaff: async () => ({ id: role, role }) } });
    const response = await load('src/app/api/notifications/route.ts').GET(); assert.equal(response.status, 200);
    const { items } = await response.json(); assert.equal(items.some(i => i.title === 'Force approval needs your decision'), role === 'ADMIN');
  }
  assert.equal(queries, 1);
});
