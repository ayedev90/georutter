const requestGuide = "https://github.com/ayedev90/georutter/issues/new?title=Request%20a%20source%20guide";

export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
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
