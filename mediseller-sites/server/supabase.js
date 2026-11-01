// Minimal Supabase REST client for Workers (no SDK needed). Uses the service-role key — server side only.
export const supabaseReady = (env) => !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);

const headers = (env, extra = {}) => ({
  apikey: env.SUPABASE_SERVICE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  ...extra,
});

async function check(res, what) {
  if (!res.ok) throw new Error(`Supabase ${what} failed: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 500));
  return res;
}

export async function insert(env, table, rows, { returning = true } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(env, { 'content-type': 'application/json', prefer: returning ? 'return=representation' : 'return=minimal' }),
    body: JSON.stringify(rows),
  });
  await check(res, `insert ${table}`);
  return returning ? res.json() : null;
}

export async function update(env, table, match, patch) {
  const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'PATCH',
    headers: headers(env, { 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  await check(res, `update ${table}`);
}

export async function select(env, table, query) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: headers(env) });
  await check(res, `select ${table}`);
  return res.json();
}

export async function uploadFile(env, bucket, path, file) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: headers(env, { 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'false' }),
    body: await file.arrayBuffer(),
  });
  await check(res, 'storage upload');
}

export async function signedUrl(env, bucket, path, expiresIn = 7 * 24 * 3600) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: headers(env, { 'content-type': 'application/json' }),
    body: JSON.stringify({ expiresIn }),
  });
  await check(res, 'sign url');
  const { signedURL } = await res.json();
  return `${env.SUPABASE_URL}/storage/v1${signedURL}`;
}

export async function upsertIgnore(env, table, rows) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: headers(env, { 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  await check(res, `upsert ${table}`);
}
