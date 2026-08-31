/**
 * Worker KV Session Manager – Production
 * Uses KV_BINDING, API key from .env
 */

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Authorization
	  
      //const API_KEY = env.API_KEY;
				const API_KEY = "g8F9P3RQjbN9pNcDNK3lkoOFr9XAoIn9";
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${API_KEY}`) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      if (!env.KV_BINDING) {
        return new Response(
          JSON.stringify({ error: "KV_BINDING missing" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // POST /session/save
      if (request.method === "POST" && url.pathname === "/session/save") {
        const { userId, session } = await request.json();
        if (!userId || !session) {
          return new Response(
            JSON.stringify({ error: "userId and session required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const payload = { session, updatedAt: Date.now() };
        await env.KV_BINDING.put(userId, JSON.stringify(payload), {
          expirationTtl: 60 * 60 * 24 * 7,
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // GET /session/get/:userId
      if (request.method === "GET" && url.pathname.startsWith("/session/get/")) {
        const userId = url.pathname.split("/").pop();
        const raw = await env.KV_BINDING.get(userId);
        // Always return a JSON, never 404
        const payload = raw ? JSON.parse(raw) : { session: null };
        return new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // DELETE /session/delete/:userId
      if (request.method === "DELETE" && url.pathname.startsWith("/session/delete/")) {
        const userId = url.pathname.split("/").pop();
        await env.KV_BINDING.delete(userId);
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }

      // GET /session/list
      if (request.method === "GET" && url.pathname === "/session/list") {
        const list = await env.KV_BINDING.list();
        const results = await Promise.all(
          list.keys.map(async (key) => {
            const value = await env.KV_BINDING.get(key.name);
            return { key: key.name, value: value ? JSON.parse(value) : null };
          })
        );
        return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  },
};