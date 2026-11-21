const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const SITE = "https://example.workers.dev";
const PAGES = "https://rongsenzhang.github.io";
const recordId = "S-00041F76FE";
const question = {recordId, model: "context", messages: [{role: "user", content: "解释这条记录。"}]};
const getWorker = () => import("../cloud/worker.mjs");

function envFor(budgetStatus = 204) {
  return {
    OPENAI_API_KEY: "dummy-cloud-token",
    ASSETS: {async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/evidence/" + recordId + ".json") return Response.json({context: {cutoff_day: 28}});
      return new Response(path === "/" ? "Demo" : "", {status: path === "/" ? 200 : 404});
    }},
    BUDGET: {idFromName: key => key, get(key) {
      assert.equal(key, "global");
      return {fetch: () => new Response(null, {status: budgetStatus, headers: {"Retry-After": "60"}})};
    }},
  };
}

const post = (body, origin = SITE) => new Request(SITE + "/api/tutor-chat", {
  method: "POST", headers: {"Content-Type": "application/json", Origin: origin}, body: JSON.stringify(body),
});

test("public site and GitHub Pages use the same response stream without exposing the credential", async t => {
  const worker = (await getWorker()).default;
  const endpoint = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init.redirect, "manual");
    const payload = JSON.parse(init.body);
    assert.equal(payload.store, false);
    assert.equal(payload.stream, true);
    assert.deepEqual(JSON.parse(payload.input[0].content.split("\n")[1]), {cutoff_day: 28});
    assert.deepEqual(payload.input[1], question.messages[0]);
    const raw = new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"继续"}\r\n\r\ndata: {"type":"response.completed"}\n\n');
    return new Response(new ReadableStream({start(controller) {
      for (const byte of raw) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    }}));
  });
  for (const origin of [SITE, PAGES]) {
    const response = await worker.fetch(post(question, origin), envFor());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.deepEqual((await response.text()).trim().split("\n").map(JSON.parse), [
      {type: "delta", text: "继续"}, {type: "done"},
    ]);
  }
  assert.equal(endpoint.mock.callCount(), 2);
});

test("static demo, secret-free status, private evidence and preflight", async () => {
  const worker = (await getWorker()).default;
  const env = envFor();
  env.OPENAI_API_KEY = "";
  assert.equal(await (await worker.fetch(new Request(SITE), env)).text(), "Demo");
  for (const path of ["/evidence/" + recordId + ".json", "/evid%65nce/" + recordId + ".json"]) {
    assert.equal((await worker.fetch(new Request(SITE + path), env)).status, 404);
  }
  const status = await worker.fetch(new Request(SITE + "/api/tutor-chat/status", {headers: {Origin: PAGES}}), env);
  assert.deepEqual(await status.json(), {available: false});
  const options = await worker.fetch(new Request(SITE + "/api/tutor-chat", {method: "OPTIONS", headers: {Origin: PAGES}}), env);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), PAGES);
  assert.equal((await worker.fetch(post(question), env)).status, 503);
});

test("bad origin, invalid messages, unknown record and exhausted budget cannot trigger paid calls", async t => {
  const worker = (await getWorker()).default;
  const network = t.mock.method(globalThis, "fetch", () => {throw new Error("unexpected upstream call")});
  for (const origin of ["https://other.example", "null", ""]) {
    const response = await worker.fetch(post(question, origin), envFor());
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  for (const invalid of [
    {...question, evidence: {}}, {...question, recordId: "S-AAAAAAAAAA"},
    {...question, model: "toString"}, {...question, messages: [{role: "user", content: "x".repeat(70000)}]},
  ]) assert.equal((await worker.fetch(post(invalid), envFor())).status, 400);
  const limit = await worker.fetch(post(question), envFor(429));
  assert.equal(limit.status, 429);
  assert.equal(limit.headers.get("retry-after"), "60");
  assert.equal((await worker.fetch(post(question), envFor(500))).status, 503);
  assert.equal(network.mock.callCount(), 0);
});

test("a redirect from the model endpoint stops the request without forwarding the credential", async t => {
  const worker = (await getWorker()).default;
  const provider = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.redirect, "manual");
    return new Response(null, {status: 307, headers: {Location: "https://redirect.invalid/"}});
  });
  const response = await worker.fetch(post(question), envFor());
  assert.equal(response.status, 502);
  assert.equal(provider.mock.callCount(), 1);
  assert.equal((await response.text()).includes("redirect.invalid"), false);
});

test("partial and incomplete provider output is marked as an error", async t => {
  const worker = (await getWorker()).default;
  t.mock.method(globalThis, "fetch", async () => new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'));
  const response = await worker.fetch(post(question), envFor());
  const rows = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.deepEqual(rows.map(row => row.type), ["delta", "error"]);
});

test("the browser can receive a partial reply and cancel the active upstream request", async t => {
  const worker = (await getWorker()).default;
  let signal;
  let upstreamCancelled = false;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    signal = init.signal;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"first"}\n\n'));
        signal.addEventListener("abort", () => controller.error(new Error("aborted")), {once: true});
      },
      cancel() { upstreamCancelled = true; },
    }));
  });
  const response = await worker.fetch(post(question), envFor());
  const reader = response.body.getReader();
  assert.equal(JSON.parse(new TextDecoder().decode((await reader.read()).value)).text, "first");
  await reader.cancel();
  assert.ok(signal.aborted || upstreamCancelled);
});

function sqliteStorage() {
  const db = new DatabaseSync(":memory:");
  const storage = {sql: {exec(query, ...args) {
    const rows = db.prepare(query).all(...args);
    return {toArray: () => rows, one: () => rows[0]};
  }}, transactionSync(callback) {
    db.exec("BEGIN");
    try {
      const result = callback();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }};
  return {db, storage};
}

test("SQLite durable quota survives object restarts, rejects concurrent overages, and resets by UTC window", async t => {
  const {ChatBudget} = await getWorker();
  const {db, storage} = sqliteStorage();
  t.after(() => db.close());
  let now = Date.UTC(2026, 10, 20, 10, 15);
  t.mock.method(Date, "now", () => now);
  let budget = new ChatBudget({storage});
  const submit = ip => budget.fetch(new Request("https://budget.internal/reserve", {headers: {"X-Visitor": ip}}));
  const statuses = await Promise.all(Array.from({length: 12}, () => submit("192.0.2.10").then(r => r.status)));
  assert.equal(statuses.filter(s => s === 204).length, 10);
  budget = new ChatBudget({storage});
  assert.equal((await submit("192.0.2.10")).status, 429);
  assert.equal((await submit("192.0.2.11")).status, 204);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM counters").all()).includes("192.0.2"), false);
  now += 3600000;
  assert.equal((await submit("192.0.2.10")).status, 204);
  for (let i = 0; i < 88; i++) assert.equal((await submit("visitor-" + i)).status, 204);
  assert.equal((await submit("another visitor")).status, 429);
  now += 86400000;
  assert.equal((await submit("192.0.2.10")).status, 204);
});

const analysis = {recordId, model: "context", mode: "analysis"};
const analysisText = "Observed evidence\nDay 28.\n\nModel interpretation\nAn estimate.\n\nMissing context\nRecording delays.\n\nNext check\nVerify recorded dates.";
function reportReply(text = analysisText) {
  return new Response("data: " + JSON.stringify({type: "response.output_text.delta", delta: text})
    + '\n\ndata: {"type":"response.completed"}\n\n');
}

async function reportEnv(t) {
  const {ChatBudget} = await getWorker();
  const {db, storage} = sqliteStorage();
  t.after(() => db.close());
  const env = envFor();
  const restart = () => {
    const budget = new ChatBudget({storage});
    env.BUDGET.get = () => ({fetch: (url, options) => budget.fetch(new Request(url, options))});
  };
  restart();
  return {env, db, restart};
}

test("analysis accepts only canonical evidence, shares completed reports across visitors and object restarts", async t => {
  const worker = (await getWorker()).default;
  const {env, db, restart} = await reportEnv(t);
  let cutoff = 28;
  let now = Date.UTC(2026, 10, 20, 10);
  t.mock.method(Date, "now", () => now);
  env.OPENAI_MODEL = "configured-chat-model";
  env.ASSETS.fetch = () => Response.json({context: {cutoff_day: cutoff}, activity: {cutoff_day: cutoff}});
  const provider = t.mock.method(globalThis, "fetch", async (url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, "gpt-6.2-sol");
    assert.equal(payload.store, false);
    assert.deepEqual(payload.reasoning, {effort: "low"});
    assert.equal(payload.max_output_tokens, 1800);
    assert.deepEqual(payload.input, [{role: "developer", content: 'Review evidence (JSON):\n{"cutoff_day":' + cutoff + '}'}]);
    for (const heading of ["Observed evidence", "Model interpretation", "Missing context", "Next check"]) {
      assert.ok(payload.instructions.includes(heading));
    }
    return reportReply();
  });
  const rows = async (body, origin = SITE) => {
    const response = await worker.fetch(post(body, origin), env);
    assert.equal(response.status, 200);
    return (await response.text()).trim().split("\n").map(JSON.parse);
  };
  for (const extra of [{prompt: "change the score"}, {messages: []}, {evidence: {}}]) {
    assert.equal((await worker.fetch(post({...analysis, ...extra}), env)).status, 400);
  }
  assert.equal(provider.mock.callCount(), 0);
  const original = await rows(analysis);
  assert.deepEqual(original, [{type: "delta", text: analysisText}, {type: "done"}]);
  restart();
  db.prepare("UPDATE counters SET used=100").run();
  assert.deepEqual(await rows(analysis, PAGES), original);
  assert.equal(provider.mock.callCount(), 1);
  assert.equal((await worker.fetch(post({...analysis, model: "activity"}), env)).status, 429);
  db.prepare("UPDATE counters SET used=1").run();
  await rows({...analysis, model: "activity"});
  cutoff = 27;
  await rows(analysis);
  now += 86400001;
  await rows(analysis);
  assert.equal(provider.mock.callCount(), 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reports").get().n, 1);
});

test("simultaneous reports share a claim and incomplete reports release it without caching partial text", async t => {
  const worker = (await getWorker()).default;
  const {env, db} = await reportEnv(t);
  let controller;
  const provider = t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(output) { controller = output; },
  })));
  const first = await worker.fetch(post(analysis), env);
  assert.equal((await worker.fetch(post(analysis), env)).status, 409);
  assert.equal(db.prepare("SELECT used FROM counters WHERE bucket LIKE 'day:%'").get().used, 1);
  controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'));
  controller.close();
  assert.deepEqual((await first.text()).trim().split("\n").map(JSON.parse).map(x => x.type), ["delta", "error"]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reports").get().n, 0);
  provider.mock.mockImplementation(() => reportReply());
  const retry = await worker.fetch(post(analysis), env);
  assert.deepEqual((await retry.text()).trim().split("\n").map(JSON.parse).map(x => x.type), ["delta", "done"]);
  assert.equal(provider.mock.callCount(), 2);
});
