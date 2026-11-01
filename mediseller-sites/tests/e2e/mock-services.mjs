// Local stand-ins for Supabase, the Google Sheet webhook and Gemini — used only by the e2e test.
import http from 'node:http';
export function startMocks(port = 8790) {
  const log = [];
  let n = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const url = req.url;
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
    let body = null;
    if ((req.headers['content-type'] || '').includes('json')) { try { body = JSON.parse(buf.toString()); } catch {} }
    log.push({ method: req.method, url, body, size: buf.length, auth: req.headers.authorization || req.headers['x-goog-api-key'] || '' });

    if (url === '/__log') return send(200, log);
    if (url.startsWith('/rest/v1/leads') && req.method === 'POST') return send(201, [{ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, created_at: new Date().toISOString() }]);
    if (url.startsWith('/rest/v1/') && req.method === 'POST') return send(201);
    if (url.startsWith('/rest/v1/') && req.method === 'PATCH') return send(204);
    if (url.startsWith('/storage/v1/object/sign/')) return send(200, { signedURL: `/object/sign/${url.split('/sign/')[1]}?token=t` });
    if (url.startsWith('/storage/v1/object/')) return send(200, { Key: url });
    if (url === '/sheet') return send(200, { ok: true });
    if (url.includes(':generateContent')) {
      const contents = body.contents || [];
      const last = contents.at(-1);
      const isToolResult = last?.parts?.[0]?.functionResponse;
      const userText = contents.filter((c) => c.role === 'user' && c.parts[0].text).at(-1)?.parts[0].text || '';
      if (!isToolResult && /gleevec|imatinib/i.test(userText)) return send(200, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_products', args: { query: 'imatinib' } } }] } }] });
      if (isToolResult?.name === 'search_products') {
        const sku = isToolResult.response.results?.[0]?.sku;
        return send(200, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'add_to_cart', args: { sku, qty: 2 } } }] } }] });
      }
      if (isToolResult?.name === 'add_to_cart') return send(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'I added Imatinib 400 mg (2) to your cart. An agent will confirm the best price.' }] } }] });
      return send(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'Hello! How can I help?' }] } }] });
    }
    send(404, { error: 'mock: unknown ' + url });
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, log })));
}
