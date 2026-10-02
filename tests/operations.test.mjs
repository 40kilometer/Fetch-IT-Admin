import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingWhere, bookingQuery, pageNumber, normalizeFilters, ACTIVE_STATUSES } from '../src/lib/operations.ts';

test('booking dates include a full Philippine calendar day', () => {
  const where = bookingWhere({ from: '2026-10-03', to: '2026-10-03' });
  assert.equal(where.AND[0].createdAt.gte.toISOString(), '2026-10-02T16:00:00.000Z');
  assert.equal(where.AND[0].createdAt.lte.toISOString(), '2026-10-03T15:59:59.999Z');
});
test('invalid and reversed dates cannot broaden the query', () => {
  for (const from of ['bad', '2026-02-30', '2026-13-01']) assert.throws(() => bookingWhere({from}));
  assert.throws(() => bookingWhere({from:'2026-10-04',to:'2026-10-03'}));
});
test('unassigned threshold excludes future scheduled pickups and terminal states', () => {
  const now = new Date('2026-10-03T01:00:00Z');
  const where = bookingWhere({attention:'unassigned'},now).AND[0];
  assert.equal(where.createdAt.lte.toISOString(),'2026-10-03T00:55:00.000Z');
  assert.equal(where.riderId,null);
  assert.deepEqual(where.status.in,ACTIVE_STATUSES);
  assert.equal(where.OR[1].scheduledAt.lte,now);
  assert(ACTIVE_STATUSES.includes('MATCHED'));
  assert(!ACTIVE_STATUSES.includes('DELIVERED'));
});
test('stalled queue requires a rider, elapsed time and a due booking', () => {
  const now = new Date('2026-10-03T01:00:00Z');
  const where = bookingWhere({attention:'stalled'},now).AND[0];
  assert.deepEqual(where.riderId,{not:null});
  assert.equal(where.updatedAt.lte.toISOString(),'2026-10-03T00:30:00.000Z');
  assert(!where.status.in.includes('PENDING'));
  assert.equal(where.OR[1].scheduledAt.lte,now);
});
test('page links preserve every filter and reject invalid page values', () => {
  const filters={q:'Main & First',from:'2026-10-01',to:'2026-10-03',type:'RIDE',status:'MATCHED',attention:'stalled'};
  const query=new URLSearchParams(bookingQuery(filters,2));
  for(const [key,value] of Object.entries(filters)) assert.equal(query.get(key),value);
  assert.equal(query.get('page'),'2');
  for(const value of ['bad','-1','1.2','Infinity','0']) assert.equal(pageNumber(value),1);
  assert.equal(pageNumber('2'),2);
});
test('repeated or non-string query values are ignored safely', () => {
  assert.deepEqual(normalizeFilters({q:['a','b'],page:[],status:{bad:true},from:'2026-10-03'}),{q:undefined,status:undefined,type:undefined,from:'2026-10-03',to:undefined,attention:undefined,page:undefined});
});
