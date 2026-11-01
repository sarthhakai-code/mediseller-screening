// POST /api/admin/resync  (header: authorization: Bearer <ADMIN_TOKEN>)
// Re-pushes leads that never reached the Google Sheet (sheet_synced_at is null). Safe to run any time.
import { json } from '../../../server/util.js';
import { select, update, signedUrl, supabaseReady } from '../../../server/supabase.js';
import { sheetRow, pushToSheet } from '../../../server/leads.js';
import { getSite } from '../../../server/site.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ADMIN_TOKEN || request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ ok: false }, 401);
  if (!supabaseReady(env) || !env.SHEET_WEBHOOK_URL) return json({ ok: false, error: 'Supabase or sheet not configured' }, 400);
  const site = await getSite(context);
  const leads = await select(env, 'leads', `select=*,lead_items(*),attachments(*)&site_id=eq.${site.id}&sheet_synced_at=is.null&order=created_at.asc&limit=50`);
  let synced = 0;
  for (const l of leads) {
    try {
      const links = await Promise.all((l.attachments || []).map((a) => signedUrl(env, 'prescriptions', a.storage_path)));
      await pushToSheet(env, sheetRow(site, { ref: l.ref_no }, l, l.lead_items || [], links));
      await update(env, 'leads', { id: l.id }, { sheet_synced_at: new Date().toISOString() });
      synced++;
    } catch (e) { console.error('resync', l.ref_no, e); }
  }
  return json({ ok: true, pending: leads.length, synced });
}
