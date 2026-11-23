# Verified community (demo)

A faith-based community where every member is approved by a person, by video, before anyone can see them.
Phase 1 demo: joining and verification, moderation, discover, profiles, message requests, block and report,
membership concept, privacy controls and account status screens.

**Stack:** Next.js 15 (App Router, TypeScript) on Vercel · Supabase (Postgres, row-level security, Auth, private Storage).

## Security model

Visibility is enforced in the database, not in the screens.

- **Members can only read their own rows.** `profiles`, `consents`, `blocks` and the rest have RLS policies that return
  only the caller's own data. No table accepts direct writes from the API (`insert/update/delete` revoked for `anon` and
  `authenticated`). Every change goes through a `security definer` function that checks the caller first.
- **Other members are reached only through functions** (`discover`, `get_member`, `my_conversations`, `get_conversation`)
  that apply one rule (`_can_see`): both people approved and not hidden, the viewer is not the target, neither has blocked
  the other. A pending, rejected, suspended, banned, hidden or blocked profile returns nothing, so its URL is a 404.
- **Private media.** Bucket `media` is private. Files are reachable only through signed URLs that expire after 5 minutes.
  The signing itself is guarded by a storage policy (`can_view_media`): another member can sign only the exact photo or
  video attached to an approved profile they are allowed to see, and only if its owner's visibility setting allows it
  (`approved members` or `only people I accept`). An unreviewed upload in the same folder is not reachable.
- **Re-review on change.** Attaching a new photo or video (`set_my_media`) puts an approved or rejected member back to
  `pending`, which hides them immediately.
- **Staff** are rows in `staff`, a table nobody can write to through the API (including staff). Moderator functions call
  `_require_staff()`; admin-only ones check `is_admin()`. Every decision writes to `audit_log`, which members and staff
  can't edit.
- **Moderators see flagged messages only**, never ordinary conversations.
- **Service key** is used server-side only (account creation without email codes, account deletion, demo reset, daily
  health check). It is never sent to the browser.
- **18+** is enforced in `create_my_profile` (and earlier in the sign-up route). Each consent is stored with date and
  version; faith answers are stored only with the separate faith-data consent and are removed when it is withdrawn.

## Demo logins

| Role | Email | Password |
| --- | --- | --- |
| Moderator and admin | `anna@example.com` | `Anna-moderator-2026` (sign in at `/mod/login`) |
| Approved member | `ruth@example.com` | `Ruth-demo-2026` |
| Pending member | `daniel@example.com` | `Daniel-demo-2026` |

Seed: 9 approved members (Spain, Portugal, Ireland, Italy, UK) plus one auto-hidden after 3 reports, 2 more pending,
1 rejected, 1 suspended, 1 banned, existing requests, a conversation, screened messages and an audit history.
**Members → Reset demo** (moderator) restores all of it and removes accounts created during testing.

## Run locally

```bash
cp .env.example .env.local        # fill in the Supabase URL, anon key and service key
npm install
supabase link --project-ref <ref> && supabase db push
./scripts/make-media.sh           # abstract sample photos and videos (ffmpeg)
node scripts/seed.mjs             # demo accounts, media and seed data
npm run dev
```

## Tests

```bash
node tests/access-rules.mjs <base-url>   # access rules through the public API; writes deliverables/access-rules-report.{html,pdf}
node tests/walkthrough.mjs <base-url>    # browser click-through at phone and desktop sizes; screenshots in test-results/shots
```

Both reset the demo data before and after running.

## Notes for production

- Video: swap the private bucket for Cloudflare Stream (signed playback tokens, same 5-minute pattern) with resumable
  uploads for 2–5 minute recordings. The demo caps uploads at 50 MB.
- Payments: the membership screen is a concept in demo mode; no payment is taken.
- Staff sign-in should require TOTP (Supabase MFA) before launch.
- Detected country comes from the hosting edge's IP country header and is shown to moderators only.
