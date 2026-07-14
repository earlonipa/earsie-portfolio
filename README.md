// Cloudflare Pages Function — handles GET /api/visits
// Requires a KV namespace bound to this project as "VISITS_KV"
// (Pages project → Settings → Functions → KV namespace bindings)

export async function onRequestGet(context) {
  const { request, env } = context;

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
}
