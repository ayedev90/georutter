const requestGuide = "https://github.com/ayedev90/georutter/issues/new?title=Request%20a%20source%20guide";
const trackedPath = /^\/v1\/(?:index\.json|topics\.json|countries\/[a-z0-9-]+\.json|[a-z0-9-]+\/[a-z0-9-]+(?:\/detail)?\.json)$/;
const guidePath = /^\/[a-z0-9-]+\/[a-z0-9-]{4,}\/$/;
const localizedPath = /^\/[a-z0-9-]+\/([a-z]{2,3})\/(?:([a-z0-9-]{4,})\/)?$/;
const knownClient = /\b(ChatGPT-User|Claude-User|Claude-Agent|OAI-SearchBot|Claude-SearchBot|GPTBot|ClaudeBot|Googlebot|Bingbot|Applebot|Perplexity-User|PerplexityBot)\b/i;
const encoder = new TextEncoder();

async function dailyClientId(request, secret) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip || !secret) return "";
  const day = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(day + "\n" + ip));
  return Array.from(new Uint8Array(signature).slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function recordRead(request, status, env) {
  if (request.method !== "GET" || status !== 200) return "skipped";

  const url = new URL(request.url);
  const userAgent = request.headers.get("User-Agent") ?? "";
  if (url.hostname !== "georutter.org"
      || userAgent.startsWith("GeoRutter-Deploy-Check")) return "skipped";

  const localized = url.pathname.match(localizedPath);
  const format = trackedPath.test(url.pathname) ? "json" : (localized || guidePath.test(url.pathname)) ? "html" : null;
  if (!format) return "skipped";

  if (!env.GEORUTTER_ANALYTICS) return "binding-missing";
  const client = userAgent === "GeoRutter-Metrics-Smoke"
    ? "smoke-test"
    : userAgent.match(knownClient)?.[1].toLowerCase() ?? "unknown";
  const detectedCountry = request.cf?.country;
  const country = typeof detectedCountry === "string" && /^[A-Z]{2}$/.test(detectedCountry)
    ? detectedCountry
    : "";
  let clientId = "";
  try {
    clientId = await dailyClientId(request, env.GEORUTTER_CLIENT_ID_SECRET);
  } catch {
    // Keep counting requests even if the pseudonym cannot be generated.
  }
  try {
    env.GEORUTTER_ANALYTICS.writeDataPoint({
      indexes: [url.pathname],
      blobs: [url.pathname, client, format, country, clientId,
        localized?.[1] ?? "en", localized && !localized[2] ? "index" : "record"],
    });
    return clientId ? "submitted-with-client-id" : "submitted";
  } catch {
    // Metrics must not interrupt API responses.
    return "write-failed";
  }
}

export default {
  async fetch(request, env, ctx) {
    const asset = await env.ASSETS.fetch(request);
    const path = new URL(request.url).pathname;
    if (asset.status !== 404 || !path.startsWith("/v1/")) {
      const analytics = recordRead(request, asset.status, env);
      if (request.headers.get("User-Agent") === "GeoRutter-Metrics-Smoke") {
        const response = new Response(asset.body, asset);
        response.headers.set("X-GeoRutter-Analytics", await analytics);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      ctx.waitUntil(analytics);
      return asset;
    }

    const body = JSON.stringify({
      status: "not_researched",
      path,
      parent_hint: "Territory codes are hierarchical. Remove the last segment to find a parent territory.",
      index: "/v1/index.json",
      topics: "/v1/topics.json",
      request_guide: requestGuide,
    });
    return new Response(request.method === "HEAD" ? null : body, {
      status: 404,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
