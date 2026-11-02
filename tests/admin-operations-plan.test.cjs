const test=require('node:test'),assert=require('node:assert/strict');
const {BATCH,buildPlan}=require('../scripts/refresh-admin-operations.cjs');
test('operating history uses terminal bookings, paid completed cash, unactivated applications, and scoped team work',()=>{
 const now=new Date('2026-11-03T10:00:00Z'),createdAt=new Date('2026-10-01');
 const customers=Array.from({length:24},(_,i)=>({id:'customer'+i,name:'Customer '+i,role:'CUSTOMER',createdAt})),staff=['SUPPORT','SUPPORT_SUPERVISOR','SAFETY','SAFETY'].map((role,i)=>({id:'staff'+i,name:'Staff '+i,role,createdAt})),admin={id:'admin',name:'Admin',role:'ADMIN',createdAt};
 const templates=[{type:'DELIVERY',riderId:'rider',riderName:'Rider',totalFare:240,baseFare:50,vehicleClass:'MOTORCYCLE',distanceKm:4,pickupLabel:'Pickup',dropoffLabel:'Drop-off',pickupLat:16,pickupLng:120,dropoffLat:16.1,dropoffLng:120.1,surgeMultiplier:1,cargoWeightKg:2,passengers:1,etaMinutes:20}];
 const plan=buildPlan({customers,staff,admin,templates,applicationTemplate:{fields:{}},now});
 assert.equal(plan.bookings.length,36);assert.equal(plan.bookings.filter(b=>b.status==='DELIVERED').length,30);assert.equal(plan.applications.length,12);assert.equal(plan.resources.length,10);assert.equal(plan.cases.length,8);
 for(const booking of plan.bookings){assert(['DELIVERED','CANCELLED'].includes(booking.status));assert.equal(booking.paymentMethod,'CASH');assert(booking.updatedAt<=now);assert(!('riderName'in booking));if(booking.status==='DELIVERED'){assert.equal(booking.paymentStatus,'PAID');assert.equal(booking.customerPaidAmount,booking.totalFare);assert.equal(booking.riderReceivedAmount,booking.totalFare);}else assert.equal(booking.paymentStatus,'UNPAID');assert(!booking.receiptEmailQueuedAt);}
 assert(plan.presence.every(p=>!p.isOnline));assert(plan.users.every(u=>u.email.endsWith('.invalid')));assert(plan.applications.every(a=>a.isDemo&&a.fields.synthetic&&!a.verifiedEmail&&!a.emailVerifiedAt&&!['ACTIVE','ASSESSED','ORIENTATION_SCHEDULED'].includes(a.status)));
 for(const record of plan.cases){const ticket=plan.tickets.find(t=>t.id===record.ticketId),booking=plan.bookings.find(b=>b.id===record.bookingId);assert.notEqual(ticket.status,'RESOLVED');assert.equal(record.subjectUserId,ticket.customerId);assert.equal(booking.customerId,ticket.customerId);assert.equal(staff.find(s=>s.id===record.assignedToId).role,record.kind==='SAFETY'?'SAFETY':'SUPPORT_SUPERVISOR');}
 assert(plan.audits.every(a=>a.details.synthetic&&a.details.batch===BATCH));assert.equal(new Set(plan.bookings.map(b=>b.refCode)).size,36);
});
