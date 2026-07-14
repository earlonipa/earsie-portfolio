// Worker entry point — serves the static site and handles /api/visits.
// Uses the ASSETS binding (static files) and the VISITS_KV binding (counter storage).

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/visits' && request.method === 'GET') {
      return handleVisits(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleVisits(request, env) {
  // Defensive: if the KV binding isn't configured, don't crash — just report 0.
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
    }

    return new Response(JSON.stringify({ count }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ count: 0, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
