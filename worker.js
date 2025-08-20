// Cloudflare Worker: Secure proxy for ERLC API
// - Set a secret named SERVER_KEY containing your ERLC API key
// - Deploy, then point PROXY_BASE in script.js to this worker's URL
const BASE = "https://api.policeroleplay.community/v1/server";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // map / -> BASE, and pass through any subpaths like /players, /joinlogs, etc.
    const upstream = new URL(BASE + url.pathname);

    // Only allow GET to read endpoints and POST for /command
    const method = request.method.toUpperCase();
    if (!["GET", "POST", "OPTIONS"].includes(method)) {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // CORS
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(request),
      });
    }

    // Build headers with server key
    const headers = new Headers();
    headers.set("Server-Key", env.SERVER_KEY);
    headers.set("Content-Type", "application/json");

    let init = { method, headers };

    if (method === "POST") {
      const body = await request.text();
      init.body = body;
    }

    const resp = await fetch(upstream.toString(), init);

    // Pass through JSON
    const data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  },
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
