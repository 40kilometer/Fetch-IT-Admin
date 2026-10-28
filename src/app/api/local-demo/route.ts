import { NextRequest, NextResponse } from 'next/server';
import { assertLocalDemo } from '@/lib/local-demo-runtime';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: NextRequest) {
  try { await assertLocalDemo(req); return NextResponse.json({ enabled: true, riderUrl: process.env.LOCAL_DEMO_RIDER_URL, adminUrl: process.env.LOCAL_DEMO_ADMIN_URL }, { headers }); }
  catch { return NextResponse.json({ enabled: false }, { status: 404, headers }); }
}
export async function POST(req: NextRequest) {
  try { await assertLocalDemo(req); } catch { return NextResponse.json({ error: 'Not found.' }, { status: 404, headers }); }
  const body = await req.json();
  if (!['reviewer', 'approver', 'activator', 'safety'].includes(body.actor)) return NextResponse.json({ error: 'Choose a demo reviewer.' }, { status: 400, headers });
  const result = await fetch(new URL('/api/auth/login', req.url), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: req.nextUrl.origin }, body: JSON.stringify({ email: `${body.actor}@fetch-demo.example.invalid`, password: process.env.LOCAL_DEMO_PASSWORD }), cache: 'no-store' });
  const response = NextResponse.json(await result.json(), { status: result.status, headers });
  const cookie = result.headers.get('set-cookie'); if (cookie) response.headers.set('Set-Cookie', cookie);
  return response;
}
