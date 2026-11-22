const requestGuide = "https://github.com/ayedev90/georutter/issues/new?title=Request%20a%20source%20guide";
const trackedPath = /^\/v1\/(?:index\.json|topics\.json|countries\/[a-z0-9-]+\.json|[a-z0-9-]+\/[a-z0-9-]+(?:\/detail)?\.json)$/;
const knownClient = /\b(ChatGPT-User|Claude-User|Claude-Agent|OAI-SearchBot|Claude-SearchBot|GPTBot|ClaudeBot|Googlebot|Bingbot|Applebot|Perplexity-User|PerplexityBot)\b/i;

function recordRead(request, response, dataset) {
  if (!dataset || request.method !== "GET" || response.status !== 200) return;

  const url = new URL(request.url);
  const userAgent = request.headers.get("User-Agent") ?? "";
  if (url.hostname !== "georutter.org" || !trackedPath.test(url.pathname)
      || userAgent.startsWith("GeoRutter-Deploy-Check")) return;

  const client = userAgent.match(knownClient)?.[1].toLowerCase() ?? "unknown";
  try {
    dataset.writeDataPoint({ indexes: [url.pathname], blobs: [url.pathname, client] });
  } catch {
    // Metrics must not interrupt API responses.
  }
}

export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      recordRead(request, asset, env.GEORUTTER_ANALYTICS);
      return asset;
    }

    const path = new URL(request.url).pathname;
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
