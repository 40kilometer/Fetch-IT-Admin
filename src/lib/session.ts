import { sessionSecret } from "./session-secret";
// Session helper for the admin app. Same HMAC-signed cookie approach as
// the main Fetch-It app, but its own cookie name and secret — this is a
// separate deployment on a separate domain, so there's no reason to share
// sessions with the customer/rider app even though they share a database.

import { cookies } from "next/headers";
import crypto from "crypto";

const SESSION_COOKIE = "fetchit_admin_session";

export interface AdminSessionPayload {
  uid: string;
  email: string;
  name: string;
  iat?: number;
  exp: number;
}

function b64encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function b64decode<T = unknown>(str: string): T | null {
  try {
    return JSON.parse(Buffer.from(str, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
function sign(payloadStr: string): string {
  return crypto.createHmac("sha256", sessionSecret("ADMIN_SESSION_SECRET")).update(payloadStr).digest("base64url");
}

export function createAdminSessionToken(payload: Omit<AdminSessionPayload, "exp">): string {
  const fullPayload: AdminSessionPayload = {
    ...payload,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 8, // 8 hours — shorter-lived than customer/rider sessions
  };
  const payloadStr = b64encode(fullPayload);
  return `${payloadStr}.${sign(payloadStr)}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadStr, sig] = parts;
  if (!payloadStr || !sig) return null;
  const expected = Buffer.from(sign(payloadStr));
  const received = Buffer.from(sig);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  const payload = b64decode<AdminSessionPayload>(payloadStr);
  if (!payload || typeof payload.uid !== "string" || !payload.uid || typeof payload.email !== "string" || typeof payload.name !== "string" || !Number.isFinite(payload.exp) || payload.exp < Date.now() || (payload.iat !== undefined && (!Number.isFinite(payload.iat) || payload.iat > Date.now()))) return null;
  return payload;
}

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}

export async function setAdminSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
