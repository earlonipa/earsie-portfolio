// Worker entry point — serves the static site and handles /api/visits.
// Uses the ASSETS binding (static files) and the VISITS_KV binding (counter + visitor log storage).

const MAX_LOG_ENTRIES = 500; // cap stored log so KV value doesn't grow unbounded

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/visits' && request.method === 'GET') {
      return handleVisits(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleVisits(request, env, ctx) {
  if (!env.VISITS_KV) {
    return new Response(JSON.stringify({ count: 0, warning: 'VISITS_KV binding not configured' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader
        .split(';')
        .map(c => c.trim().split('='))
        .filter(pair => pair[0])
    );

    let count = parseInt((await env.VISITS_KV.get('count')) || '0', 10);
    const headers = new Headers({ 'Content-Type': 'application/json' });

    if (!cookies['evisited']) {
      count += 1;
      await env.VISITS_KV.put('count', String(count));

      const visitorId = crypto.randomUUID();
      headers.append(
        'Set-Cookie',
        `evisited=${visitorId}; Max-Age=315360000; Path=/; HttpOnly; SameSite=Lax`
      );

      // Log IP + country for this new unique visit, in the background.
      // ctx.waitUntil keeps this running even after the response is sent —
      // without it, Cloudflare can terminate the request before the KV
      // write finishes, which is why the log wasn't appearing before.
      ctx.waitUntil(logVisit(request, env).catch(() => {}));
    }

    return new Response(JSON.stringify({ count }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ count: 0, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function logVisit(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const country = request.cf?.country || 'unknown';
  const entry = {
    ip,
    country,
    timestamp: new Date().toISOString(),
  };

  const raw = await env.VISITS_KV.get('visitor_log');
  const log = raw ? JSON.parse(raw) : [];
  log.push(entry);

  // Keep only the most recent MAX_LOG_ENTRIES
  const trimmed = log.length > MAX_LOG_ENTRIES ? log.slice(log.length - MAX_LOG_ENTRIES) : log;

  await env.VISITS_KV.put('visitor_log', JSON.stringify(trimmed));
}
