// POST /api/chat — { sessionId, messages:[{role,text}], page }
import { json, rateLimited, clean } from '../../server/util.js';
import { chat, fallbackReply } from '../../server/chat.js';
import { getSite, getCatalogue } from '../../server/site.js';
import { supabaseReady, upsertIgnore, insert, update } from '../../server/supabase.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (rateLimited(`chat:${ip}`, 20)) return json({ reply: 'You are sending messages very fast — please wait a moment.', actions: [] }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const sessionId = /^[0-9a-f-]{36}$/i.test(body.sessionId || '') ? body.sessionId : crypto.randomUUID();
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-20)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: clean(m.text, 1500) }))
    .filter((m) => m.text);
  if (!history.length || history.at(-1).role !== 'user') return json({ error: 'No message' }, 400);

  const [site, catalogue] = await Promise.all([getSite(context), getCatalogue(context)]);
  const ctx = { env, site, catalogue, actions: [], sessionId, page: clean(body.page, 300), waitUntil: (p) => context.waitUntil(p) };

  let reply;
  if (!env.GEMINI_API_KEY) reply = fallbackReply(ctx, history.at(-1).text);
  else {
    try { reply = await chat(ctx, history); }
    catch (e) {
      console.error('chat', e);
      reply = fallbackReply(ctx, history.at(-1).text);
    }
  }

  if (supabaseReady(env)) {
    context.waitUntil((async () => {
      try {
        await upsertIgnore(env, 'chat_sessions', [{ id: sessionId, site_id: site.id, page: ctx.page }]);
        await insert(env, 'chat_messages', [
          { session_id: sessionId, role: 'user', content: history.at(-1).text },
          { session_id: sessionId, role: 'assistant', content: reply },
        ], { returning: false });
        const patch = {};
        if (ctx.leadId) patch.lead_id = ctx.leadId;
        if (ctx.actions.some((a) => a.type === 'handoff')) patch.handed_off = true;
        if (Object.keys(patch).length) await update(env, 'chat_sessions', { id: sessionId }, patch);
      } catch (e) { console.error('chat log', e); }
    })());
  }
  return json({ sessionId, reply, actions: ctx.actions });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
