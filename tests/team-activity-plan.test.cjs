const test = require('node:test'), assert = require('node:assert/strict');
const { buildPlan, BATCH } = require('../scripts/team-activity-plan.cjs');
const { validate } = require('../scripts/seed-team-activity.cjs');
function plan() {
  const customers = Array.from({ length: 24 }, (_, index) => ({ id: 'customer-' + index, name: 'Customer ' + index, role: 'CUSTOMER', createdAt: new Date('2026-09-01T00:00:00Z') }));
  const staff = ['ADMIN', 'SUPPORT', 'SUPPORT_SUPERVISOR', 'FINANCE', 'SAFETY'].map(role => ({ id: role.toLowerCase(), name: role, role, isBanned: false, createdAt: new Date(role === 'ADMIN' ? '2026-10-04T14:30:00Z' : '2026-10-27T15:30:20Z') }));
  const quote = () => ({ distanceKm: 8, etaMinutes: 25, fare: { baseFare: 50, totalFare: 120 }, surgeMultiplier: 1 });
  const requiredDocuments = (vehicle, services, fields) => ['PROFILE', 'LICENCE_FRONT', 'LICENCE_BACK', 'NBI', 'OR', 'CR', ...(vehicle !== 'MOTORCYCLE' && services.includes('RIDE') ? ['PASSENGER_PERMIT', 'PASSENGER_INSURANCE'] : []), ...(fields.ownership === 'BORROWED' ? ['OWNER_AUTH', 'OWNER_ID'] : [])];
  return buildPlan({ customers, staff, now: new Date('2026-10-28T23:52:20Z'), settings: {}, quoteFare: quote, quoteRideFare: quote, requiredDocuments });
}
test('generated work covers each staff queue and at least ten additional rider applications', () => {
  const data = plan(); validate(data);
  assert.equal(data.applications.length, 12); assert.equal(data.documents.length, 86);
  assert.deepEqual(Object.fromEntries(['FINANCE', 'SAFETY', 'ESCALATION'].map(kind => [kind, data.cases.filter(record => record.kind === kind).length])), { FINANCE: 6, SAFETY: 6, ESCALATION: 6 });
  assert.equal(data.cases.filter(record => record.status === 'AWAITING_ADMIN').length, 6);
  assert.equal(data.tickets.length, 28); assert.equal(data.messages.length, 70);
  for (const role of ['ADMIN', 'SUPPORT', 'SUPPORT_SUPERVISOR', 'FINANCE', 'SAFETY']) assert(data.audits.some(event => event.actorId === role.toLowerCase()));
  assert.equal(data.bookings.filter(booking => booking.status === 'DELIVERED').length, 60);
});
test('customer conversations, review ownership, and booking timelines remain coherent', () => {
  const data = plan(), bookings = new Map(data.bookings.map(booking => [booking.id, booking]));
  for (const ticket of data.tickets) {
    const booking = bookings.get(ticket.bookingId), messages = data.messages.filter(message => message.ticketId === ticket.id);
    assert.equal(ticket.customerId, booking.customerId); assert(booking.deliveredAt <= ticket.createdAt);
    assert.equal(messages[0].authorId, ticket.customerId); assert.equal(messages[0].body, ticket.message);
    for (let index = 1; index < messages.length; index++) assert(messages[index].createdAt > messages[index - 1].createdAt);
    assert.equal(ticket.lastCustomerMessageAt, messages.filter(message => message.authorRole === 'CUSTOMER').at(-1).createdAt);
    if (ticket.category === 'FARE') assert.notEqual(booking.paymentMethod, 'CASH');
  }
  for (const booking of data.bookings) {
    const events = data.bookingEvents.filter(event => event.bookingId === booking.id);
    assert.equal(events[0].toStatus, 'PENDING'); assert.equal(events.at(-1).toStatus, booking.status);
    for (let index = 1; index < events.length; index++) assert(events[index].createdAt > events[index - 1].createdAt);
    if (booking.paymentMethod !== 'CASH') {
      const paymentEvents = data.paymentEvents.filter(event => event.bookingId === booking.id);
      assert.equal(paymentEvents[0].toStatus, 'PAID'); assert.equal(paymentEvents.at(-1).toStatus, booking.paymentStatus);
    }
  }
  for (const event of [...data.audits, ...data.paymentEvents, ...data.applicationEvents].filter(event => ['support', 'support_supervisor', 'finance', 'safety'].includes(event.actorId))) assert(event.createdAt >= new Date('2026-10-27T15:30:20Z'));
  for (const app of data.applications.filter(app => ['ORIENTATION_SCHEDULED', 'ASSESSED'].includes(app.status))) {
    const schedule = data.applicationEvents.find(event => event.applicationId === app.id && event.action === 'SCHEDULE');
    assert(data.documents.filter(document => document.applicationId === app.id).every(document => document.reviewedAt <= schedule.createdAt));
  }
  for (const record of data.cases.filter(record => record.decidedById)) { assert.notEqual(record.decidedById, record.assignedToId); assert.notEqual(record.decidedById, record.createdById); }
});
test('the plan creates no real authentication, recipient dispatch, live booking, or rider service grant', () => {
  const data = plan();
  assert(data.users.every(user => user.email.endsWith('.fetchit.invalid')));
  assert(data.presence.every(presence => !presence.isOnline));
  assert(data.applications.every(app => !app.emailVerifiedAt && !app.verifiedEmail && app.status !== 'ACTIVE'));
  assert(data.bookings.every(booking => ['DELIVERED', 'CANCELLED'].includes(booking.status)));
  for (const key of ['emails', 'notifications', 'authIdentities', 'serviceApprovals']) assert.equal(data[key], undefined);
  assert(data.audits.every(event => event.details.synthetic && event.details.batch === BATCH));
  assert(data.applicationEvents.every(event => event.details.synthetic && event.details.batch === BATCH));
});
