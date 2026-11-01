// GET /api/geo — visitor country from Cloudflare, used to pre-fill the country picker.
export const onRequestGet = ({ request }) =>
  new Response(JSON.stringify({ country: request.cf?.country || '' }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=3600' },
  });
