// End-to-end click-through in a real browser at phone and desktop sizes.
// Usage: node tests/walkthrough.mjs [baseUrl]   -> screenshots in test-results/shots
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright';
import { loadEnv, adminClient, resetDemo } from '../scripts/lib.mjs';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const ENGINE = process.env.ENGINE === 'webkit' ? webkit : chromium;
const OUT = new URL('../test-results/shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const env = loadEnv();
const admin = adminClient(env);
await resetDemo(admin);

const problems = [];
const browser = await ENGINE.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: ENGINE === chromium, hasTouch: true };
const desktop = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 };

async function ctx(opts) {
  const c = await browser.newContext(opts);
  const p = await c.newPage();
  p.on('pageerror', (e) => problems.push(`pageerror ${p.url()}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(404|400)/.test(m.text())) problems.push(`console ${p.url()}: ${m.text()}`); });
  return p;
}
let n = 0;
async function shot(p, name, full = false) {
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
}
function step(s) { console.log(`- ${s}`); }
async function noHScroll(p, label) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) problems.push(`horizontal scroll ${over}px on ${label}`);
}
async function login(p, email, password, path = '/login') {
  await p.goto(BASE + path);
  await p.fill('input[type=email]', email);
  await p.fill('input[type=password]', password);
  await p.click('button:has-text("Sign in")');
}

// 1. New member joins (phone)
const email = `walk-${Date.now()}@example.org`;
{
  const p = await ctx(phone);
  step('welcome');
  await p.goto(BASE + '/');
  await shot(p, 'welcome');
  await noHScroll(p, 'welcome');
  await p.click('text=Join the community');
  step('under-18 is blocked');
  await p.fill('input[type=date]', '2012-05-01');
  await p.getByText('You must be 18 or older to join.').waitFor();
  await shot(p, 'join-under18');
  await p.fill('input[autocomplete=given-name]', 'Hannah');
  await p.fill('input[type=date]', '1994-03-14');
  await p.fill('input[aria-label=City]', 'Seville');
  await p.selectOption('select[aria-label="Add a language"]', 'English');
  await p.selectOption('select[aria-label="Add a language"]', 'Spanish');
  await p.fill('input[type=email]', email);
  await p.fill('input[type=password]', 'Walkthrough-2026');
  await p.check('text=I confirm I am 18 or older');
  await p.locator('label.check').nth(1).locator('input').check();
  await noHScroll(p, 'join');
  await shot(p, 'join-step1', true);
  await p.click('button:has-text("Continue")');
  await p.waitForURL('**/join/details');
  step('details');
  await p.fill('textarea', 'Nurse and keen hiker. Sunday choir.');
  await p.click('button:has-text("Continue")');
  await p.waitForURL('**/join/media');
  step('media with sample files');
  await p.click('text=Use a sample photo');
  await p.getByText('Photo added').waitFor({ timeout: 20000 });
  await p.click('text=Use a sample video');
  await p.getByText('Video added').waitFor({ timeout: 30000 });
  await p.selectOption('select[aria-label="Prompt 4"]', { index: 1 });
  await p.selectOption('select[aria-label="Prompt 5"]', { index: 2 });
  await noHScroll(p, 'media');
  await shot(p, 'join-media', true);
  await p.click('button:has-text("Submit for review")');
  await p.waitForURL('**/status');
  await p.getByText('Thank you, Hannah').waitFor();
  await shot(p, 'under-review');
  step('pending member is locked out of member pages');
  await p.goto(BASE + '/discover');
  await p.waitForURL('**/status');
  await p.context().close();
}

// 2. Approved member (phone)
let davidUrl = '';
{
  const p = await ctx(phone);
  await login(p, 'ruth@example.com', 'Ruth-demo-2026');
  await p.waitForURL('**/discover');
  await p.getByText('David, 36').waitFor();
  await shot(p, 'discover');
  await noHScroll(p, 'discover');
  step('new applicant is not visible');
  if (await p.getByText('Hannah').count()) problems.push('pending applicant visible in Discover');
  await p.fill('input[aria-label="Search by name or city"]', 'Hannah');
  await p.getByText('No members match these filters').waitFor();
  await p.fill('input[aria-label="Search by name or city"]', '');
  step('filters');
  await p.selectOption('select[aria-label=Language]', 'Portuguese');
  await p.getByText('Grace, 31').waitFor();
  await p.selectOption('select[aria-label=Language]', '');
  await p.click('text=David, 36');
  await p.waitForURL('**/members/**');
  davidUrl = p.url();
  await p.getByText('Verified by video').waitFor();
  await shot(p, 'profile');
  step('play signed video');
  await p.click('button.video-bar');
  await p.locator('video.player').waitFor();
  await p.waitForFunction(() => { const v = document.querySelector('video.player'); return v && v.readyState >= 2; }, null, { timeout: 15000 })
    .catch(() => problems.push('profile video did not load'));
  await shot(p, 'profile-video');
  step('paywall then request (Mark)');
  await p.goto(BASE + '/discover');
  await p.click('text=Mark, 41');
  await p.click('text=Send a message request');
  await p.waitForURL('**/membership?from=**');
  await shot(p, 'membership');
  await noHScroll(p, 'membership');
  await p.click('button:has-text("Claim 3 free months")');
  await p.waitForURL('**/members/**');
  await p.click('text=Send a message request');
  await p.fill('.sheet textarea', 'Hello Mark, I enjoyed your introduction.');
  await p.click('button:has-text("Send request")');
  await p.getByText('Request sent').waitFor();
  step('accept David and chat');
  await p.goto(BASE + '/messages');
  await p.getByText('Requests · 2').waitFor();
  await shot(p, 'requests');
  await p.locator('.card', { hasText: 'David, 36' }).locator('button:has-text("Accept")').click();
  await p.waitForURL('**/messages/**');
  await p.fill('textarea[aria-label=Message]', 'Thank you, David! We sing every Sunday. Do you sing too?');
  await p.click('button[aria-label=Send]');
  await p.getByText('Do you sing too?').waitFor();
  await shot(p, 'conversation');
  await p.click('button[aria-label="Block or report"]');
  await p.check('text=Asking for money');
  await shot(p, 'block-report');
  await p.keyboard.press('Escape');
  step('privacy');
  await p.goto(BASE + '/me');
  await p.getByText('Privacy and your data').waitFor();
  await p.click('text=Blocked members');
  await shot(p, 'privacy', true);
  await noHScroll(p, 'me');
  await p.context().close();
}

// 3. David replaces his photo: goes back to review and disappears
{
  const p = await ctx(phone);
  await login(p, 'david@example.com', env.seedPassword);
  await p.waitForURL('**/discover');
  await p.goto(BASE + '/join/media');
  await p.click('text=Use a sample photo');
  await p.getByText('Send your profile back for review?').waitFor();
  await p.click('button:has-text("Replace photo and send for review")');
  await p.getByText('back with our team').waitFor({ timeout: 20000 });
  await p.goto(BASE + '/discover');
  await p.waitForURL('**/status');
  await p.context().close();
  const r = await ctx(phone);
  await login(r, 'ruth@example.com', 'Ruth-demo-2026');
  await r.waitForURL('**/discover');
  await r.goto(davidUrl);
  if (!(await r.getByText("This page isn't available").count())) problems.push('David still visible after replacing photo');
  await r.context().close();
}

// 4. Moderator (desktop)
{
  const p = await ctx(desktop);
  await login(p, 'anna@example.com', 'Anna-moderator-2026', '/mod/login');
  await p.waitForURL(BASE + '/mod');
  await p.getByText('Hannah W').waitFor().catch(() => {});
  await p.click('.q-item:has-text("Daniel")');
  await p.getByRole('heading', { name: /Daniel P\./ }).waitFor();
  await p.click('.mod-video button');
  await p.waitForFunction(() => { const v = document.querySelector('.mod-video video'); return v && v.readyState >= 2; }, null, { timeout: 15000 })
    .catch(() => problems.push('moderator video did not load'));
  await shot(p, 'mod-queue');
  await noHScroll(p, 'mod queue');
  step('reject without reason is blocked');
  await p.click('button:has-text("Reject with reason")');
  await p.getByText('Choose a reason before rejecting').waitFor();
  await p.selectOption('.queue-main select', 'photo_dark');
  await p.fill('textarea >> nth=1', 'Checked against the video; lighting too low.');
  await p.click('button:has-text("Reject with reason")');
  await p.getByText('asked for a change').waitFor();
  step('approve the new applicant');
  await p.click('.q-item:has-text("Hannah")');
  await p.getByRole('heading', { name: /Hannah/ }).waitFor();
  await p.click('button:has-text("Approve")');
  await p.getByText('approved and now visible').waitFor();
  await p.click('text=Changed');
  await p.getByText('David K., 36').waitFor();
  await p.click('a:has-text("Reports")');
  await p.getByText('Messages flagged by screening').first().waitFor();
  await shot(p, 'mod-reports', true);
  await p.click('a:has-text("Members")');
  await p.getByRole('heading', { name: 'Audit log' }).waitFor();
  await p.getByText('rejected Daniel P.').first().waitFor();
  await shot(p, 'mod-members', true);
  await p.context().close();
  const m = await ctx(phone);
  await login(m, 'anna@example.com', 'Anna-moderator-2026', '/mod/login');
  await m.waitForURL(BASE + '/mod');
  await m.getByText('Review queue').first().waitFor();
  await shot(m, 'mod-queue-phone', true);
  await noHScroll(m, 'mod phone');
  await m.context().close();
}

// 5. Rejected, suspended, banned
{
  const p = await ctx(phone);
  await login(p, 'daniel@example.com', 'Daniel-demo-2026');
  await p.waitForURL('**/status');
  await p.getByText('A small change is needed').waitFor();
  await shot(p, 'changes-requested');
  await p.click('text=Upload a new photo');
  await p.waitForURL('**/join/media');
  await p.click('text=Use a sample photo');
  await p.getByText('back with our team').waitFor({ timeout: 20000 });
  await p.click('text=Done');
  await p.getByText('Thank you, Daniel').waitFor();
  await p.context().close();

  const v = await ctx(phone);
  await login(v, 'victor@example.com', env.seedPassword);
  await v.waitForURL('**/status');
  await v.getByText('Your account is paused').waitFor();
  await shot(v, 'suspended');
  await v.click('button:has-text("Ask for a review")');
  await v.getByText('Review requested').waitFor();
  await v.context().close();

  const k = await ctx(phone);
  await login(k, 'kevin@example.com', env.seedPassword);
  await k.waitForURL('**/status');
  await k.getByText('Your account has been closed').waitFor();
  await k.context().close();
}

// 6. Desktop member view + Reset demo
{
  const p = await ctx(desktop);
  await login(p, 'ruth@example.com', 'Ruth-demo-2026');
  await p.waitForURL('**/discover');
  await p.getByText('Grace, 31').waitFor();
  await shot(p, 'discover-desktop');
  await p.context().close();
  const m = await ctx(desktop);
  await login(m, 'anna@example.com', 'Anna-moderator-2026', '/mod/login');
  await m.waitForURL(BASE + '/mod');
  await m.click('a:has-text("Members")');
  await m.click('button:has-text("Reset demo")');
  await m.locator('.sheet button:has-text("Reset demo")').click();
  await m.getByText('Demo restored').waitFor({ timeout: 30000 });
  await m.context().close();
}

await browser.close();
const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true });
if (count !== 17) problems.push(`after reset expected 17 profiles, found ${count}`);
console.log(problems.length ? `\nPROBLEMS:\n${problems.join('\n')}` : '\nWalkthrough clean: no errors, no horizontal scroll, reset restored the seed.');
process.exit(problems.length ? 1 : 0);
