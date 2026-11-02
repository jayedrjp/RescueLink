import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate, parseRules, type Doc } from "./rules-eval";
import { scenarios, seed } from "./rules.scenarios";

const rulesText = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
const parsed = parseRules(rulesText);
const db = new Map<string, Doc>(Object.entries(seed));

describe("firestore.rules (local evaluator)", () => {
  it("parses and exposes the expected helper functions", () => {
    for (const fn of [
      "isAdmin",
      "isApprovedVolunteer",
      "validNewProfile",
      "validNewSos",
      "validNewDonation",
      "validPushSubscription",
      "ownerSharesLocation",
    ]) {
      expect(parsed.fns.has(fn), fn).toBe(true);
    }
  });

  for (const s of scenarios) {
    it(`${s.expect.toUpperCase()}: ${s.name}`, () => {
      const decision = evaluate(parsed, {
        op: s.op,
        path: s.path,
        actor: s.actor,
        before: s.op === "create" ? undefined : db.get(s.path),
        after: s.after,
        query: s.query,
        db,
      });
      expect(decision.allowed ? "allow" : "deny").toBe(s.expect);
    });
  }

  it("has a healthy mix of allow and deny scenarios", () => {
    const allow = scenarios.filter((s) => s.expect === "allow").length;
    const deny = scenarios.filter((s) => s.expect === "deny").length;
    expect(allow).toBeGreaterThan(25);
    expect(deny).toBeGreaterThan(80);
  });
});
