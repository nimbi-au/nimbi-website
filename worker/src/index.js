/**
 * Nimbi contact-form Worker.
 *
 * Receives an enquiry from the static site on GitHub Pages and sends it to the
 * firm through the Microsoft Graph API, using the firm's own Microsoft 365
 * tenant. Nothing is stored: the request is validated, turned into an email,
 * and forgotten.
 *
 * Vars are declared in wrangler.jsonc. Two secrets are set with
 * `wrangler secret put`: GRAPH_CLIENT_SECRET (required - the Entra app's client
 * secret) and TURNSTILE_SECRET. If TURNSTILE_SECRET is absent the Turnstile
 * check is skipped, so the form works before the keys are issued.
 */

/* Field definitions per form. These are authoritative — the browser copy is a
   convenience for the visitor, not something we trust. */
const FORMS = {
  h: {
    subject: "Call back request - Nimbi website (home)",
    fields: [
      ["name", "Name", 120],
      ["firm", "Firm", 160],
      ["sector", "Sector", 80],
      ["email", "Email", 200],
      ["phone", "Phone", 40],
      ["when", "When do you need help?", 80],
      ["msg", "What's on your mind?", 5000],
    ],
  },
  a: {
    subject: "Call back request - Nimbi website (about)",
    fields: [
      ["name", "Name", 120],
      ["firm", "Firm", 160],
      ["email", "Email", 200],
      ["phone", "Phone", 40],
      ["msg", "How can we help?", 5000],
    ],
  },
};

const MAX_BODY_BYTES = 32 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (status, body, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(origin) },
  });

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* Echo the origin back only when it is on the allowlist, so the browser refuses
   cross-site posts from anywhere else. */
function cors(origin) {
  const h = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin) h["access-control-allow-origin"] = origin;
  return h;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* Strip CR/LF so a submitted value can never inject an extra mail header. */
const oneLine = (s) => String(s).replace(/[\r\n]+/g, " ").trim();

/* Client-credentials token for Graph. Cached in isolate memory and refreshed a
   minute before expiry, so a burst of enquiries costs one token request. */
let graphToken = { value: null, expiresAt: 0 };

async function getGraphToken(env, force) {
  if (!force && graphToken.value && Date.now() < graphToken.expiresAt) return graphToken.value;

  const res = await fetch(
    `https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GRAPH_CLIENT_ID,
        client_secret: env.GRAPH_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`token request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  graphToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return graphToken.value;
}

/* One attempt at sendMail. Separate so a stale cached token can be retried. */
async function postSendMail(env, token, message) {
  return fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.SENDER_MAILBOX)}/sendMail`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: false }),
    },
  );
}

async function sendViaGraph(env, { replyTo, subject, html }) {
  const message = {
    subject,
    body: { contentType: "HTML", content: html },
    toRecipients: [{ emailAddress: { address: env.TO_ADDRESS } }],
    replyTo: [{ emailAddress: { address: replyTo } }],
  };

  let res = await postSendMail(env, await getGraphToken(env), message);
  /* A cached token can be revoked or rotated out from under us; one forced
     refresh distinguishes that from a real authorisation failure. */
  if (res.status === 401) {
    res = await postSendMail(env, await getGraphToken(env, true), message);
  }
  if (res.status !== 202) {
    throw new Error(`sendMail failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

async function verifyTurnstile(token, ip, secret) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({ success: false }));
  return data.success === true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const permitted = allowedOrigins(env);
    const originOk = permitted.length === 0 || permitted.includes(origin);
    const corsOrigin = originOk ? origin : "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: originOk ? 204 : 403, headers: cors(corsOrigin) });
    }
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed." }, corsOrigin);
    }
    if (!originOk) {
      return json(403, { ok: false, error: "Origin not allowed." }, corsOrigin);
    }

    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) {
      return json(413, { ok: false, error: "Submission too large." }, corsOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { ok: false, error: "Malformed request." }, corsOrigin);
    }

    const cfg = FORMS[body && body.form];
    if (!cfg) {
      return json(400, { ok: false, error: "Unknown form." }, corsOrigin);
    }

    /* Honeypot: a real visitor never sees this field, so anything in it is a bot.
       Answer 200 so the bot believes it succeeded and does not retry. */
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return json(200, { ok: true }, corsOrigin);
    }

    if (env.TURNSTILE_SECRET) {
      const token = typeof body.turnstile === "string" ? body.turnstile : "";
      if (!token) {
        return json(400, { ok: false, error: "Please complete the verification check." }, corsOrigin);
      }
      const ip = request.headers.get("CF-Connecting-IP");
      if (!(await verifyTurnstile(token, ip, env.TURNSTILE_SECRET))) {
        return json(403, { ok: false, error: "Verification failed. Please try again." }, corsOrigin);
      }
    }

    const values = [];
    for (const [key, label, max] of cfg.fields) {
      const raw = body[key];
      const val = typeof raw === "string" ? raw.trim() : "";
      if (!val) {
        return json(400, { ok: false, error: "Please complete every field." }, corsOrigin);
      }
      if (val.length > max) {
        return json(400, { ok: false, error: `${label} is too long.` }, corsOrigin);
      }
      if (key === "email" && !EMAIL_RE.test(val)) {
        return json(400, { ok: false, error: "Please enter a valid email address." }, corsOrigin);
      }
      values.push([label, val]);
    }

    const replyTo = values.find(([l]) => l === "Email")[1];
    const meta = [
      ["Received", new Date().toISOString()],
      ["From page", oneLine(body.page || "").slice(0, 200) || "unknown"],
      ["Country", request.cf && request.cf.country ? request.cf.country : "unknown"],
    ];

    const row = ([l, v]) =>
      `<tr><td style="padding:6px 14px 6px 0;vertical-align:top;color:#6b7280;white-space:nowrap">${escapeHtml(l)}</td>` +
      `<td style="padding:6px 0;vertical-align:top;color:#111827;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`;

    const html =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5">` +
      `<table style="border-collapse:collapse">${values.map(row).join("")}</table>` +
      `<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">` +
      `<table style="border-collapse:collapse;font-size:13px;color:#6b7280">${meta.map(row).join("")}</table>` +
      `</div>`;

    try {
      await sendViaGraph(env, {
        replyTo,
        subject: `${cfg.subject} - ${oneLine(values[0][1]).slice(0, 80)}`,
        html,
      });
    } catch (err) {
      /* Logged for `wrangler tail`; the visitor gets a generic message. */
      console.error("email send failed", err && err.message);
      return json(502, { ok: false, error: "We could not send your enquiry just now." }, corsOrigin);
    }

    return json(200, { ok: true }, corsOrigin);
  },
};
