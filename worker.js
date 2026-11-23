/* EstimatePro — the small server part of the Cloudflare Worker. Everything else is static files (env.ASSETS).
   POST /api/wa-estimate : sends the signed-in user's own estimate (an .xlsx made in the browser) to the WhatsApp number in
   his own profile, through Vivid Relay, with a fixed message that names the estimate. Nothing is stored here.
   Settings (Cloudflare dashboard → Workers → estimatepro → Settings → Variables and Secrets):
     RELAY_KEY      (Secret)  an API key made in Vivid Relay → Developer → API keys
     RELAY_SESSION  (Text, optional)  the name of the number to send from; left out = the first connected number of that key
     RELAY_URL, SUPABASE_URL, SUPABASE_ANON come from wrangler.jsonc. */
const LABELS = { all: "पूरा एस्टीमेट", meas: "Measurement", an: "Analysis", abs: "Abstract", sum: "SOR & Non-SOR summary", gen: "General Abstract", boq: "BOQ" };
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (status, code, error) => json({ ok: false, code: code, error: error }, status);
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f\u007f*_~`]/g, " ").replace(/https?:\/\/\S+/gi, " ").replace(/\bwww\.\S+/gi, " ").replace(/\s+/g, " ").trim().slice(0, n);
const dec = (s) => { try { return decodeURIComponent(s || ""); } catch (e) { return ""; } };

async function relay(env, path, init) {
  const r = await fetch(env.RELAY_URL.replace(/\/+$/, "") + path, Object.assign({}, init, { headers: Object.assign({ authorization: "Bearer " + env.RELAY_KEY }, (init && init.headers) || {}) }));
  let b = null; try { b = await r.json(); } catch (e) { b = null; }
  return { status: r.status, body: b || {} };
}

/* not more than 20 files a day for one user (kept in the edge cache: a guard for the WhatsApp number, not an exact count) */
async function allowed(userId, ctx) {
  try {
    const day = new Date().toISOString().slice(0, 10), key = new Request("https://limit.estimatepro.internal/wa/" + userId + "/" + day), c = caches.default;
    const hit = await c.match(key), n = hit ? +(await hit.text()) || 0 : 0; if (n >= 20) return false;
    ctx.waitUntil(c.put(key, new Response(String(n + 1), { headers: { "cache-control": "max-age=86400" } }))); return true;
  } catch (e) { return true; }
}

async function waEstimate(request, env, ctx) {
  if (!env.RELAY_KEY || !env.RELAY_URL) return fail(503, "not_configured", "WhatsApp sending is not set up on the server yet.");
  const tok = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""); if (!tok) return fail(401, "unauthorized", "Sign in first.");
  const sb = { apikey: env.SUPABASE_ANON, authorization: "Bearer " + tok };
  const ur = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: sb }); if (!ur.ok) return fail(401, "unauthorized", "Sign in again.");
  const user = await ur.json(); if (!user || !user.id) return fail(401, "unauthorized", "Sign in again.");
  const pr = await fetch(env.SUPABASE_URL + "/rest/v1/profiles?select=phone&id=eq." + encodeURIComponent(user.id), { headers: sb });
  const rows = pr.ok ? await pr.json() : []; let phone = String((rows[0] && rows[0].phone) || "").replace(/\D/g, "");
  if (phone.length === 10) phone = "91" + phone; if (phone.length < 11 || phone.length > 15) return fail(422, "no_phone", "Your profile has no WhatsApp number.");
  const which = request.headers.get("x-which") || "all", label = LABELS[which]; if (!label) return fail(400, "bad_request", "Unknown export.");
  const name = clean(dec(request.headers.get("x-name")), 100) || "estimate";
  let fname = clean(dec(request.headers.get("x-file")), 90).replace(/[\\/:?"<>|]/g, " ").trim() || "estimate.xlsx"; if (!/\.xlsx$/i.test(fname)) fname += ".xlsx";
  const buf = await request.arrayBuffer(), head = new Uint8Array(buf.slice(0, 2));
  if (buf.byteLength < 200 || buf.byteLength > 8 * 1024 * 1024 || head[0] !== 0x50 || head[1] !== 0x4b) return fail(400, "bad_file", "That is not an Excel file made by EstimatePro, or it is larger than 8 MB.");
  if (!(await allowed(user.id, ctx))) return fail(429, "limit_reached", "Today's limit of WhatsApp sends is reached. Use the share button instead.");

  let session = env.RELAY_SESSION || "";
  if (!session) { const ss = await relay(env, "/api/sessions"); const list = (ss.body.sessions || []).filter((s) => s.status === "connected" && !s.paused); if (!list.length) return fail(503, "relay_down", "The WhatsApp number of EstimatePro is not connected right now."); session = list[0].name; }
  const fd = new FormData(); fd.append("file", new File([buf], fname, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const up = await relay(env, "/api/media", { method: "POST", body: fd }); const mid = up.body && up.body.media && up.body.media.id;
  if (!mid) return fail(502, "relay_upload", "The file could not be handed to WhatsApp (" + (up.body.code || up.status) + ").");
  const text = "✅ *EstimatePro*\n\nआपने एस्टीमेट *“" + name + "”* सफलतापूर्वक तैयार कर लिया है। " + label + " (Excel) इस संदेश के साथ है।\nYou have successfully generated the estimate *“" + name + "”*.\n\nअगले एस्टीमेट के लिए भी EstimatePro का इस्तेमाल करते रहिए 🙏\nKeep using EstimatePro for your next estimates: " + new URL(request.url).origin + "/app";
  const sent = await relay(env, "/api/sessions/" + encodeURIComponent(session) + "/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: phone, text: text, media: { type: "document", media_id: mid, filename: fname }, typing: false, preview: false }) });
  ctx.waitUntil(relay(env, "/api/media/" + mid, { method: "DELETE" }).catch(() => {}));   /* the copy in the Relay library is not kept */
  if (!sent.body.ok) return fail(sent.status === 429 ? 429 : 502, sent.body.code || "relay_send", "WhatsApp did not take the message (" + (sent.body.error || sent.body.code || sent.status) + ").");
  return json({ ok: true, to: "…" + phone.slice(-4) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/wa-estimate") {
      if (request.method === "GET") return json({ ok: true, configured: !!(env.RELAY_KEY && env.RELAY_URL) });
      if (request.method !== "POST") return fail(405, "method", "POST only.");
      try { return await waEstimate(request, env, ctx); } catch (e) { return fail(500, "server", "Something went wrong on the server."); }
    }
    if (url.pathname.startsWith("/api/")) return fail(404, "not_found", "No such endpoint.");
    return env.ASSETS.fetch(request);
  },
};
