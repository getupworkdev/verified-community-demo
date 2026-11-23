-- Demo seed. Restores the community to a known state. Only the service role
-- (server-side) can run it; the app calls it after verifying a staff session.

create or replace function public.reset_demo_data() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  -- Remove every account that is not part of the demo seed.
  delete from auth.users where email not in (select email from demo_accounts);

  delete from messages where true;
  delete from conversations where true;
  delete from blocks where true;
  delete from reports where true;
  delete from review_notes where true;
  delete from audit_log where true;
  delete from consents where true;
  delete from profiles where true;
  delete from staff where true;
  update app_settings set founding_total = 500, founding_claimed = 188 where true;

  insert into staff (user_id, role, display_name)
  select u.id, s.role, s.name
  from (values ('anna@example.com', 'admin', 'Anna'), ('lucy@example.com', 'moderator', 'Lucy')) s(email, role, name)
  join auth.users u on u.email = s.email;

  insert into profiles (
    id, first_name, last_name, dob, country, country_code, city, faith, languages, about, community,
    looking_for, answers, prompt4, prompt5, status, review_kind, submitted_at, decided_at, decision_reason,
    decision_items, suspended_until, report_hidden, photo_path, video_path, video_seconds,
    photo_visibility, video_visibility, detected_country, languages_confirmed, membership,
    membership_until, hue, created_at)
  select u.id, v.first, v.last,
    (current_date - make_interval(years => v.age) - make_interval(days => 20 + v.hue * 37))::date,
    v.country, v.cc, v.city, v.faith, v.langs, v.about, '[Field]', v.looking,
    '{"children": "No", "relocate": "Open to it", "church_attendance": "Weekly"}'::jsonb,
    'What does a good Sunday look like for you?', 'What are you grateful for this week?',
    v.status, v.kind,
    now() - make_interval(hours => v.submitted_h),
    case when v.status in ('approved', 'rejected', 'suspended', 'banned') then now() - make_interval(hours => v.submitted_h - 6) end,
    v.reason, v.items::jsonb,
    case when v.status = 'suspended' then (current_date + 21)::timestamptz end,
    v.hidden,
    u.id || '/photo-seed.jpg', u.id || '/video-seed.mp4', v.secs,
    v.photo_vis, v.video_vis, v.detected, case when v.status = 'approved' then true end,
    v.membership,
    case v.membership when 'complimentary' then date '2027-03-31' when 'founding' then (current_date + 64) when 'paid' then (current_date + 20) end,
    v.hue, now() - make_interval(hours => v.submitted_h + 2)
  from (values
    ('ruth@example.com',   'Ruth',   'Martin',   34, 'Spain', 'ES', 'Valencia',   '[Faith option 1]', array['English','Spanish'],
      'Primary school teacher and alto in our church choir. I love long walks by the sea and Sunday lunches that last all afternoon.',
      'Marriage', 'approved', 'new', 80, null, '{}', false, 'members', 'accepted', 'ES', 'none', 0, 22),
    ('david@example.com',  'David',  'Kane',     36, 'Spain', 'ES', 'Madrid',     '[Faith option 1]', array['English','Spanish'],
      'Teacher, choir member and keen walker. Looking for someone to build a faithful, joyful home with.',
      'Marriage', 'approved', 'new', 100, null, '{}', false, 'members', 'members', 'ES', 'paid', 0, 24),
    ('james@example.com',  'James',  'Turner',   38, 'Spain', 'ES', 'Seville',    '[Faith option 2]', array['English'],
      'Architect who restores old chapels in my spare time. Happiest on a mountain path with a flask of tea.',
      'Marriage', 'approved', 'new', 110, null, '{}', false, 'members', 'members', 'ES', 'founding', 1, 21),
    ('samuel@example.com', 'Samuel', 'Okafor',   33, 'Spain', 'ES', 'Valencia',   '[Faith option 1]', array['Spanish'],
      'Nurse on the night shift, so I treasure quiet mornings, good coffee and an early service.',
      'Marriage', 'approved', 'new', 120, null, '{}', false, 'accepted', 'accepted', 'ES', 'none', 3, 19),
    ('mark@example.com',   'Mark',   'Lewis',    41, 'Spain', 'ES', 'Malaga',     '[Faith option 3]', array['English'],
      'Widower and father of one. I run a small bakery and volunteer at our food bank on Thursdays.',
      'Marriage', 'approved', 'new', 130, null, '{}', false, 'members', 'members', 'ES', 'none', 2, 23),
    ('grace@example.com',  'Grace',  'Adeyemi',  31, 'Portugal', 'PT', 'Lisbon', '[Faith option 1]', array['Portuguese','English'],
      'Pharmacist, cellist and an enthusiastic but terrible gardener.',
      'Friendship first', 'approved', 'new', 140, null, '{}', false, 'members', 'members', 'PT', 'none', 1, 20),
    ('thomas@example.com', 'Thomas', 'Byrne',    39, 'Ireland', 'IE', 'Dublin',   '[Faith option 2]', array['English','Irish'],
      'Secondary school history teacher. I help run our parish youth group on Saturdays.',
      'Marriage', 'approved', 'new', 200, null, '{}', false, 'members', 'members', 'IE', 'founding', 0, 25),
    ('elena@example.com',  'Elena',  'Rossi',    35, 'Italy', 'IT', 'Rome',       '[Faith option 1]', array['Italian','English'],
      'Translator and keen cook. Family is everything to me, and I would love to build one.',
      'Marriage', 'approved', 'new', 180, null, '{}', false, 'members', 'accepted', 'IT', 'none', 2, 22),
    ('john@example.com',   'Pastor John', 'Lowe', 52, 'United Kingdom', 'GB', 'London', '[Faith option 3]', array['English'],
      'Pastor of a small congregation in south London. Here to help, and open to meeting someone special.',
      'Marriage', 'approved', 'new', 160, null, '{}', false, 'members', 'members', 'GB', 'complimentary', 1, 26),
    ('sarah@example.com',  'Sarah',  'Price',    32, 'United Kingdom', 'GB', 'Manchester', '[Faith option 1]', array['English'],
      'Love travelling and meeting new people.',
      'Marriage', 'approved', 'new', 150, null, '{}', true, 'members', 'members', 'NG', 'none', 3, 18),
    ('tom@example.com',    'Tom',    'Reed',     37, 'Spain', 'ES', 'Madrid',     '[Faith option 2]', array['English','Spanish'],
      'Football on Saturdays, church on Sundays.',
      'Marriage', 'approved', 'new', 140, null, '{}', false, 'members', 'members', 'ES', 'paid', 2, 20),
    ('daniel@example.com', 'Daniel', 'Pereira',  29, 'Spain', 'ES', 'Barcelona',  '[Faith option 1]', array['English','Spanish'],
      'Software tester, amateur guitarist and proud uncle of three.',
      'Marriage', 'pending', 'new', 2, null, '{}', false, 'members', 'accepted', 'ES', 'none', 1, 23),
    ('lucia@example.com',  'Lucia',  'Fernandez', 30, 'Spain', 'ES', 'Granada',   '[Faith option 2]', array['Spanish'],
      'Physiotherapist. I sing in a gospel choir and swim most mornings.',
      'Marriage', 'pending', 'new', 50, null, '{}', false, 'members', 'accepted', 'ES', 'none', 2, 21),
    ('peter@example.com',  'Peter',  'Schmidt',  37, 'Germany', 'DE', 'Berlin',   '[Faith option 3]', array['German','English'],
      'Engineer, cyclist and organist at our local church.',
      'Marriage', 'pending', 'changed', 9, null, '{}', false, 'members', 'accepted', 'AT', 'none', 0, 24),
    ('paul@example.com',   'Paul',   'Duarte',   40, 'Portugal', 'PT', 'Porto',   '[Faith option 1]', array['Portuguese'],
      'Carpenter. I build furniture and the occasional church pew.',
      'Marriage', 'rejected', 'new', 30,
      'Your photo is too dark for us to compare it with your video. Please upload a clear, well-lit photo of your face.',
      '{"photo": "needs_update", "video": "ok", "details": "ok"}', false, 'members', 'accepted', 'PT', 'none', 3, 20),
    ('victor@example.com', 'Victor', 'Hale',     45, 'France', 'FR', 'Lyon',      '[Faith option 2]', array['French','English'],
      'Retired officer, keen sailor.',
      'Marriage', 'suspended', 'new', 400, 'Messages that went against our community guidelines.', '{}', false,
      'members', 'members', 'FR', 'none', 1, 22),
    ('kevin@example.com',  'Kevin',  'Brooks',   39, 'United States', 'US', 'Austin', '[Faith option 1]', array['English'],
      'Businessman travelling often.',
      'Marriage', 'banned', 'new', 500, 'Repeatedly asked members for money.', '{}', false,
      'members', 'members', 'GH', 'none', 3, 18)
  ) v(email, first, last, age, country, cc, city, faith, langs, about, looking, status, kind, submitted_h,
      reason, items, hidden, photo_vis, video_vis, detected, membership, hue, secs)
  join auth.users u on u.email = v.email;

  -- Consents for every seeded member.
  insert into consents (user_id, kind, version, granted, created_at)
  select p.id, k.kind, k.version, true, p.created_at
  from profiles p cross join (values ('age_18', 'age-v1'), ('terms_privacy', 'terms-2026-11'), ('faith_data', 'faith-v1')) k(kind, version);

  -- Conversations and messages.
  create temp table _seed_conv (k text, a text, b text, status text, hours int) on commit drop;
  insert into _seed_conv values
    ('david_ruth', 'david', 'ruth', 'pending', 2),
    ('james_ruth', 'james', 'ruth', 'pending', 26),
    ('thomas_ruth', 'thomas', 'ruth', 'accepted', 72),
    ('sarah_mark', 'sarah', 'mark', 'accepted', 120),
    ('sarah_james', 'sarah', 'james', 'accepted', 110),
    ('sarah_elena', 'sarah', 'elena', 'accepted', 100),
    ('tom_grace', 'tom', 'grace', 'accepted', 60);

  insert into conversations (requester, recipient, status, created_at, responded_at)
  select a.id, b.id, c.status, now() - make_interval(hours => c.hours),
         case when c.status = 'accepted' then now() - make_interval(hours => c.hours - 1) end
  from _seed_conv c
  join auth.users a on a.email = c.a || '@example.com'
  join auth.users b on b.email = c.b || '@example.com';

  insert into messages (conversation_id, sender, body, flag_reason, created_at)
  select cv.id, s.id, m.body, public._screen(m.body), now() - make_interval(mins => m.mins_ago)
  from (values
    ('david', 'ruth', 'david', 'Hello Ruth, I enjoyed your introduction, especially what you said about your choir. I''d love to talk.', 120),
    ('james', 'ruth', 'james', 'Hi Ruth, we seem to share a love of long walks. Would you like to talk?', 1560),
    ('thomas', 'ruth', 'thomas', 'Hello Ruth, your introduction made me smile. How long have you sung in the choir?', 4300),
    ('thomas', 'ruth', 'ruth', 'Hello Thomas! About six years now. We sing every Sunday morning.', 4200),
    ('thomas', 'ruth', 'thomas', 'That''s lovely. I help with the youth group on Saturdays, so Sunday is my quiet day.', 4100),
    ('sarah', 'mark', 'sarah', 'Hello Mark, your bakery sounds wonderful.', 7100),
    ('sarah', 'mark', 'mark', 'Thank you Sarah, it keeps me busy!', 7000),
    ('sarah', 'mark', 'sarah', 'I am in a difficult situation. Could you send me money through Western Union? I will pay you back.', 6900),
    ('sarah', 'james', 'sarah', 'James, I need help with a bank transfer for my ticket to come and visit you.', 6500),
    ('sarah', 'elena', 'sarah', 'Could you lend me 200 euros? I will explain later.', 5900),
    ('tom', 'grace', 'grace', 'Hello Tom, nice to meet you.', 3500),
    ('tom', 'grace', 'tom', 'You are stupid if you think nobody else will message me.', 3400)
  ) m(a, b, sender, body, mins_ago)
  join auth.users ua on ua.email = m.a || '@example.com'
  join auth.users ub on ub.email = m.b || '@example.com'
  join auth.users s on s.email = m.sender || '@example.com'
  join conversations cv on cv.requester = ua.id and cv.recipient = ub.id;

  -- Blocks.
  insert into blocks (blocker, blocked, created_at)
  select a.id, b.id, now() - make_interval(hours => x.hours)
  from (values ('ruth', 'tom', 40), ('ruth', 'kevin', 200), ('mark', 'sarah', 9),
               ('james', 'sarah', 7), ('elena', 'sarah', 5)) x(a, b, hours)
  join auth.users a on a.email = x.a || '@example.com'
  join auth.users b on b.email = x.b || '@example.com';

  -- Reports.
  insert into reports (reporter, reported, reason, details, created_at)
  select a.id, b.id, x.reason, x.details, now() - make_interval(hours => x.hours)
  from (values
    ('mark', 'sarah', 'money', 'Asked me to send money by Western Union.', 9),
    ('james', 'sarah', 'money', null, 7),
    ('elena', 'sarah', 'money', 'Asked to borrow 200 euros.', 5),
    ('grace', 'tom', 'inappropriate', 'Rude message after I said hello.', 50),
    ('mark', 'elena', 'fake_profile', 'Voice in the video did not seem to match.', 20),
    ('thomas', 'elena', 'fake_profile', null, 12)
  ) x(a, b, reason, details, hours)
  join auth.users a on a.email = x.a || '@example.com'
  join auth.users b on b.email = x.b || '@example.com';
  update profiles set review_kind = 'flagged' where report_hidden;

  -- Private moderator notes.
  insert into review_notes (profile_id, author_name, note, created_at)
  select u.id, 'Lucy', 'Replaced his video after we asked for better lighting. Detected country is Austria; profile says Berlin. Worth a look.', now() - interval '8 hours'
  from auth.users u where u.email = 'peter@example.com';

  -- Audit history.
  insert into audit_log (actor_id, actor_name, action, target_id, target_name, detail, created_at)
  select a.user_id, x.actor, x.action, p.id, _short(p.first_name, p.last_name), x.detail,
         now() - make_interval(mins => x.mins)
  from (values
    ('Anna', 'approved', 'ruth', 'languages heard in video', 4300),
    ('Anna', 'gave complimentary access to', 'john', 'until 31 Mar 2027', 1500),
    ('Lucy', 'suspended', 'victor', 'until ' || to_char(current_date + 21, 'DD Mon'), 1200),
    ('Anna', 'rejected', 'paul', 'Photo too dark to compare with the video', 1000),
    ('Lucy', 'banned', 'kevin', 'Repeatedly asked members for money.', 6000)
  ) x(actor, action, target, detail, mins)
  join auth.users u on u.email = x.target || '@example.com'
  join profiles p on p.id = u.id
  left join staff a on a.display_name = x.actor;

  insert into audit_log (actor_name, action, target_id, target_name, created_at)
  select 'System', 'auto-hid profile after 3 reports', p.id, 'Sarah P.', now() - interval '5 hours'
  from profiles p join auth.users u on u.id = p.id where u.email = 'sarah@example.com';
end;
$$;

revoke execute on function public.reset_demo_data() from public, anon, authenticated;
grant execute on function public.reset_demo_data() to service_role;

-- Lightweight health check used by the daily keep-alive cron.
create or replace function public.health() returns int
language sql stable security definer set search_path = public as $$ select count(*)::int from profiles; $$;
revoke execute on function public.health() from public, anon, authenticated;
grant execute on function public.health() to service_role;
