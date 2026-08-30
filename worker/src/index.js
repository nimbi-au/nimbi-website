/**
 * Nimbi contact-form Worker.
 *
 * Receives an enquiry from the static site on GitHub Pages and sends it to the
 * firm via Cloudflare Email Service. Nothing is stored: the request is validated,
 * turned into an email, and forgotten.
 *
 * Bindings and vars are declared in wrangler.jsonc; TURNSTILE_SECRET is a secret
 * (`wrangler secret put TURNSTILE_SECRET`). If that secret is absent the Turnstile
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

    const text = [
      ...values.map(([l, v]) => `${l}: ${v}`),
      "",
      "---",
      ...meta.map(([l, v]) => `${l}: ${v}`),
    ].join("\n");

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
      await env.EMAIL.send({
        to: env.TO_ADDRESS,
        from: env.FROM_ADDRESS,
        replyTo,
        subject: `${cfg.subject} - ${oneLine(values[0][1]).slice(0, 80)}`,
        text,
        html,
      });
    } catch (err) {
      /* Logged for `wrangler tail`; the visitor gets a generic message. */
      console.error("email send failed", err && err.code, err && err.message);
      return json(502, { ok: false, error: "We could not send your enquiry just now." }, corsOrigin);
    }

    return json(200, { ok: true }, corsOrigin);
  },
};
