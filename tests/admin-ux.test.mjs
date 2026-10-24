import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { accountWhere, caseActions, overviewPeriod, priorityWindows, queryLink, queryValue } from "../src/lib/admin-ui.ts";

test("review actions enforce independent approval and valid state transitions", () => {
  const actor = { id: "admin", operations: true, managesSupport: true };
  const record = { kind: "FINANCE", status: "AWAITING_ADMIN", assignedToId: "reviewer", createdById: "creator" };
  assert.equal(caseActions(record, actor).decide, true);
  assert.equal(caseActions({ ...record, createdById: "admin" }, actor).decide, false);
  assert.equal(caseActions({ ...record, assignedToId: "admin" }, actor).decide, false);
  assert.equal(caseActions(record, actor).recommend, false);
  assert.equal(caseActions(record, actor).close, false);
  for (const kind of ["FINANCE", "SAFETY", "ESCALATION"]) {
    const resolved = caseActions({ ...record, kind, status: "RESOLVED", assignedToId: null }, actor);
    for (const key of ["claim", "assign", "note", "recommend", "decide", "close"]) assert.equal(resolved[key], false, key);
  }
  assert.equal(caseActions({ ...record, status: "OPEN" }, actor).close, false);
  assert.equal(caseActions({ ...record, status: "APPROVED" }, actor).close, true);
  assert.equal(caseActions({ ...record, kind: "ESCALATION", status: "IN_REVIEW" }, { ...actor, operations: false }).close, true);
  assert.equal(caseActions({ ...record, status: "IN_REVIEW", assignedToId: "admin" }, { ...actor, operations: false, managesSupport: false }).recommend, true);
});

test("priority pagination never skips or duplicates cases across priority boundaries", () => {
  const groups = [{ priority: "LOW", count: 67 }, { priority: "NORMAL", count: 113 }, { priority: "HIGH", count: 29 }, { priority: "URGENT", count: 2 }];
  const expected = ["URGENT", "HIGH", "NORMAL", "LOW"].flatMap(priority => Array.from({ length: groups.find(g => g.priority === priority).count }, (_, index) => priority + index));
  const actual = [];
  for (let skip = 0; skip < expected.length; skip += 25) for (const window of priorityWindows(groups, skip, 25)) {
    actual.push(...Array.from({ length: window.take }, (_, index) => window.priority + (window.skip + index)));
  }
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, 211);
  assert.deepEqual(priorityWindows(groups, 999, 25), []);
});

test("directory search remains combined with account role and presence filters", () => {
  const online = accountWhere("RIDER", "Alex", "online");
  assert.equal(online.role, "RIDER"); assert.equal(online.isBanned, false);
  assert.deepEqual(online.riderPresence, { is: { isOnline: true } });
  assert(online.AND[0].OR.some(field => field.phone?.contains === "Alex"));
  const offline = accountWhere("RIDER", "mail", "offline");
  assert.equal(offline.OR.length, 2); assert.equal(offline.AND.length, 1);
  assert.deepEqual(accountWhere("CUSTOMER", "", "restricted"), { role: "CUSTOMER", isBanned: true });
});

test("paging preserves filters and safely encodes user-entered search", () => {
  const url = new URL(queryLink("/dashboard/cases", { q: "A & B", status: "OPEN", view: "mine", sort: "priority" }, 3), "http://localhost");
  assert.equal(url.searchParams.get("q"), "A & B"); assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("view"), "mine"); assert.equal(url.searchParams.get("sort"), "priority");
  assert.equal(queryValue({ q: ["x", "y"] }, "q"), "");
  assert.equal(queryLink("/dashboard/cases", { page: 5 }, 1), "/dashboard/cases");
});

test("overview periods share inclusive Philippine midnight and a common upper bound", () => {
  const now = new Date("2026-10-23T16:30:00Z");
  assert.equal(overviewPeriod("1", now).since.toISOString(), "2026-10-23T16:00:00.000Z");
  assert.equal(overviewPeriod("7", now).since.toISOString(), "2026-10-17T16:00:00.000Z");
  assert.equal(overviewPeriod("30", now).since.toISOString(), "2026-09-24T16:00:00.000Z");
  assert.equal(overviewPeriod("bad", now).days, 1);
  assert.equal(overviewPeriod("30", now).until, now);
});

test("normal primary and muted text meet AA color contrast", () => {
  const css = fs.readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const color = key => css.match(new RegExp("--" + key + ": (#[0-9a-f]{6})"))[1];
  function luminance(hex) {
    return hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  }
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  for (const [a, b] of [["#ffffff", color("orange")], ["#ffffff", color("orange-dark")], [color("text-muted"), "#ffffff"], [color("text-muted"), color("bg")]]) assert(contrast(a, b) >= 4.5, a + " on " + b);
});
