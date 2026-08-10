export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-seosiri-key",
        },
      });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "HEALTHY",
        service: "SEOSiri Biopharma MCP Edge Gateway",
        version: "1.0.0",
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const acceptHeader = request.headers.get("Accept") || "";
    if ((url.pathname === "/" || url.pathname === "") && acceptHeader.includes("text/html")) {
      return Response.redirect("https://www.seosiri.com/2026/08/biopharma-mcp.html", 301);
    }

    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      return new Response("SEOSiri Biopharma MCP Edge Active", { status: 200 });
    }
  }
};
