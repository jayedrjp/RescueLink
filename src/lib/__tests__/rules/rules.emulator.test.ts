/**
 * Runs the shared security-rule scenarios against the REAL Firestore emulator.
 *
 *   npm run test:rules
 *
 * Requires Java 11+ and network access for `firebase-tools` to download the emulator on its first
 * run. Excluded from the default `npm test` (see vitest.config.ts) because it needs the emulator.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
} from "firebase/firestore";
import { scenarios, seed } from "./rules.scenarios";

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env["FIRESTORE_EMULATOR_HOST"] ?? "127.0.0.1:8085").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-rescuelink",
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
      host: host ?? "127.0.0.1",
      port: Number(port ?? 8080),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [path, data] of Object.entries(seed)) {
      await setDoc(doc(db, path), data);
    }
  });
});

describe("firestore.rules (real emulator)", () => {
  for (const s of scenarios) {
    it(`${s.expect.toUpperCase()}: ${s.name}`, async () => {
      const ctx = s.actor
        ? env.authenticatedContext(s.actor.uid, s.actor.token ?? {})
        : env.unauthenticatedContext();
      const db = ctx.firestore();

      let attempt: Promise<unknown>;
      switch (s.op) {
        case "get":
          attempt = getDoc(doc(db, s.path));
          break;
        case "list": {
          const col = collection(db, s.path.split("/")[0]!);
          attempt = getDocs(s.query?.limit ? query(col, limit(s.query.limit)) : col);
          break;
        }
        case "create":
        case "update":
          attempt = setDoc(doc(db, s.path), s.after ?? {});
          break;
        case "delete":
          attempt = deleteDoc(doc(db, s.path));
          break;
      }
      await (s.expect === "allow" ? assertSucceeds(attempt) : assertFails(attempt));
    });
  }
});
