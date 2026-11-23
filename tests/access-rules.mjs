// Access rules test suite.
// Signs in as real accounts (pending, approved, rejected, suspended, banned,
// blocked, moderator, anonymous) and tries to read other members' profiles,
// media and messages directly through the public Supabase API — the same
// API anyone could call with the public key from the browser.
//
// Usage: node tests/access-rules.mjs [baseUrl]
// Writes test-results/access-rules.json, deliverables/access-rules-report.{html,pdf}
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { loadEnv, adminClient, allUsers, passwordFor, resetDemo } from '../scripts/lib.mjs';

const env = loadEnv();
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const admin = adminClient(env);
const results = [];
let current = '';

function group(name) { current = name; }
async function check(name, expect, fn) {
  let pass = false;
  let detail = '';
  try {
    const r = await fn();
    pass = r.pass;
    detail = r.detail ?? '';
  } catch (e) {
    detail = `test error: ${e.message}`;
  }
  results.push({ group: current, name, expect, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${current}] ${name}${pass ? '' : `  -> ${detail}`}`);
}

// ---------- helpers ----------
const anonClient = () => createClient(env.url, env.anon, { auth: { persistSession: false, autoRefreshToken: false } });
const sessions = {};
async function as(name) {
  if (sessions[name]) return sessions[name];
  const c = anonClient();
  const email = `${name}@example.com`;
  const { data, error } = await c.auth.signInWithPassword({ email, password: passwordFor(email, env) });
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  sessions[name] = { c, session: data.session, id: data.user.id };
  return sessions[name];
}
const denied = ({ data, error }) => ({
  pass: !!error || data == null || (Array.isArray(data) && data.length === 0),
  detail: error ? `refused: ${error.message}` : `returned ${JSON.stringify(data)?.slice(0, 160)}`,
});
const allowed = ({ data, error }) => ({
  pass: !error && data != null && (!Array.isArray(data) || data.length > 0),
  detail: error ? `error: ${error.message}` : 'allowed',
});
const sign = (c, path) => c.storage.from('media').createSignedUrl(path, 300);
const signDenied = async (c, path) => {
  const { data, error } = await sign(c, path);
  return { pass: !!error || !data?.signedUrl, detail: error ? `refused: ${error.message}` : 'a signed URL was issued' };
};
const ids = {};
const photo = (n) => `${ids[n]}/photo-seed.jpg`;
const video = (n) => `${ids[n]}/video-seed.mp4`;

async function cookieFor(name) {
  const { session } = await as(name);
  const jar = [];
  const ssr = createServerClient(env.url, env.anon, {
    cookies: { getAll: () => [], setAll: (list) => list.forEach((c) => jar.push(`${c.name}=${c.value}`)) },
  });
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return jar.join('; ');
}
async function http(path, who) {
  const headers = who ? { cookie: await cookieFor(who) } : {};
  const res = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
  return res;
}

// ---------- run ----------
console.log(`Base URL: ${BASE}`);
await resetDemo(admin);
for (const u of await allUsers(admin)) {
  const m = u.email?.match(/^(.+)@example\.com$/);
  if (m) ids[m[1]] = u.id;
}
const { data: convRows } = await admin.from('conversations').select('id, requester, recipient');
const convBetween = (a, b) => convRows.find((c) => (c.requester === ids[a] && c.recipient === ids[b]) || (c.requester === ids[b] && c.recipient === ids[a]))?.id;
const sarahMark = convBetween('sarah', 'mark');
const thomasRuth = convBetween('thomas', 'ruth');

// ---- Anonymous ----
group('Anonymous (not signed in)');
{
  const c = anonClient();
  await check('Cannot read the profiles table', 'denied', async () => denied(await c.from('profiles').select('id, first_name, dob')));
  await check('Cannot call Discover', 'denied', async () => denied(await c.rpc('discover')));
  await check('Cannot open an approved profile', 'denied', async () => denied(await c.rpc('get_member', { p_id: ids.david })));
  await check("Cannot sign an approved member's photo", 'denied', () => signDenied(c, photo('david')));
  await check('Cannot read messages', 'denied', async () => denied(await c.from('messages').select('*')));
  await check('Cannot read the staff table', 'denied', async () => denied(await c.from('staff').select('*')));
  await check('Cannot list files in the media bucket', 'denied', async () => denied(await c.storage.from('media').list('')));
  await check('Media bucket is not public (public URL refused)', 'denied', async () => {
    const r = await fetch(`${env.url}/storage/v1/object/public/media/${photo('david')}`);
    return { pass: r.status >= 400, detail: `HTTP ${r.status}` };
  });
  await check('Profile URL sends visitor to sign-in', 'redirect', async () => {
    const r = await http(`/members/${ids.david}`);
    return { pass: r.status === 307 && (r.headers.get('location') ?? '').includes('/login'), detail: `HTTP ${r.status} ${r.headers.get('location') ?? ''}` };
  });
}

// ---- Hidden-by-default personas ----
const hidden = [
  ['pending', 'daniel', 'Pending (under review)'],
  ['rejected', 'paul', 'Rejected (changes requested)'],
  ['suspended', 'victor', 'Suspended'],
  ['banned', 'kevin', 'Banned'],
];
for (const [, who, label] of hidden) {
  group(`${label}: ${who}@example.com`);
  const { c, id } = await as(who);
  await check('Reads only their own row from profiles', 'own row only', async () => {
    const { data, error } = await c.from('profiles').select('id');
    return { pass: !error && data.length === 1 && data[0].id === id, detail: error ? error.message : `${data.length} row(s)` };
  });
  await check('Discover is refused', 'denied', async () => denied(await c.rpc('discover')));
  await check('Cannot open an approved profile', 'denied', async () => denied(await c.rpc('get_member', { p_id: ids.david })));
  await check("Cannot sign an approved member's photo", 'denied', () => signDenied(c, photo('david')));
  await check("Cannot sign an approved member's video", 'denied', () => signDenied(c, video('david')));
  await check('Cannot list conversations', 'denied', async () => denied(await c.rpc('my_conversations')));
  await check('Cannot read any messages', 'denied', async () => denied(await c.from('messages').select('*')));
  await check('Cannot send a message request', 'denied', async () => denied(await c.rpc('send_request', { p_to: ids.david, p_body: 'hello' })));
  await check('Approved profile URL answers 404', 'HTTP 404', async () => {
    const r = await http(`/members/${ids.david}`, who);
    return { pass: r.status === 404, detail: `HTTP ${r.status}` };
  });

  const ruth = (await as('ruth')).c;
  await check(`Approved member cannot find ${who} in Discover`, 'not listed', async () => {
    const { data, error } = await ruth.rpc('discover');
    return { pass: !error && !data.some((m) => m.id === id), detail: error ? error.message : `${data.length} listed` };
  });
  await check(`Approved member cannot search for ${who} by name`, 'not listed', async () => {
    const { data, error } = await ruth.rpc('discover', { p_search: who });
    return { pass: !error && data.length === 0, detail: error ? error.message : `${data.length} listed` };
  });
  await check(`Approved member cannot open ${who}'s profile`, 'denied', async () => denied(await ruth.rpc('get_member', { p_id: id })));
  await check(`Approved member cannot sign ${who}'s photo`, 'denied', () => signDenied(ruth, photo(who)));
  await check(`Approved member cannot sign ${who}'s video`, 'denied', () => signDenied(ruth, video(who)));
  await check(`Direct URL to ${who}'s profile answers 404`, 'HTTP 404', async () => {
    const r = await http(`/members/${id}`, 'ruth');
    return { pass: r.status === 404, detail: `HTTP ${r.status}` };
  });
}

// ---- Approved member ----
group('Approved member: ruth@example.com');
{
  const { c, id } = await as('ruth');
  await check('Discover lists approved members', 'allowed', async () => {
    const { data, error } = await c.rpc('discover');
    return { pass: !error && data.some((m) => m.id === ids.david), detail: error ? error.message : `${data.length} listed` };
  });
  await check('Discover never lists herself, hidden or blocked members', 'not listed', async () => {
    const { data } = await c.rpc('discover');
    const bad = data.filter((m) => [id, ids.sarah, ids.tom, ids.kevin].includes(m.id));
    return { pass: bad.length === 0, detail: bad.map((b) => b.first_name).join(', ') || 'none' };
  });
  await check('Profile of an approved member opens (HTTP 200)', 'HTTP 200', async () => {
    const r = await http(`/members/${ids.david}`, 'ruth');
    return { pass: r.status === 200, detail: `HTTP ${r.status}` };
  });
  await check("Photo set to 'approved members' can be signed", 'allowed', async () => allowed(await sign(c, photo('david'))));
  await check('Signed links expire after 5 minutes', '300 s', async () => {
    const { data } = await sign(c, photo('david'));
    const token = new URL(data.signedUrl).searchParams.get('token');
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return { pass: p.exp - p.iat === 300, detail: `${p.exp - p.iat} s` };
  });
  await check("Photo set to 'only people I accept' is refused (not connected)", 'denied', () => signDenied(c, photo('samuel')));
  await check("Discover hides that photo's path", 'no path', async () => {
    const { data } = await c.rpc('discover');
    const s = data.find((m) => m.id === ids.samuel);
    return { pass: s && s.photo_path === null && s.photo_locked, detail: JSON.stringify(s && { path: s.photo_path, locked: s.photo_locked }) };
  });
  await check("Video set to 'only people I accept' is refused (not connected)", 'denied', () => signDenied(c, video('elena')));
  await check('Media of a connected member can be signed', 'allowed', async () => allowed(await sign(c, video('thomas'))));
  await check("Cannot read another member's row (e.g. date of birth)", 'own row only', async () => {
    const { data } = await c.from('profiles').select('id, dob');
    return { pass: data.length === 1 && data[0].id === id, detail: `${data.length} row(s)` };
  });
  await check("Cannot read other people's conversation", 'denied', async () => denied(await c.from('conversations').select('id').eq('id', sarahMark)));
  await check("Cannot read other people's messages", 'denied', async () => denied(await c.from('messages').select('body').eq('conversation_id', sarahMark)));
  await check("Cannot open other people's conversation by id", 'denied', async () => denied(await c.rpc('get_conversation', { p_id: sarahMark })));
  await check("Cannot post into other people's conversation", 'denied', async () => denied(await c.rpc('send_message', { p_conversation: sarahMark, p_body: 'hi' })));
  await check('Starting a conversation without membership is refused', 'denied', async () => {
    const r = await c.rpc('send_request', { p_to: ids.mark, p_body: 'Hello' });
    return { pass: !!r.error && r.error.message.includes('membership_required'), detail: r.error?.message ?? 'sent' };
  });
  await check("Cannot upload into another member's folder", 'denied', async () => {
    const r = await c.storage.from('media').upload(`${ids.david}/x.jpg`, new Blob(['x'], { type: 'image/jpeg' }));
    return { pass: !!r.error, detail: r.error?.message ?? 'uploaded' };
  });
  await check("Cannot attach another member's file to her profile", 'denied', async () => denied(await c.rpc('set_my_media', { p_kind: 'photo', p_path: photo('david') })));
  await check("Cannot sign an unreviewed file in an approved member's folder", 'denied', async () => {
    await admin.storage.from('media').upload(`${ids.david}/unreviewed.jpg`, new Blob(['x'], { type: 'image/jpeg' }), { upsert: true });
    return signDenied(c, `${ids.david}/unreviewed.jpg`);
  });
  await check('Cannot approve herself by editing her row', 'no change', async () => {
    await c.from('profiles').update({ status: 'approved', membership: 'paid' }).eq('id', id);
    const { data } = await admin.from('profiles').select('membership').eq('id', id).single();
    return { pass: data.membership === 'none', detail: `membership = ${data.membership}` };
  });
  await check('Cannot make herself staff', 'denied', async () => {
    const r = await c.from('staff').insert({ user_id: id, role: 'admin', display_name: 'Ruth' });
    const { data } = await admin.from('staff').select('user_id').eq('user_id', id);
    return { pass: !!r.error && data.length === 0, detail: r.error?.message ?? 'inserted' };
  });
  await check('Cannot read the audit log, notes or reports', 'denied', async () => {
    const [a, n, r] = await Promise.all([c.from('audit_log').select('id'), c.from('review_notes').select('id'), c.from('reports').select('id')]);
    return { pass: [a, n, r].every((x) => x.error || x.data.length === 0), detail: `${a.data?.length}/${n.data?.length}/${r.data?.length} rows` };
  });
  await check('Cannot write to the audit log', 'denied', async () => {
    const r = await c.from('audit_log').insert({ actor_name: 'Ruth', action: 'fake' });
    return { pass: !!r.error, detail: r.error?.message ?? 'inserted' };
  });
  await check('Cannot call moderator functions', 'denied', async () => {
    const [q, d, a] = await Promise.all([
      c.rpc('mod_queue', { p_filter: 'new' }),
      c.rpc('mod_decide', { p_id: ids.daniel, p_action: 'approve' }),
      c.rpc('admin_set_access', { p_id: id, p_access: 'complimentary', p_until: '2030-01-01' }),
    ]);
    return { pass: !!q.error && !!d.error && !!a.error, detail: [q, d, a].map((x) => x.error?.message ?? 'allowed').join(' / ') };
  });
  await check('Cannot reset the demo', 'denied', async () => denied(await c.rpc('reset_demo_data')));
  await check('Moderator dashboard redirects a member to staff sign-in', 'redirect', async () => {
    const r = await http('/mod', 'ruth');
    return { pass: r.status === 307 && (r.headers.get('location') ?? '').includes('/mod/login'), detail: `HTTP ${r.status} ${r.headers.get('location') ?? ''}` };
  });
}

// ---- Blocked ----
group('Blocked member: tom@example.com (blocked by Ruth)');
{
  const { c } = await as('tom');
  await check('Ruth is not in his Discover', 'not listed', async () => {
    const { data, error } = await c.rpc('discover');
    return { pass: !error && !data.some((m) => m.id === ids.ruth), detail: error ? error.message : `${data.length} listed` };
  });
  await check("Cannot open Ruth's profile", 'denied', async () => denied(await c.rpc('get_member', { p_id: ids.ruth })));
  await check("Cannot sign Ruth's photo", 'denied', () => signDenied(c, photo('ruth')));
  await check('Cannot send Ruth a request', 'denied', async () => denied(await c.rpc('send_request', { p_to: ids.ruth, p_body: 'hi' })));
  await check("Ruth's profile URL answers 404", 'HTTP 404', async () => {
    const r = await http(`/members/${ids.ruth}`, 'tom');
    return { pass: r.status === 404, detail: `HTTP ${r.status}` };
  });
  await check('Does not know he was blocked (cannot read blocks)', 'denied', async () => denied(await c.from('blocks').select('*').eq('blocked', (await as('tom')).id)));
}
group('Blocking an existing conversation: Thomas blocks Ruth');
{
  const thomas = (await as('thomas')).c;
  const ruth = (await as('ruth')).c;
  await check('Before: Ruth can read their conversation', 'allowed', async () => allowed(await ruth.from('messages').select('id').eq('conversation_id', thomasRuth)));
  await thomas.rpc('block_member', { p_id: ids.ruth });
  await check('After: conversation gone from her list', 'not listed', async () => {
    const { data } = await ruth.rpc('my_conversations');
    return { pass: !data.some((x) => x.id === thomasRuth), detail: `${data.length} conversation(s)` };
  });
  await check('After: messages unreadable directly', 'denied', async () => denied(await ruth.from('messages').select('id').eq('conversation_id', thomasRuth)));
  await check('After: cannot send into it', 'denied', async () => denied(await ruth.rpc('send_message', { p_conversation: thomasRuth, p_body: 'hello?' })));
  await check("After: Thomas's media unreachable", 'denied', () => signDenied(ruth, video('thomas')));
}

// ---- Moderator ----
group('Moderator: anna@example.com');
{
  const { c, id } = await as('anna');
  await check('Sees pending profiles in the queue', 'allowed', async () => {
    const { data, error } = await c.rpc('mod_queue', { p_filter: 'new' });
    return { pass: !error && data.some((x) => x.id === ids.daniel), detail: error ? error.message : `${data.length} in queue` };
  });
  await check("Can sign a pending member's video for review", 'allowed', async () => allowed(await sign(c, video('daniel'))));
  await check('Cannot write to the staff table either', 'denied', async () => {
    const r = await c.from('staff').update({ role: 'moderator' }).eq('user_id', id).select();
    const { data } = await admin.from('staff').select('role').eq('user_id', id).single();
    return { pass: data.role === 'admin' && (!!r.error || r.data.length === 0), detail: r.error?.message ?? `role still ${data.role}` };
  });
  await check('Cannot read private conversations', 'denied', async () => denied(await c.from('messages').select('id').eq('conversation_id', thomasRuth)));
  await check('Cannot browse as a member', 'denied', async () => denied(await c.rpc('discover')));
}

// ---- Rules over time ----
group('Workflow rules');
{
  const anna = (await as('anna')).c;
  await check('Under-18 date of birth is refused by the database', 'denied', async () => {
    const email = `minor-${Date.now()}@example.org`;
    const { data: u } = await admin.auth.admin.createUser({ email, password: 'Minor-test-2026', email_confirm: true });
    const c = anonClient();
    await c.auth.signInWithPassword({ email, password: 'Minor-test-2026' });
    const dob = new Date(); dob.setFullYear(dob.getFullYear() - 17);
    const r = await c.rpc('create_my_profile', {
      p_first_name: 'Minor', p_last_name: 'Test', p_dob: dob.toISOString().slice(0, 10), p_country: 'Spain', p_country_code: 'ES',
      p_city: 'Madrid', p_faith: null, p_languages: ['English'], p_consent_age: true, p_consent_terms: true, p_consent_faith: false,
    });
    await admin.auth.admin.deleteUser(u.user.id);
    return { pass: !!r.error && r.error.message.includes('under_18'), detail: r.error?.message ?? 'profile created' };
  });
  await check('Under-18 sign-up is refused by the app', 'HTTP 400', async () => {
    const dob = new Date(); dob.setFullYear(dob.getFullYear() - 17);
    const r = await fetch(`${BASE}/api/signup`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `minor2-${Date.now()}@example.org`, password: 'Minor-test-2026', first_name: 'M', dob: dob.toISOString().slice(0, 10), country: 'Spain', country_code: 'ES', city: 'X', languages: ['English'], consent_age: true, consent_terms: true }),
    });
    return { pass: r.status === 400, detail: `HTTP ${r.status}` };
  });
  await check('Consents are stored with date and version', 'recorded', async () => {
    const { c } = await as('daniel');
    const { data } = await c.from('consents').select('kind, version, created_at');
    return { pass: data.length === 3 && data.every((x) => x.version && x.created_at), detail: data.map((x) => `${x.kind}@${x.version}`).join(', ') };
  });
  await check('Founding offer (demo, no payment) unlocks message requests and uses a place', 'allowed', async () => {
    const { c } = await as('ruth');
    const before = (await c.rpc('membership_info')).data.founding_left;
    const claim = await c.rpc('claim_founding');
    const req = await c.rpc('send_request', { p_to: ids.mark, p_body: 'Hello Mark' });
    const pass = !claim.error && claim.data.active && claim.data.founding_left === before - 1 && !req.error;
    return { pass, detail: claim.error?.message ?? req.error?.message ?? `places ${before} -> ${claim.data.founding_left}, request sent` };
  });
  await check('A suspended or pending member cannot claim the offer', 'denied', async () => denied(await (await as('daniel')).c.rpc('claim_founding')));
  await check('Approving a pending member makes them visible', 'listed', async () => {
    await anna.rpc('mod_decide', { p_id: ids.lucia, p_action: 'approve', p_languages_confirmed: true });
    const { data } = await (await as('ruth')).c.rpc('discover');
    return { pass: data.some((m) => m.id === ids.lucia), detail: `${data.length} listed` };
  });
  await check('Rejected member sees the reason', 'reason shown', async () => {
    await anna.rpc('mod_decide', { p_id: ids.daniel, p_action: 'reject', p_reason: 'Your photo is too dark.', p_items: { photo: 'needs_update', video: 'ok', details: 'ok' } });
    const { data } = await (await as('daniel')).c.rpc('my_status');
    return { pass: data.status === 'rejected' && data.reason === 'Your photo is too dark.', detail: `${data.status}: ${data.reason}` };
  });
  await check('Replacing the photo sends a rejected member back to pending', 'pending', async () => {
    const { c, id } = await as('daniel');
    const path = `${id}/photo-${Date.now()}.jpg`;
    await c.storage.from('media').upload(path, new Blob(['x'], { type: 'image/jpeg' }));
    const { data, error } = await c.rpc('set_my_media', { p_kind: 'photo', p_path: path });
    return { pass: data === 'pending', detail: error?.message ?? data };
  });
  await check('Replacing the photo of an approved member hides them until re-approved', 'hidden + queued', async () => {
    const { c, id } = await as('david');
    const path = `${id}/photo-${Date.now()}.jpg`;
    await c.storage.from('media').upload(path, new Blob(['x'], { type: 'image/jpeg' }));
    await c.rpc('set_my_media', { p_kind: 'photo', p_path: path });
    const { data: d } = await (await as('ruth')).c.rpc('discover');
    const { data: q } = await anna.rpc('mod_queue', { p_filter: 'changed' });
    return { pass: !d.some((m) => m.id === ids.david) && q.some((x) => x.id === ids.david), detail: `in discover: ${d.some((m) => m.id === ids.david)}, in queue: ${q.some((x) => x.id === ids.david)}` };
  });
  await check('Three reports hide a profile and queue it for moderators', 'hidden + queued', async () => {
    for (const who of ['ruth', 'grace', 'elena']) {
      await (await as(who)).c.rpc('report_member', { p_id: ids.james, p_reason: 'fake_profile', p_details: null, p_block: false });
    }
    const { data: d } = await (await as('mark')).c.rpc('discover');
    const { data: q } = await anna.rpc('mod_queue', { p_filter: 'flagged' });
    return { pass: !d.some((m) => m.id === ids.james) && q.some((x) => x.id === ids.james), detail: `in discover: ${d.some((m) => m.id === ids.james)}, in queue: ${q.some((x) => x.id === ids.james)}` };
  });
  await check('Every moderator action is in the audit log', 'logged', async () => {
    const { data } = await anna.from('audit_log').select('actor_name, action, target_name').order('created_at', { ascending: false }).limit(10);
    const want = ['approved', 'rejected'];
    return { pass: want.every((w) => data.some((a) => a.action === w && a.actor_name === 'Anna')), detail: data.slice(0, 5).map((a) => `${a.actor_name} ${a.action} ${a.target_name ?? ''}`).join('; ') };
  });
  await check('Expired suspension lifts automatically', 'approved', async () => {
    await admin.from('profiles').update({ suspended_until: new Date(Date.now() - 60000).toISOString() }).eq('id', ids.victor);
    const { data } = await (await as('victor')).c.rpc('my_status');
    return { pass: data.status === 'approved', detail: data.status };
  });
}

await resetDemo(admin);
console.log('demo data restored');

// ---------- report ----------
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true });
mkdirSync(new URL('../deliverables/', import.meta.url), { recursive: true });
writeFileSync(new URL('../test-results/access-rules.json', import.meta.url), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed, failed, results }, null, 2));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const groups = [...new Set(results.map((r) => r.group))];
const when = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Access rules test report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Lora:wght@600;700&display=swap');
  body { font-family: Inter, system-ui, sans-serif; color: #1e2a36; background: #faf7f2; margin: 0; padding: 40px 20px; font-size: 14px; }
  main { max-width: 900px; margin: 0 auto; }
  h1, h2 { font-family: Lora, Georgia, serif; color: #1f3b57; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  h2 { font-size: 18px; margin: 28px 0 10px; break-after: avoid; }
  .muted { color: #5b6672; }
  .summary { display: flex; gap: 14px; margin: 22px 0; flex-wrap: wrap; }
  .box { background: #fff; border: 1px solid #e7e1d8; border-radius: 14px; padding: 14px 18px; min-width: 150px; }
  .box .v { font-family: Lora, Georgia, serif; font-size: 30px; font-weight: 700; color: #1f3b57; }
  .box.ok .v { color: #2f5d47; } .box.bad .v { color: #a63d2a; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e7e1d8; border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid #efe9e0; vertical-align: top; }
  th { background: #f6f3ee; font-weight: 600; font-size: 13px; }
  tr { break-inside: avoid; }
  td.r { width: 64px; } td.e { width: 120px; color: #5b6672; } td.d { color: #5b6672; font-size: 12.5px; width: 230px; word-break: break-word; }
  .pass { background: #e6efe9; color: #2f5d47; font-weight: 600; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
  .fail { background: #f8e4df; color: #a63d2a; font-weight: 600; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
  .note { background: #fff; border: 1px solid #e7e1d8; border-radius: 12px; padding: 14px 18px; margin-top: 18px; line-height: 1.55; }
  @media print { body { background: #fff; padding: 0; } .box, table, .note { border-color: #ddd; } }
</style></head><body><main>
<h1>Access rules test report</h1>
<p class="muted">[Community name] · verified community demo · run ${esc(when)}</p>
<div class="summary">
  <div class="box"><div class="muted">Checks</div><div class="v">${results.length}</div></div>
  <div class="box ok"><div class="muted">Passed</div><div class="v">${passed}</div></div>
  <div class="box ${failed ? 'bad' : 'ok'}"><div class="muted">Failed</div><div class="v">${failed}</div></div>
</div>
<div class="note">
  <strong>How this was tested.</strong> Each check signs in as a real account and calls the database directly through the public
  Supabase API, using only the public key that every browser already has, as an attacker would. Visibility is enforced inside
  Postgres (row-level security and security-definer functions) and by the storage policy that decides who may sign a media link,
  so these results do not depend on the app's screens. Checks marked HTTP request the live site with that member's session
  cookie. The suite resets the demo data before and after it runs.
</div>
${groups.map((g) => `<h2>${esc(g)}</h2><table><thead><tr><th>Result</th><th>Check</th><th>Expected</th><th>Observed</th></tr></thead><tbody>
${results.filter((r) => r.group === g).map((r) => `<tr><td class="r"><span class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span></td><td>${esc(r.name)}</td><td class="e">${esc(r.expect)}</td><td class="d">${esc(r.detail)}</td></tr>`).join('\n')}
</tbody></table>`).join('\n')}
<p class="muted" style="margin-top:24px">Site tested: ${esc(BASE)}</p>
</main></body></html>`;
const htmlPath = new URL('../deliverables/access-rules-report.html', import.meta.url);
writeFileSync(htmlPath, html);

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(htmlPath.href, { waitUntil: 'networkidle' });
  await page.pdf({ path: new URL('../deliverables/access-rules-report.pdf', import.meta.url).pathname, format: 'A4', margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' }, printBackground: true });
  await browser.close();
} catch (e) {
  console.log('PDF not generated:', e.message);
}

console.log(`\n${passed}/${results.length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
