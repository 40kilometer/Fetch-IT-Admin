// Additive, idempotent runner for the user's requested fictional team history.
// No application API mutations, mail transport, notification helpers, auth identities,
// service grants, live bookings, or edits to existing records are used here.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { parseEnv } = require('node:util'), ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { BATCH, buildPlan } = require('./team-activity-plan.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'tmp/team-activity');
const adminRoot = 'C:/Users/Z/Downloads/fetch-admin', customerRoot = 'C:/Users/Z/Downloads/fetch-customer';
function load(file) {
  const filename = path.resolve(customerRoot, file), exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', code)(exports, name => name.startsWith('@/') ? load('src/' + name.slice(2) + '.ts') : name.startsWith('.') ? load(path.resolve(path.dirname(filename), name + '.ts')) : require(name));
  return exports;
}
async function prepare(db) {
  fs.mkdirSync(output, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(customerRoot, 'local-defense-users.json'), 'utf8'));
  assert.equal(manifest.synthetic, true); assert.equal(manifest.users.length, 900);
  const selected = Array.from({ length: 24 }, (_, index) => manifest.users[Math.floor(index * manifest.users.length / 24)]);
  const [customers, staff, config] = await Promise.all([
    db.user.findMany({ where: { id: { in: selected.map(user => user.id) } }, select: { id: true, name: true, email: true, role: true, isBanned: true, createdAt: true } }),
    db.user.findMany({ where: { email: { in: ['fetchitadmin@gmail.com', 'cs@staff.fetchit.invalid', 'cs-supervisor@staff.fetchit.invalid', 'finance@staff.fetchit.invalid', 'safety@staff.fetchit.invalid'] } }, select: { id: true, name: true, email: true, role: true, isBanned: true, createdAt: true } }),
    db.platformConfig.findUnique({ where: { id: 'platform' } }),
  ]);
  assert.equal(customers.length, 24); assert.equal(staff.length, 5);
  for (const customer of customers) { const expected = selected.find(record => record.id === customer.id); assert.equal(customer.name, expected.name); assert.equal(customer.email, expected.email); assert.equal(customer.role, 'CUSTOMER'); assert(!customer.isBanned); }
  const referenceFile = path.join(output, 'reference.json');
  const reference = fs.existsSync(referenceFile) ? JSON.parse(fs.readFileSync(referenceFile, 'utf8')) : { batch: BATCH, now: new Date().toISOString() };
  assert.equal(reference.batch, BATCH);
  if (!fs.existsSync(referenceFile)) fs.writeFileSync(referenceFile, JSON.stringify(reference), { flag: 'wx', mode: 0o600 });
  const { quoteFare, quoteRideFare } = load('src/lib/fare.ts'), { defaultPlatformSettings, validatePlatformSettings } = load('src/lib/platform-policy.ts'), { requiredDocuments } = load('src/lib/rider-application-policy.ts');
  const byId = new Map(customers.map(customer => [customer.id, customer]));
  return buildPlan({ customers: selected.map(customer => byId.get(customer.id)), staff, now: new Date(reference.now), quoteFare, quoteRideFare, settings: config ? validatePlatformSettings(config.settings) : defaultPlatformSettings(), requiredDocuments });
}
function summary(plan) {
  return { batch: BATCH, referenceTime: plan.referenceTime, customers: 24, staffRoles: 5, bookings: plan.bookings.length, delivered: plan.bookings.filter(booking => booking.status === 'DELIVERED').length, cancelled: plan.bookings.filter(booking => booking.status === 'CANCELLED').length, applications: plan.applications.length, stages: plan.applications.reduce((counts, app) => { counts[app.status] = (counts[app.status] ?? 0) + 1; return counts; }, {}), documents: plan.documents.length, tickets: plan.tickets.length, supportMessages: plan.messages.length, internalNotes: plan.internalNotes.length, teamReviews: plan.cases.length, resources: plan.resources.length, auditEvents: plan.audits.length, liveBookings: 0, serviceGrants: 0, outboundMessages: 0 };
}
function validate(plan) {
  const customerIds = new Set(plan.bookings.map(booking => booking.customerId)), userIds = new Set(plan.users.map(user => user.id)), ticketById = new Map(plan.tickets.map(ticket => [ticket.id, ticket])), bookingById = new Map(plan.bookings.map(booking => [booking.id, booking]));
  assert.equal(plan.applications.length, 12); assert.equal(userIds.size, 15); assert.equal(new Set(plan.bookings.map(booking => booking.refCode)).size, plan.bookings.length);
  assert(plan.bookings.every(booking => ['DELIVERED', 'CANCELLED'].includes(booking.status) && userIds.has(booking.riderId) && booking.updatedAt <= plan.referenceTime));
  assert(plan.bookings.filter(booking => booking.paymentMethod === 'CASH').every(booking => booking.paymentStatus === 'UNPAID' && !booking.customerPaidAt && !booking.riderReceivedAt));
  assert(plan.presence.every(presence => !presence.isOnline));
  assert(plan.applications.every(app => app.isDemo && app.fields.synthetic && !app.emailVerifiedAt && !app.verifiedEmail && userIds.has(app.userId) && app.updatedAt <= plan.referenceTime));
  assert(plan.users.every(user => user.email.endsWith('.fetchit.invalid') && user.role === 'RIDER'));
  for (const ticket of plan.tickets) { assert(customerIds.has(ticket.customerId)); assert.equal(bookingById.get(ticket.bookingId).customerId, ticket.customerId); }
  for (const record of plan.cases) { assert.equal(ticketById.get(record.ticketId).customerId, record.subjectUserId); assert.equal(ticketById.get(record.ticketId).bookingId, record.bookingId); assert(record.updatedAt <= plan.referenceTime); }
  assert(plan.audits.every(event => event.details.synthetic && event.details.batch === BATCH && event.createdAt <= plan.referenceTime));
  assert(plan.applicationEvents.every(event => event.details.synthetic && event.createdAt <= plan.referenceTime));
  for (const record of plan.cases.filter(record => record.decidedById)) assert(record.decidedById !== record.createdById && record.decidedById !== record.assignedToId);
}
async function scopeCounts(db) {
  const where = { id: { startsWith: BATCH + '_' } };
  return { users: await db.user.count({ where }), bookings: await db.booking.count({ where }), applications: await db.riderApplication.count({ where }), documents: await db.riderApplicationDocument.count({ where }), tickets: await db.supportTicket.count({ where }), messages: await db.supportMessage.count({ where }), cases: await db.workflowCase.count({ where }), audits: await db.adminAudit.count({ where }), resources: await db.staffResource.count({ where }) };
}
async function main() {
  const owner = parseEnv(fs.readFileSync(path.join(adminRoot, '.env'), 'utf8')), restricted = parseEnv(fs.readFileSync(path.join(adminRoot, '.env.production.repair.local'), 'utf8'));
  const target = new URL(restricted.DATABASE_URL), configured = new URL(owner.DATABASE_URL);
  assert.equal(target.hostname, configured.hostname); assert.equal(target.pathname, configured.pathname); assert(!configured.searchParams.get('schema') || configured.searchParams.get('schema') === 'public');
  process.env.DATABASE_URL = owner.DATABASE_URL;
  const db = new PrismaClient();
  try {
    const [context] = await db.$queryRaw`SELECT current_schema() AS schema`; assert.equal(context.schema, 'public');
    const plan = await prepare(db); validate(plan);
    fs.writeFileSync(path.join(output, 'plan.json'), JSON.stringify(plan, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary(plan), null, 2));
    const existing = await scopeCounts(db), expected = { users: plan.users.length, bookings: plan.bookings.length, applications: plan.applications.length, documents: plan.documents.length, tickets: plan.tickets.length, messages: plan.messages.length, cases: plan.cases.length, audits: plan.audits.length, resources: plan.resources.length };
    if (Object.values(existing).some(Boolean)) { assert.deepEqual(existing, expected, 'A partial or conflicting batch exists. Do not overwrite it.'); console.log(JSON.stringify({ alreadyApplied: true, ...summary(plan) })); return; }
    if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ dryRun: true, ...summary(plan) })); return; }
    if (process.env.APPLY_TEAM_ACTIVITY !== BATCH) throw Error('Set APPLY_TEAM_ACTIVITY to the reviewed batch before applying.');
    assert.equal(await db.user.count({ where: { email: { in: plan.users.map(user => user.email) } } }), 0, 'An applicant email already exists.');
    assert.equal(await db.booking.count({ where: { refCode: { in: plan.bookings.map(booking => booking.refCode) } } }), 0, 'A booking reference already exists.');
    const assets = JSON.parse(fs.readFileSync(path.join(output, 'assets.json'), 'utf8')); assert.equal(assets.batch, BATCH);
    assert.equal(assets.documents.length, plan.documents.length);
    if (!process.env.BLOB_READ_WRITE_TOKEN) process.env.BLOB_READ_WRITE_TOKEN = parseEnv(fs.readFileSync(path.join(customerRoot, '.env.blob.local'), 'utf8')).BLOB_READ_WRITE_TOKEN;
    assert(process.env.BLOB_READ_WRITE_TOKEN, 'Private document storage configuration is required.');
    const { put } = require('@vercel/blob'), { randomUUID, createHash } = require('node:crypto'), uploaded = [];
    for (const document of plan.documents) {
      const asset = assets.documents.find(asset => asset.id === document.id); assert(asset);
      const file = path.resolve(root, asset.file); assert(file.startsWith(path.join(root, 'output', 'pdf', 'team-activity') + path.sep));
      const bytes = fs.readFileSync(file); assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256); assert(bytes.length < 3 * 1024 * 1024);
      const extension = document.kind === 'PROFILE' ? 'jpg' : 'pdf', pathname = `rider-applications/${document.applicationId}/${randomUUID()}.${extension}`, mimeType = extension === 'jpg' ? 'image/jpeg' : 'application/pdf';
      await put(pathname, bytes, { access: 'private', contentType: mimeType, addRandomSuffix: false, allowOverwrite: false });
      uploaded.push({ ...document, pathname, mimeType });
      if (uploaded.length % 12 === 0 || uploaded.length === plan.documents.length) console.log(JSON.stringify({ privateAttachmentsReady: uploaded.length, total: plan.documents.length }));
      fs.writeFileSync(path.join(output, 'uploaded-documents.json'), JSON.stringify({ batch: BATCH, documents: uploaded }, null, 2), { mode: 0o600 });
    }
    fs.writeFileSync(path.join(output, 'before.json'), JSON.stringify({ batch: BATCH, checkedAt: new Date(), existing, expected }, null, 2));
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${BATCH}))::text`;
      assert.deepEqual(await scopeCounts(tx), existing, 'The batch appeared while preparing its files.');
      const countsBefore = await Promise.all([tx.customerNotification.count(), tx.riderApplicationEmail.count(), tx.riderServiceApproval.count(), tx.authIdentity.count()]);
      await tx.user.createMany({ data: plan.users }); await tx.riderProfile.createMany({ data: plan.profiles }); await tx.riderPresence.createMany({ data: plan.presence });
      await tx.booking.createMany({ data: plan.bookings }); await tx.bookingEvent.createMany({ data: plan.bookingEvents }); await tx.paymentEvent.createMany({ data: plan.paymentEvents });
      await tx.supportTicket.createMany({ data: plan.tickets }); await tx.supportMessage.createMany({ data: plan.messages }); await tx.supportInternalNote.createMany({ data: plan.internalNotes });
      await tx.workflowCase.createMany({ data: plan.cases }); await tx.workflowNote.createMany({ data: plan.workflowNotes });
      await tx.riderApplication.createMany({ data: plan.applications }); await tx.riderApplicationDocument.createMany({ data: uploaded }); await tx.riderApplicationEvent.createMany({ data: plan.applicationEvents });
      await tx.staffResource.createMany({ data: plan.resources }); await tx.adminAudit.createMany({ data: plan.audits });
      assert.deepEqual(await scopeCounts(tx), expected);
      assert.deepEqual(await Promise.all([tx.customerNotification.count(), tx.riderApplicationEmail.count(), tx.riderServiceApproval.count(), tx.authIdentity.count()]), countsBefore, 'Activity must not create notifications, email, grants, or credentials.');
    }, { isolationLevel: 'RepeatableRead', timeout: 90000 });
    const saved = { appliedAt: new Date(), ...summary(plan), ids: { users: plan.users.map(record => record.id), bookings: plan.bookings.map(record => record.id), tickets: plan.tickets.map(record => record.id), cases: plan.cases.map(record => record.id), applications: plan.applications.map(record => record.id) }, counts: await scopeCounts(db) };
    fs.writeFileSync(path.join(output, 'applied.json'), JSON.stringify(saved, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ applied: true, ...summary(plan), verified: true }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(error => { console.error('Activity preparation failed:', error.code || error.message); process.exitCode = 1; });
module.exports = { validate, summary };
