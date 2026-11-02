/**
 * Minimal LOCAL evaluator for the subset of the Firestore Security Rules language used by
 * `firestore.rules`. It parses and runs the real rules file so policy logic can be unit tested
 * without the Firebase emulator (whose jar cannot be downloaded in every environment).
 *
 * IMPORTANT: this is NOT Google's rules engine. It follows the documented semantics for the
 * constructs used here (short-circuit && / || with error handling, map/list/set helpers,
 * get()/exists(), nested match blocks) but cannot prove that Google's compiler accepts the file.
 * The same scenarios are also provided for the real emulator (see rules.emulator.test.ts).
 */

type Json = unknown;
export type Doc = Record<string, Json>;

class RuleError extends Error {}

class RSet {
  constructor(public readonly items: Set<string>) {}
}
class MapDiff {
  constructor(public readonly keys: Set<string>) {}
}

// ----------------------------------------------------------------------------
// Tokenizer
// ----------------------------------------------------------------------------
type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "path"; parts: Array<{ lit: string } | { expr: Expr }> };

const OPS = [
  "&&",
  "||",
  "==",
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "!",
  "+",
  "-",
  "*",
  "%",
  "/",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ".",
  ":",
  ";",
  "=",
  "?",
];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const prevIsOperand = () => {
    const p = toks[toks.length - 1];
    if (!p) return false;
    if (p.t === "num" || p.t === "str" || p.t === "path") return true;
    if (p.t === "id") return !["return", "if", "in", "is", "let"].includes(p.v);
    return p.t === "op" && (p.v === ")" || p.v === "]" || p.v === "}");
  };
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        out += src[j];
        j++;
      }
      toks.push({ t: "str", v: out });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++;
      toks.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      toks.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "/" && !prevIsOperand()) {
      // path literal: /a/b/$(expr)/c
      const parts: Array<{ lit: string } | { expr: Expr }> = [];
      let j = i;
      while (src[j] === "/") {
        parts.push({ lit: "/" });
        j++;
        if (src[j] === "$" && src[j + 1] === "(") {
          let depth = 0;
          let k = j + 1;
          for (; k < src.length; k++) {
            if (src[k] === "(") depth++;
            else if (src[k] === ")") {
              depth--;
              if (depth === 0) break;
            }
          }
          const inner = src.slice(j + 2, k);
          parts.push({ expr: new Parser(tokenize(inner)).parseExpr() });
          j = k + 1;
        } else {
          let k = j;
          while (k < src.length && /[A-Za-z0-9_\-.()]/.test(src[k]!)) k++;
          parts.push({ lit: src.slice(j, k) });
          j = k;
        }
      }
      toks.push({ t: "path", parts });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`Unexpected character '${c}' at ${i}`);
    toks.push({ t: "op", v: op });
    i += op.length;
  }
  return toks;
}

// ----------------------------------------------------------------------------
// AST + parser
// ----------------------------------------------------------------------------
type Expr =
  | { k: "lit"; v: Json }
  | { k: "id"; name: string }
  | { k: "path"; parts: Array<{ lit: string } | { expr: Expr }> }
  | { k: "list"; items: Expr[] }
  | { k: "map"; entries: Array<[string, Expr]> }
  | { k: "member"; obj: Expr; name: string }
  | { k: "index"; obj: Expr; idx: Expr }
  | { k: "call"; callee: Expr; args: Expr[] }
  | { k: "unary"; op: string; e: Expr }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "is"; e: Expr; type: string };

interface FnDef {
  params: string[];
  lets: Array<[string, Expr]>;
  ret: Expr;
}
interface AllowDef {
  ops: string[];
  cond: Expr | null;
}
interface MatchNode {
  pattern: string[];
  children: MatchNode[];
  allows: AllowDef[];
}

class Parser {
  p = 0;
  constructor(public toks: Tok[]) {}
  peek() {
    return this.toks[this.p];
  }
  next() {
    return this.toks[this.p++];
  }
  isOp(v: string) {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  }
  isId(v: string) {
    const t = this.peek();
    return t?.t === "id" && t.v === v;
  }
  expectOp(v: string) {
    if (!this.isOp(v)) throw new Error(`Expected '${v}' but found ${JSON.stringify(this.peek())}`);
    this.p++;
  }
  expectId(v?: string) {
    const t = this.next();
    if (t?.t !== "id" || (v && t.v !== v))
      throw new Error(`Expected id ${v ?? ""} got ${JSON.stringify(t)}`);
    return t.v;
  }

  parseExpr(): Expr {
    return this.parseOr();
  }
  parseOr(): Expr {
    let l = this.parseAnd();
    while (this.isOp("||")) {
      this.p++;
      l = { k: "bin", op: "||", l, r: this.parseAnd() };
    }
    return l;
  }
  parseAnd(): Expr {
    let l = this.parseCmp();
    while (this.isOp("&&")) {
      this.p++;
      l = { k: "bin", op: "&&", l, r: this.parseCmp() };
    }
    return l;
  }
  parseCmp(): Expr {
    let l = this.parseAdd();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.v)) {
        this.p++;
        l = { k: "bin", op: t.v, l, r: this.parseAdd() };
      } else if (t?.t === "id" && t.v === "in") {
        this.p++;
        l = { k: "bin", op: "in", l, r: this.parseAdd() };
      } else if (t?.t === "id" && t.v === "is") {
        this.p++;
        l = { k: "is", e: l, type: this.expectId() };
      } else return l;
    }
  }
  parseAdd(): Expr {
    let l = this.parseMul();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.next() as { v: string }).v;
      l = { k: "bin", op, l, r: this.parseMul() };
    }
    return l;
  }
  parseMul(): Expr {
    let l = this.parseUnary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = (this.next() as { v: string }).v;
      l = { k: "bin", op, l, r: this.parseUnary() };
    }
    return l;
  }
  parseUnary(): Expr {
    if (this.isOp("!") || this.isOp("-")) {
      const op = (this.next() as { v: string }).v;
      return { k: "unary", op, e: this.parseUnary() };
    }
    return this.parsePostfix();
  }
  parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      if (this.isOp(".")) {
        this.p++;
        e = { k: "member", obj: e, name: this.expectId() };
      } else if (this.isOp("[")) {
        this.p++;
        const idx = this.parseExpr();
        this.expectOp("]");
        e = { k: "index", obj: e, idx };
      } else if (this.isOp("(")) {
        this.p++;
        const args: Expr[] = [];
        while (!this.isOp(")")) {
          args.push(this.parseExpr());
          if (this.isOp(",")) this.p++;
        }
        this.expectOp(")");
        e = { k: "call", callee: e, args };
      } else return e;
    }
  }
  parsePrimary(): Expr {
    const t = this.next();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.t === "num") return { k: "lit", v: t.v };
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "path") return { k: "path", parts: t.parts };
    if (t.t === "id") {
      if (t.v === "true") return { k: "lit", v: true };
      if (t.v === "false") return { k: "lit", v: false };
      if (t.v === "null") return { k: "lit", v: null };
      return { k: "id", name: t.v };
    }
    if (t.v === "(") {
      const e = this.parseExpr();
      this.expectOp(")");
      return e;
    }
    if (t.v === "[") {
      const items: Expr[] = [];
      while (!this.isOp("]")) {
        items.push(this.parseExpr());
        if (this.isOp(",")) this.p++;
      }
      this.expectOp("]");
      return { k: "list", items };
    }
    if (t.v === "{") {
      const entries: Array<[string, Expr]> = [];
      while (!this.isOp("}")) {
        const key = this.next() as { v: string };
        this.expectOp(":");
        entries.push([key.v, this.parseExpr()]);
        if (this.isOp(",")) this.p++;
      }
      this.expectOp("}");
      return { k: "map", entries };
    }
    throw new Error(`Unexpected token ${JSON.stringify(t)}`);
  }
}

// ----------------------------------------------------------------------------
// File-level parse (service / match / function / allow)
// ----------------------------------------------------------------------------
export interface ParsedRules {
  root: MatchNode;
  fns: Map<string, FnDef>;
}

function readMatchPattern(src: string, from: number): { pattern: string[]; end: number } {
  // Reads "/a/{b}/c" up to the '{' that opens the block.
  let i = from;
  while (/\s/.test(src[i]!)) i++;
  let raw = "";
  while (i < src.length) {
    if (src[i] === "{") {
      const close = src.indexOf("}", i);
      const inner = src.slice(i + 1, close);
      if (/^[A-Za-z_][A-Za-z0-9_]*(=\*\*)?$/.test(inner) && /\/$/.test(raw)) {
        raw += `{${inner}}`;
        i = close + 1;
        continue;
      }
      break; // block start
    }
    raw += src[i];
    i++;
  }
  return { pattern: raw.trim().split("/").filter(Boolean), end: i };
}

export function parseRules(src: string): ParsedRules {
  const fns = new Map<string, FnDef>();
  // We need a char-level pass for match headers and a token-level pass for the rest, so we
  // split the file into "statements" manually by tracking brace depth.
  let i = 0;

  const skipWs = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i]!)) i++;
      if (src.startsWith("//", i)) {
        while (i < src.length && src[i] !== "\n") i++;
      } else break;
    }
  };

  const readBlockText = (): string => {
    // assumes src[i] === '{'; returns inner text and moves past '}'
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "'" || c === '"') {
        const q = c;
        i++;
        while (src[i] !== q) {
          if (src[i] === "\\") i++;
          i++;
        }
      } else if (c === "/" && src[i + 1] === "/") {
        while (i < src.length && src[i] !== "\n") i++;
      } else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          i++;
          return src.slice(start + 1, i - 1);
        }
      }
    }
    throw new Error("Unbalanced braces");
  };

  const parseItems = (text: string, node: MatchNode) => {
    const save = { src: src, i };
    void save;
    let j = 0;
    const ws = () => {
      for (;;) {
        while (j < text.length && /\s/.test(text[j]!)) j++;
        if (text.startsWith("//", j)) {
          while (j < text.length && text[j] !== "\n") j++;
        } else break;
      }
    };
    const block = (): string => {
      let depth = 0;
      const start = j;
      for (; j < text.length; j++) {
        const c = text[j];
        if (c === "'" || c === '"') {
          const q = c;
          j++;
          while (text[j] !== q) {
            if (text[j] === "\\") j++;
            j++;
          }
        } else if (c === "/" && text[j + 1] === "/") {
          while (j < text.length && text[j] !== "\n") j++;
        } else if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            j++;
            return text.slice(start + 1, j - 1);
          }
        }
      }
      throw new Error("Unbalanced braces in block");
    };
    for (;;) {
      ws();
      if (j >= text.length) return;
      if (text.startsWith("match", j) && /\s/.test(text[j + 5]!)) {
        const { pattern, end } = readMatchPattern(text, j + 5);
        j = end;
        const child: MatchNode = { pattern, children: [], allows: [] };
        const inner = block();
        parseItems(inner, child);
        node.children.push(child);
      } else if (text.startsWith("function", j) && /\s/.test(text[j + 8]!)) {
        j += 8;
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*/.exec(text.slice(j))!;
        j += m[0].length;
        const body = block();
        const toks = tokenize(body);
        const parser = new Parser(toks);
        const lets: Array<[string, Expr]> = [];
        while (parser.isId("let")) {
          parser.p++;
          const name = parser.expectId();
          parser.expectOp("=");
          lets.push([name, parser.parseExpr()]);
          parser.expectOp(";");
        }
        parser.expectId("return");
        const ret = parser.parseExpr();
        if (parser.isOp(";")) parser.p++;
        fns.set(m[1]!, {
          params: m[2]!
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          lets,
          ret,
        });
      } else if (text.startsWith("allow", j)) {
        const semi = (() => {
          // find terminating ';' outside strings
          let k = j;
          for (; k < text.length; k++) {
            const c = text[k];
            if (c === "'" || c === '"') {
              const q = c;
              k++;
              while (text[k] !== q) k++;
            } else if (c === "/" && text[k + 1] === "/") {
              while (k < text.length && text[k] !== "\n") k++;
            } else if (c === ";") return k;
          }
          throw new Error("allow without ;");
        })();
        const stmt = text.slice(j + 5, semi);
        j = semi + 1;
        const idx = stmt.search(/:\s*if\b/);
        const opsText = idx === -1 ? stmt : stmt.slice(0, idx);
        const ops = opsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const cond =
          idx === -1
            ? null
            : new Parser(tokenize(stmt.slice(idx).replace(/^:\s*if\b/, ""))).parseExpr();
        node.allows.push({ ops, cond });
      } else if (text.startsWith("service", j) || text.startsWith("rules_version", j)) {
        // handled by caller
        throw new Error(`Unexpected top-level keyword inside block near: ${text.slice(j, j + 30)}`);
      } else {
        throw new Error(`Cannot parse near: ${text.slice(j, j + 40)}`);
      }
    }
  };

  skipWs();
  // rules_version = '2';
  const rv = /^rules_version\s*=\s*'[^']*'\s*;/.exec(src.slice(i));
  if (rv) i += rv[0].length;
  skipWs();
  const svc = /^service\s+cloud\.firestore\s*/.exec(src.slice(i));
  if (!svc) throw new Error("Expected `service cloud.firestore`");
  i += svc[0].length;
  const root: MatchNode = { pattern: [], children: [], allows: [] };
  const inner = readBlockText();
  parseItems(inner, root);
  return { root, fns };
}

// ----------------------------------------------------------------------------
// Evaluation
// ----------------------------------------------------------------------------
export interface Actor {
  uid: string;
  token?: Record<string, Json>;
}
export interface RequestCtx {
  op: "get" | "list" | "create" | "update" | "delete";
  path: string; // e.g. "users/u1"
  actor: Actor | null;
  before?: Doc | undefined; // existing resource.data
  after?: Doc | undefined; // request.resource.data
  query?: { limit?: number } | undefined; // request.query for list operations
  db: Map<string, Doc>; // seeded documents, keyed by "users/u1"
}

const isMap = (v: Json): v is Doc =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  !(v instanceof RSet) &&
  !(v instanceof MapDiff);

function deepEq(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  if (isMap(a) && isMap(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && deepEq(a[k], b[k]));
  }
  return false;
}

function toSet(v: Json): Set<string> {
  if (v instanceof RSet) return v.items;
  if (Array.isArray(v)) return new Set(v.map(String));
  throw new RuleError("expected list or set");
}

function callMethod(obj: Json, name: string, args: Json[]): Json {
  if (obj instanceof RSet) {
    const other = () => toSet(args[0]);
    if (name === "hasAll") return [...other()].every((k) => obj.items.has(k));
    if (name === "hasOnly") return [...obj.items].every((k) => other().has(k));
    if (name === "hasAny") return [...other()].some((k) => obj.items.has(k));
    if (name === "size") return obj.items.size;
  }
  if (obj instanceof MapDiff) {
    if (name === "affectedKeys") return new RSet(obj.keys);
  }
  if (Array.isArray(obj)) {
    if (name === "size") return obj.length;
    if (name === "hasAll") return [...toSet(args[0])].every((k) => obj.map(String).includes(k));
    if (name === "hasAny") return [...toSet(args[0])].some((k) => obj.map(String).includes(k));
    if (name === "hasOnly") return obj.every((k) => toSet(args[0]).has(String(k)));
  }
  if (typeof obj === "string") {
    if (name === "size") return obj.length;
    if (name === "lower") return obj.toLowerCase();
    if (name === "upper") return obj.toUpperCase();
  }
  if (isMap(obj)) {
    if (name === "get") return (args[0] as string) in obj ? obj[args[0] as string] : args[1];
    if (name === "keys") return new RSet(new Set(Object.keys(obj)));
    if (name === "size") return Object.keys(obj).length;
    if (name === "diff") {
      const other = args[0];
      if (!isMap(other)) throw new RuleError("diff() needs a map");
      const keys = new Set<string>();
      for (const k of new Set([...Object.keys(obj), ...Object.keys(other)])) {
        if (!(k in obj) || !(k in other) || !deepEq(obj[k], other[k])) keys.add(k);
      }
      return new MapDiff(keys);
    }
  }
  throw new RuleError(`unknown method ${name}`);
}

type Scope = Map<string, Json>;

class Evaluator {
  constructor(
    private readonly parsed: ParsedRules,
    private readonly ctx: RequestCtx,
  ) {}

  private pathToKey(p: string): string {
    return p.replace(/^\/databases\/[^/]+\/documents\//, "");
  }

  eval(e: Expr, scope: Scope): Json {
    switch (e.k) {
      case "lit":
        return e.v;
      case "id": {
        if (scope.has(e.name)) return scope.get(e.name) as Json;
        if (e.name === "request") return this.requestObj();
        if (e.name === "resource") {
          if (this.ctx.before === undefined) throw new RuleError("resource is null");
          return { data: this.ctx.before, id: this.ctx.path.split("/").pop() };
        }
        if (e.name === "database") return "(default)";
        throw new RuleError(`unknown identifier ${e.name}`);
      }
      case "path":
        return e.parts.map((p) => ("lit" in p ? p.lit : String(this.eval(p.expr, scope)))).join("");
      case "list":
        return e.items.map((x) => this.eval(x, scope));
      case "map":
        return Object.fromEntries(e.entries.map(([k, v]) => [k, this.eval(v, scope)]));
      case "member": {
        const o = this.eval(e.obj, scope);
        if (isMap(o) && e.name in o) return o[e.name];
        throw new RuleError(`missing attribute ${e.name}`);
      }
      case "index": {
        const o = this.eval(e.obj, scope);
        const k = this.eval(e.idx, scope);
        if (isMap(o) && typeof k === "string" && k in o) return o[k];
        if (Array.isArray(o) && typeof k === "number" && k in o) return o[k];
        throw new RuleError("bad index");
      }
      case "call":
        return this.call(e, scope);
      case "unary": {
        const v = this.eval(e.e, scope);
        if (e.op === "!") {
          if (typeof v !== "boolean") throw new RuleError("! needs bool");
          return !v;
        }
        if (typeof v !== "number") throw new RuleError("- needs number");
        return -v;
      }
      case "is": {
        const v = this.eval(e.e, scope);
        switch (e.type) {
          case "string":
            return typeof v === "string";
          case "number":
            return typeof v === "number";
          case "bool":
            return typeof v === "boolean";
          case "list":
            return Array.isArray(v);
          case "map":
            return isMap(v);
          case "null":
            return v === null;
          default:
            throw new RuleError(`unsupported type ${e.type}`);
        }
      }
      case "bin":
        return this.bin(e, scope);
    }
  }

  private tryEval(e: Expr, scope: Scope): { ok: true; v: Json } | { ok: false } {
    try {
      return { ok: true, v: this.eval(e, scope) };
    } catch (err) {
      if (err instanceof RuleError) return { ok: false };
      throw err;
    }
  }

  private bin(e: Extract<Expr, { k: "bin" }>, scope: Scope): Json {
    if (e.op === "&&" || e.op === "||") {
      const l = this.tryEval(e.l, scope);
      const r = () => this.tryEval(e.r, scope);
      const isOr = e.op === "||";
      const short = isOr; // value that short-circuits: true for ||, false for &&
      if (l.ok) {
        if (typeof l.v !== "boolean") throw new RuleError("logical operand must be bool");
        if (l.v === short) return short;
        const rr = r();
        if (!rr.ok) throw new RuleError("right operand errored");
        if (typeof rr.v !== "boolean") throw new RuleError("logical operand must be bool");
        return rr.v;
      }
      const rr = r();
      if (rr.ok && rr.v === short) return short; // error || true == true ; error && false == false
      throw new RuleError("operand errored");
    }
    const l = this.eval(e.l, scope);
    const r = this.eval(e.r, scope);
    switch (e.op) {
      case "==":
        return deepEq(l, r);
      case "!=":
        return !deepEq(l, r);
      case "in":
        if (Array.isArray(r)) return r.some((x) => deepEq(x, l));
        if (r instanceof RSet) return typeof l === "string" && r.items.has(l);
        if (isMap(r)) return typeof l === "string" && l in r;
        throw new RuleError("in needs list/set/map");
      case "<":
      case "<=":
      case ">":
      case ">=": {
        if (!(
          (typeof l === "number" && typeof r === "number") ||
          (typeof l === "string" && typeof r === "string")
        )) {
          throw new RuleError("comparison type mismatch");
        }
        return e.op === "<" ? l < r : e.op === "<=" ? l <= r : e.op === ">" ? l > r : l >= r;
      }
      case "+":
        if (typeof l === "number" && typeof r === "number") return l + r;
        if (typeof l === "string" && typeof r === "string") return l + r;
        throw new RuleError("+ type mismatch");
      default:
        if (typeof l === "number" && typeof r === "number") {
          if (e.op === "-") return l - r;
          if (e.op === "*") return l * r;
          if (e.op === "/") return l / r;
          if (e.op === "%") return l % r;
        }
        throw new RuleError("arithmetic type mismatch");
    }
  }

  private call(e: Extract<Expr, { k: "call" }>, scope: Scope): Json {
    const args = () => e.args.map((a) => this.eval(a, scope));
    if (e.callee.k === "id") {
      const name = e.callee.name;
      if (name === "exists") return this.ctx.db.has(this.pathToKey(String(args()[0])));
      if (name === "get") {
        const key = this.pathToKey(String(args()[0]));
        const doc = this.ctx.db.get(key);
        if (!doc) throw new RuleError("get() on missing document");
        return { data: doc, id: key.split("/").pop() };
      }
      const fn = this.parsed.fns.get(name);
      if (!fn) throw new RuleError(`unknown function ${name}`);
      const argv = args();
      const inner: Scope = new Map(scope);
      fn.params.forEach((p, i) => inner.set(p, argv[i] as Json));
      for (const [n, ex] of fn.lets) inner.set(n, this.eval(ex, inner));
      return this.eval(fn.ret, inner);
    }
    if (e.callee.k === "member") {
      const obj = this.eval(e.callee.obj, scope);
      return callMethod(obj, e.callee.name, args());
    }
    throw new RuleError("bad call");
  }

  private requestObj(): Json {
    const a = this.ctx.actor;
    const req: Doc = {
      auth: a ? { uid: a.uid, token: { ...(a.token ?? {}) } } : null,
      method: this.ctx.op,
      path: this.ctx.path,
    };
    if (this.ctx.after !== undefined) req["resource"] = { data: this.ctx.after };
    if (this.ctx.query !== undefined) req["query"] = { ...this.ctx.query };
    return req;
  }
}

function matchNode(
  node: MatchNode,
  remaining: string[],
  vars: Map<string, Json>,
  out: Array<{ allows: AllowDef[]; vars: Map<string, Json> }>,
) {
  for (const child of node.children) {
    const v = new Map(vars);
    let rest = remaining;
    let ok = true;
    for (let idx = 0; idx < child.pattern.length; idx++) {
      const seg = child.pattern[idx]!;
      const wild = /^\{([A-Za-z_][A-Za-z0-9_]*)(=\*\*)?\}$/.exec(seg);
      if (wild && wild[2]) {
        v.set(wild[1]!, rest.join("/"));
        rest = [];
        break;
      }
      const cur = rest[0];
      if (cur === undefined) {
        ok = false;
        break;
      }
      if (wild) v.set(wild[1]!, cur);
      else if (seg !== cur && !(seg === "documents" && cur === "documents")) {
        ok = false;
        break;
      }
      rest = rest.slice(1);
    }
    if (!ok) continue;
    if (rest.length === 0) out.push({ allows: child.allows, vars: v });
    matchNode(child, rest, v, out);
  }
}

export interface Decision {
  allowed: boolean;
  matchedRules: number;
}

export function evaluate(parsed: ParsedRules, ctx: RequestCtx): Decision {
  const segs = ["databases", "(default)", "documents", ...ctx.path.split("/")];
  const matches: Array<{ allows: AllowDef[]; vars: Map<string, Json> }> = [];
  matchNode(parsed.root, segs, new Map(), matches);

  const opsFor = (op: RequestCtx["op"]) =>
    op === "get" || op === "list" ? ["read", op] : ["write", op];
  const wanted = opsFor(ctx.op);

  let allowed = false;
  let matched = 0;
  for (const m of matches) {
    for (const allow of m.allows) {
      if (!allow.ops.some((o) => wanted.includes(o))) continue;
      matched++;
      const ev = new Evaluator(parsed, ctx);
      try {
        const scope: Scope = new Map(m.vars);
        const res = allow.cond ? ev.eval(allow.cond, scope) : true;
        if (res === true) allowed = true;
      } catch (err) {
        if (!(err instanceof RuleError)) throw err; // evaluation error => this rule denies
      }
    }
  }
  return { allowed, matchedRules: matched };
}
