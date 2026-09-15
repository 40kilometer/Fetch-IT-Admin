// Session helper for the admin app. Same HMAC-signed cookie approach as
// the main Fetch-It app, but its own cookie name and secret — this is a
// separate deployment on a separate domain, so there's no reason to share
// sessions with the customer/rider app even though they share a database.

import { cookies } from "next/headers";
import crypto from "crypto";

const SESSION_COOKIE = "fetchit_admin_session";
const SECRET = process.env.ADMIN_SESSION_SECRET || "fetch-it-admin-dev-secret-please-rotate";

export interface AdminSessionPayload {
  uid: string;
  email: string;
  name: string;
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
  return crypto.createHmac("sha256", SECRET).update(payloadStr).digest("base64url");
}

export function createAdminSessionToken(payload: Omit<AdminSessionPayload, "exp">): string {
  const fullPayload: AdminSessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 8, // 8 hours — shorter-lived than customer/rider sessions
  };
  const payloadStr = b64encode(fullPayload);
  return `${payloadStr}.${sign(payloadStr)}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  const [payloadStr, sig] = token.split(".");
  if (!payloadStr || !sig) return null;
  if (sign(payloadStr) !== sig) return null;
  const payload = b64decode<AdminSessionPayload>(payloadStr);
  if (!payload || payload.exp < Date.now()) return null;
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
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
