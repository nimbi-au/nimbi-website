/**
 * Tests for the contact-form Worker. Node's built-in runner, no dependencies:
 *
 *   cd worker && npm test
 *
 * Every outbound call (Entra token, Graph sendMail, Turnstile siteverify) goes to
 * a fake `fetch`, so nothing leaves the machine and no email is ever sent.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const ORIGIN = "https://nimbi.com.au";

const BASE_ENV = {
  TO_ADDRESS: "to@example.com",
  SENDER_MAILBOX: "sender@example.com",
  GRAPH_TENANT_ID: "tenant",
  GRAPH_CLIENT_ID: "client",
  GRAPH_CLIENT_SECRET: "secret",
  ALLOWED_ORIGINS: "https://nimbi.com.au,https://nimbi-au.github.io",
  TURNSTILE_HOSTNAMES: "nimbi.com.au,nimbi-au.github.io",
};

const CONTACT = {
  form: "c",
  name: "Jane Citizen",
  firm: "Citizen & Co",
  sector: "Accountants",
  email: "jane@example.com",
  phone: "0400 000 000",
  when: "This month",
  msg: "We need a risk assessment.",
  page: "/contact/",
};

/* The Worker caches its Graph token at module level. A fresh import per test
   (the query string defeats the module cache) keeps tests independent. */
let n = 0;
async function loadWorker() {
  return (await import(`../src/index.js?t=${++n}`)).default;
}

/* Fake network. `routes` maps a URL prefix to a handler returning a Response;
   every call is recorded for assertions. */
let calls, routes, realFetch, realError;
beforeEach(() => {
  calls = [];
  routes = {
    "https://login.microsoftonline.com/": () =>
      Response.json({ access_token: "tok-" + calls.length, expires_in: 3600 }),
    "https://graph.microsoft.com/": () => new Response(null, { status: 202 }),
    "https://challenges.cloudflare.com/": () =>
      Response.json({ success: true, action: "contact_page", hostname: "nimbi.com.au" }),
  };
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const prefix = Object.keys(routes).find((p) => String(url).startsWith(p));
    if (!prefix) throw new Error("unexpected fetch " + url);
    return routes[prefix](url, init);
  };
  realError = console.error;
  console.error = () => {}; // the Worker logs failures for `wrangler tail`
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

function post(body, { origin = ORIGIN, headers = {} } = {}) {
  const h = { "content-type": "application/json", ...headers };
  if (origin) h.Origin = origin;
  return new Request("https://worker.example/", {
    method: "POST",
    headers: h,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function send(request, env = BASE_ENV) {
  const worker = await loadWorker();
  const res = await worker.fetch(request, env);
  const text = await res.text();
  return { res, status: res.status, body: text ? JSON.parse(text) : null };
}

const graphCalls = () => calls.filter((c) => c.url.startsWith("https://graph.microsoft.com/"));
const tokenCalls = () => calls.filter((c) => c.url.startsWith("https://login.microsoftonline.com/"));
const sentMessage = () => JSON.parse(graphCalls().at(-1).init.body).message;

/* ---------- happy path ---------- */

test("a valid enquiry is sent through Graph and returns ok", async () => {
  const { status, body, res } = await send(post(CONTACT));
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);

  assert.equal(graphCalls().length, 1);
  assert.equal(graphCalls()[0].url, "https://graph.microsoft.com/v1.0/users/sender%40example.com/sendMail");
  assert.match(graphCalls()[0].init.headers.authorization, /^Bearer tok-\d+$/);
  const msg = sentMessage();
  assert.deepEqual(msg.toRecipients, [{ emailAddress: { address: "to@example.com" } }]);
  assert.deepEqual(msg.replyTo, [{ emailAddress: { address: "jane@example.com" } }]);
  assert.equal(msg.subject, "Call back request - Nimbi website - Jane Citizen");
  assert.match(msg.body.content, /We need a risk assessment\./);
  assert.match(msg.body.content, /\/contact\//);
});

test("each form uses its own subject and fields", async () => {
  const about = { form: "a", name: "Sam", firm: "F", email: "s@example.com", phone: "1", msg: "Hi" };
  const { status } = await send(post(about));
  assert.equal(status, 200);
  assert.equal(sentMessage().subject, "Call back request - Nimbi website (about) - Sam");
  assert.match(sentMessage().body.content, /How can we help\?/);
});

test("the Graph token is reused across enquiries", async () => {
  const worker = await loadWorker();
  await worker.fetch(post(CONTACT), BASE_ENV);
  await worker.fetch(post(CONTACT), BASE_ENV);
  assert.equal(tokenCalls().length, 1);
  assert.equal(graphCalls().length, 2);
});

/* ---------- injection ---------- */

test("submitted text is HTML-escaped in the email", async () => {
  await send(post({ ...CONTACT, msg: `<script>alert("x")</script> & 'q'` }));
  const html = sentMessage().body.content;
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#39;q&#39;/);
});

test("line breaks cannot reach the subject", async () => {
  await send(post({ ...CONTACT, name: "Jane\r\nBcc: evil@example.com" }));
  assert.equal(sentMessage().subject, "Call back request - Nimbi website - Jane Bcc: evil@example.com");
  assert.doesNotMatch(sentMessage().subject, /[\r\n]/);
});

/* ---------- origin and method ---------- */

test("preflight from an allowed origin is answered with CORS headers", async () => {
  const req = new Request("https://worker.example/", { method: "OPTIONS", headers: { Origin: ORIGIN } });
  const { res } = await send(req);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(res.headers.get("access-control-allow-methods"), /POST/);
});

test("preflight from another origin is refused without CORS headers", async () => {
  const req = new Request("https://worker.example/", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  const { res } = await send(req);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("a post from another origin is refused and nothing is sent", async () => {
  const { status, res } = await send(post(CONTACT, { origin: "https://evil.example" }));
  assert.equal(status, 403);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.equal(calls.length, 0);
});

test("with no allowlist configured any origin may post", async () => {
  const { status } = await send(post(CONTACT, { origin: "https://anywhere.example" }), { ...BASE_ENV, ALLOWED_ORIGINS: "" });
  assert.equal(status, 200);
});

test("methods other than POST are rejected", async () => {
  const req = new Request("https://worker.example/", { method: "GET", headers: { Origin: ORIGIN } });
  const { status } = await send(req);
  assert.equal(status, 405);
});

/* ---------- malformed and oversized requests ---------- */

test("an oversized submission is rejected before it is read", async () => {
  const { status } = await send(post(CONTACT, { headers: { "content-length": String(33 * 1024) } }));
  assert.equal(status, 413);
  assert.equal(calls.length, 0);
});

test("a body that is not JSON is rejected", async () => {
  const { status, body } = await send(post("not json{"));
  assert.equal(status, 400);
  assert.equal(body.error, "Malformed request.");
});

test("an unknown form is rejected", async () => {
  for (const form of ["zz", undefined, "__proto__", "constructor"]) {
    const { status, body } = await send(post({ ...CONTACT, form }));
    assert.equal(status, 400, `form=${form}`);
    assert.equal(body.error, "Unknown form.");
  }
  assert.equal(calls.length, 0);
});

/* ---------- honeypot ---------- */

test("a filled honeypot looks successful but sends nothing", async () => {
  const { status, body } = await send(post({ ...CONTACT, website: "http://spam.example" }));
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(calls.length, 0);
});

test("a blank honeypot is ignored", async () => {
  const { status } = await send(post({ ...CONTACT, website: "   " }));
  assert.equal(status, 200);
  assert.equal(graphCalls().length, 1);
});

/* ---------- field validation ---------- */

test("a missing or blank field is rejected", async () => {
  for (const key of ["name", "firm", "sector", "email", "phone", "when", "msg"]) {
    const { status, body } = await send(post({ ...CONTACT, [key]: "  " }));
    assert.equal(status, 400, key);
    assert.equal(body.error, "Please complete every field.");
  }
  const { status } = await send(post({ ...CONTACT, name: 42 }));
  assert.equal(status, 400, "non-string value");
  assert.equal(graphCalls().length, 0);
});

test("an over-long field is rejected with its label", async () => {
  const { status, body } = await send(post({ ...CONTACT, firm: "x".repeat(161) }));
  assert.equal(status, 400);
  assert.equal(body.error, "Firm is too long.");
  const ok = await send(post({ ...CONTACT, firm: "x".repeat(160) }));
  assert.equal(ok.status, 200, "the limit itself is allowed");
});

test("an invalid email address is rejected", async () => {
  for (const email of ["jane", "jane@", "jane@example", "ja ne@example.com", "@example.com"]) {
    const { status, body } = await send(post({ ...CONTACT, email }));
    assert.equal(status, 400, email);
    assert.equal(body.error, "Please enter a valid email address.");
  }
  assert.equal(graphCalls().length, 0);
});

/* ---------- Turnstile ---------- */

const TS_ENV = { ...BASE_ENV, TURNSTILE_SECRET: "ts-secret" };

test("without a Turnstile secret the check is skipped", async () => {
  await send(post(CONTACT));
  assert.equal(calls.filter((c) => c.url.startsWith("https://challenges.cloudflare.com/")).length, 0);
});

test("with a Turnstile secret a token is required", async () => {
  const { status, body } = await send(post(CONTACT), TS_ENV);
  assert.equal(status, 400);
  assert.equal(body.error, "Please complete the verification check.");
  assert.equal(calls.length, 0);
});

test("a valid Turnstile token is verified and the enquiry sent", async () => {
  const { status } = await send(post({ ...CONTACT, turnstile: "tok" }, { headers: { "CF-Connecting-IP": "203.0.113.9" } }), TS_ENV);
  assert.equal(status, 200);
  const verify = calls.find((c) => c.url.startsWith("https://challenges.cloudflare.com/"));
  assert.equal(verify.init.body.get("secret"), "ts-secret");
  assert.equal(verify.init.body.get("response"), "tok");
  assert.equal(verify.init.body.get("remoteip"), "203.0.113.9");
  assert.equal(graphCalls().length, 1);
});

test("a Turnstile token is refused unless Cloudflare, the action and the hostname all agree", async () => {
  const cases = {
    "rejected by Cloudflare": { success: false },
    "solved on another form": { success: true, action: "contact_about", hostname: "nimbi.com.au" },
    "solved on another site": { success: true, action: "contact_page", hostname: "copy.example" },
    "unreadable response": "not json",
  };
  for (const [why, reply] of Object.entries(cases)) {
    routes["https://challenges.cloudflare.com/"] = () =>
      typeof reply === "string" ? new Response(reply) : Response.json(reply);
    const { status, body } = await send(post({ ...CONTACT, turnstile: "tok" }), TS_ENV);
    assert.equal(status, 403, why);
    assert.equal(body.error, "Verification failed. Please try again.");
  }
  assert.equal(graphCalls().length, 0);
});

test("Turnstile fails closed when no hostnames are configured", async () => {
  const { status } = await send(post({ ...CONTACT, turnstile: "tok" }), { ...TS_ENV, TURNSTILE_HOSTNAMES: "" });
  assert.equal(status, 403);
  assert.equal(graphCalls().length, 0);
});

/* ---------- Graph failures ---------- */

test("a revoked token is refreshed once and the send retried", async () => {
  let first = true;
  routes["https://graph.microsoft.com/"] = () => {
    const status = first ? 401 : 202;
    first = false;
    return new Response(null, { status });
  };
  const { status } = await send(post(CONTACT));
  assert.equal(status, 200);
  assert.equal(tokenCalls().length, 2);
  assert.equal(graphCalls().length, 2);
  assert.notEqual(graphCalls()[0].init.headers.authorization, graphCalls()[1].init.headers.authorization);
});

test("a persistent authorisation failure returns a generic 502", async () => {
  routes["https://graph.microsoft.com/"] = () => new Response("denied", { status: 401 });
  const { status, body } = await send(post(CONTACT));
  assert.equal(status, 502);
  assert.equal(body.error, "We could not send your enquiry just now.");
  assert.equal(graphCalls().length, 2, "retried once, not in a loop");
});

test("a failed token request returns a generic 502", async () => {
  routes["https://login.microsoftonline.com/"] = () => new Response("bad secret", { status: 400 });
  const { status, body } = await send(post(CONTACT));
  assert.equal(status, 502);
  assert.doesNotMatch(JSON.stringify(body), /bad secret/, "internal detail is not leaked");
  assert.equal(graphCalls().length, 0);
});

test("a Graph error other than 401 is not retried", async () => {
  routes["https://graph.microsoft.com/"] = () => new Response("throttled", { status: 429 });
  const { status } = await send(post(CONTACT));
  assert.equal(status, 502);
  assert.equal(graphCalls().length, 1);
});

/* ---------- serving the site (staging) ---------- */

/* Stand-in for the ASSETS binding: echoes the path it was asked for. */
const ASSETS = {
  fetch: async (req) => new Response("asset " + new URL(req.url).pathname, { headers: { "content-type": "text/html" } }),
};
const SITE_ENV = { ...BASE_ENV, ASSETS };
const STAGING_ENV = { ...SITE_ENV, NOINDEX: "true" };

const get = (path) => new Request("https://site.example" + path);

test("with ASSETS bound, pages are served from it", async () => {
  const worker = await loadWorker();
  const res = await worker.fetch(get("/about/"), SITE_ENV);
  assert.equal(await res.text(), "asset /about/");
  assert.equal(res.headers.get("x-robots-tag"), null);
  assert.equal(calls.length, 0);
});

test("with ASSETS bound, the home page is a page and not the form", async () => {
  const worker = await loadWorker();
  const res = await worker.fetch(get("/"), SITE_ENV);
  assert.equal(await res.text(), "asset /");
});

test("with ASSETS bound, enquiries are taken at /api/contact", async () => {
  const req = new Request("https://site.example/api/contact", post(CONTACT));
  const { status, body } = await send(req, SITE_ENV);
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(graphCalls().length, 1);
});

test("with ASSETS bound, a post to the root still sends, for pages built for the old address", async () => {
  const { status } = await send(post(CONTACT), SITE_ENV);
  assert.equal(status, 200);
  assert.equal(graphCalls().length, 1);
});

test("with ASSETS bound, a GET to /api/contact is rejected", async () => {
  const { status } = await send(new Request("https://site.example/api/contact", { headers: { Origin: ORIGIN } }), SITE_ENV);
  assert.equal(status, 405);
});

test("staging marks every page noindex", async () => {
  const worker = await loadWorker();
  const res = await worker.fetch(get("/pricing/"), STAGING_ENV);
  assert.equal(await res.text(), "asset /pricing/");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.equal(res.headers.get("content-type"), "text/html");
});

test("staging robots.txt disallows everything", async () => {
  const worker = await loadWorker();
  const res = await worker.fetch(get("/robots.txt"), STAGING_ENV);
  assert.equal(await res.text(), "User-agent: *\nDisallow: /\n");
});
