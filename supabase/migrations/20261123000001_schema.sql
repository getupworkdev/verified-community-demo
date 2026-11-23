-- Verified community: schema, row-level security and member/staff functions.
-- Principle: members can only ever read their own rows directly. Everything about
-- other members goes through security-definer functions that apply the visibility
-- rules (approved, not hidden, not blocked, photo/video visibility).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.staff (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('moderator', 'admin')),
  display_name text not null
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 40),
  last_name text not null default '' check (char_length(last_name) <= 40),
  dob date not null,
  country text not null,
  country_code text not null,
  city text not null,
  faith text,                                   -- stored only with the separate faith-data consent
  languages text[] not null default '{}',
  about text not null default '' check (char_length(about) <= 600),
  community text not null default '' check (char_length(community) <= 80),
  looking_for text not null default 'Marriage',
  answers jsonb not null default '{}',
  prompt4 text,
  prompt5 text,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'suspended', 'banned')),
  review_kind text not null default 'new' check (review_kind in ('new', 'changed', 'flagged')),
  submitted_at timestamptz,
  decided_at timestamptz,
  decision_reason text,
  decision_items jsonb not null default '{}',
  suspended_until timestamptz,
  appeal_requested_at timestamptz,
  report_hidden boolean not null default false,
  photo_path text,
  video_path text,
  video_seconds int,
  photo_visibility text not null default 'members' check (photo_visibility in ('members', 'accepted')),
  video_visibility text not null default 'accepted' check (video_visibility in ('members', 'accepted')),
  detected_country text,
  languages_confirmed boolean,
  membership text not null default 'none' check (membership in ('none', 'founding', 'paid', 'complimentary')),
  membership_until date,
  hue int not null default 0,
  created_at timestamptz not null default now()
);

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('age_18', 'terms_privacy', 'faith_data')),
  version text not null,
  granted boolean not null,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles on delete cascade,
  recipient uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester <> recipient)
);
create unique index conversations_pair on public.conversations
  (least(requester, recipient), greatest(requester, recipient));

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations on delete cascade,
  sender uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  flag_reason text,
  created_at timestamptz not null default now()
);
create index messages_conv on public.messages (conversation_id, created_at);

create table public.blocks (
  blocker uuid not null references public.profiles on delete cascade,
  blocked uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references public.profiles on delete cascade,
  reported uuid not null references public.profiles on delete cascade,
  reason text not null check (reason in ('fake_profile', 'money', 'inappropriate', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);
create unique index reports_one_open on public.reports (reporter, reported) where status = 'open';

create table public.review_notes (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles on delete cascade,
  author_name text not null,
  note text not null check (char_length(note) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text not null,
  action text not null,
  target_id uuid,
  target_name text,
  detail text,
  created_at timestamptz not null default now()
);
create index audit_log_time on public.audit_log (created_at desc);

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  founding_total int not null default 500,
  founding_claimed int not null default 188
);
insert into public.app_settings default values;

-- Accounts that make up the demo seed; anything else is removed by a demo reset.
create table public.demo_accounts (
  email text primary key
);

-- ---------------------------------------------------------------------------
-- Row-level security. Every table has RLS on. No table accepts direct writes
-- from the API: all writes go through the functions below.
-- ---------------------------------------------------------------------------

alter table public.staff enable row level security;
alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.review_notes enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_settings enable row level security;
alter table public.demo_accounts enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.staff, public.profiles, public.consents, public.blocks,
  public.reports, public.review_notes, public.audit_log to authenticated;
-- Conversations and messages: members may read only these columns (status of a
-- declined request and screening flags are never exposed directly).
grant select (id, requester, recipient, created_at) on public.conversations to authenticated;
grant select (id, conversation_id, sender, body, created_at) on public.messages to authenticated;

create or replace function public._short(f text, l text) returns text language sql immutable as $$ select f || case when coalesce(l, '') <> '' then ' ' || left(l, 1) || '.' else '' end; $$;

-- Policy helpers: they only ever answer questions about the caller.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'admin');
$$;

-- Internal helpers (not callable through the API).
create or replace function public._is_active(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = uid and not report_hidden
      and (status = 'approved' or (status = 'suspended' and suspended_until < now()))
  );
$$;

create or replace function public._blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

create or replace function public._can_see(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and target is not null and viewer <> target
    and _is_active(viewer) and _is_active(target) and not _blocked(viewer, target);
$$;

create or replace function public._connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations
    where status = 'accepted'
      and ((requester = a and recipient = b) or (requester = b and recipient = a))
  );
$$;

create or replace function public._media_allowed(viewer uuid, owner uuid, kind text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  if viewer is null or owner is null then return false; end if;
  if viewer = owner then return true; end if;
  if exists (select 1 from staff where user_id = viewer) then return true; end if;
  if not _can_see(viewer, owner) then return false; end if;
  select * into p from profiles where id = owner;
  if kind = 'photo' then
    return p.photo_visibility = 'members' or _connected(viewer, owner);
  elsif kind = 'video' then
    return p.video_visibility = 'members' or _connected(viewer, owner);
  end if;
  return false;
end;
$$;

-- Storage check: may the caller read (and therefore sign) this object?
-- Other members can only reach the exact files on an approved profile,
-- never an unreviewed upload sitting in the same folder.
create or replace function public.can_view_media(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  owner uuid;
  p profiles;
  folder text := split_part(object_name, '/', 1);
begin
  if auth.uid() is null then return false; end if;
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  owner := folder::uuid;
  if owner = auth.uid() then return true; end if;
  if exists (select 1 from staff where user_id = auth.uid()) then return true; end if;
  select * into p from profiles where id = owner;
  if not found then return false; end if;
  if object_name = p.photo_path then return _media_allowed(auth.uid(), owner, 'photo'); end if;
  if object_name = p.video_path then return _media_allowed(auth.uid(), owner, 'video'); end if;
  return false;
end;
$$;

create or replace function public.can_upload_media(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and split_part(object_name, '/', 1) = auth.uid()::text
    and exists (select 1 from profiles where id = auth.uid() and status not in ('suspended', 'banned'));
$$;

create or replace function public.blocked_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _blocked(auth.uid(), other);
$$;

create or replace function public.me_active() returns boolean
language sql stable security definer set search_path = public as $$
  select _is_active(auth.uid());
$$;

create policy staff_read_self on public.staff for select to authenticated
  using (user_id = auth.uid());

create policy profiles_read_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy consents_read_own on public.consents for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy blocks_read_own on public.blocks for select to authenticated
  using (blocker = auth.uid());

create policy conversations_read_participant on public.conversations for select to authenticated
  using (
    auth.uid() in (requester, recipient)
    and public.me_active()
    and not public.blocked_with(case when requester = auth.uid() then recipient else requester end)
  );

create policy messages_read_participant on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and auth.uid() in (c.requester, c.recipient)
        and (c.status <> 'declined' or sender = auth.uid())
    )
    and public.me_active()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and not public.blocked_with(case when c.requester = auth.uid() then c.recipient else c.requester end)
    )
  );

create policy reports_staff on public.reports for select to authenticated using (public.is_staff());
create policy notes_staff on public.review_notes for select to authenticated using (public.is_staff());
create policy audit_staff on public.audit_log for select to authenticated using (public.is_staff());
-- app_settings and demo_accounts: no policies, so nobody reads them directly.

-- ---------------------------------------------------------------------------
-- Storage: private bucket, signed URLs only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false;

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.can_view_media(name));

create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_upload_media(name));
-- No update or delete policies: files cannot be overwritten in place.

-- ---------------------------------------------------------------------------
-- Internal utilities
-- ---------------------------------------------------------------------------

create or replace function public._audit(p_action text, p_target uuid, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  actor text;
  tname text;
begin
  select display_name into actor from staff where user_id = auth.uid();
  if actor is null then
    select _short(first_name, last_name) into actor from profiles where id = auth.uid();
  end if;
  select _short(first_name, last_name) into tname from profiles where id = p_target;
  insert into audit_log (actor_id, actor_name, action, target_id, target_name, detail)
  values (auth.uid(), coalesce(actor, 'System'), p_action, p_target, tname, p_detail);
end;
$$;

create or replace function public._age(d date) returns int
language sql immutable as $$ select date_part('year', age(current_date, d))::int; $$;

create or replace function public._screen(body text) returns text
language sql immutable as $$
  select case
    when body ~* '(bank|iban|transfer|western union|moneygram|gift ?card|crypto|bitcoin|paypal|send (me )?money|lend me|loan|wire)'
      then 'money'
    when body ~* '(stupid|idiot|ugly|shut up|hate you|worthless|loser)'
      then 'harassment'
    else null end;
$$;

create or replace function public._require_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from staff where user_id = auth.uid()) then
    raise exception 'staff_only' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._require_active() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not _is_active(auth.uid()) then
    raise exception 'not_approved' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Member functions: joining and verification
-- ---------------------------------------------------------------------------

create or replace function public.create_my_profile(
  p_first_name text, p_last_name text, p_dob date,
  p_country text, p_country_code text, p_city text,
  p_faith text, p_languages text[],
  p_consent_age boolean, p_consent_terms boolean, p_consent_faith boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if exists (select 1 from staff where user_id = auth.uid()) then
    raise exception 'staff_cannot_join' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_exists';
  end if;
  if p_dob is null or p_dob > (current_date - interval '18 years')::date then
    raise exception 'under_18' using errcode = '22023';
  end if;
  if not coalesce(p_consent_age, false) or not coalesce(p_consent_terms, false) then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if coalesce(array_length(p_languages, 1), 0) = 0 then
    raise exception 'languages_required' using errcode = '22023';
  end if;
  insert into profiles (id, first_name, last_name, dob, country, country_code, city, faith, languages, hue)
  values (auth.uid(), trim(p_first_name), trim(coalesce(p_last_name, '')), p_dob, p_country,
          upper(p_country_code), trim(p_city),
          case when p_consent_faith then p_faith end, p_languages, floor(random() * 4)::int);
  insert into consents (user_id, kind, version, granted) values
    (auth.uid(), 'age_18', 'age-v1', true),
    (auth.uid(), 'terms_privacy', 'terms-2026-11', true),
    (auth.uid(), 'faith_data', 'faith-v1', coalesce(p_consent_faith, false));
end;
$$;

create or replace function public.set_faith_consent(p_granted boolean, p_faith text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'no_profile'; end if;
  insert into consents (user_id, kind, version, granted) values (auth.uid(), 'faith_data', 'faith-v1', p_granted);
  update profiles set faith = case when p_granted then coalesce(p_faith, faith) end where id = auth.uid();
end;
$$;

create or replace function public.update_my_details(
  p_about text, p_community text, p_looking_for text, p_answers jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set
    about = left(coalesce(p_about, ''), 600),
    community = left(coalesce(p_community, ''), 80),
    looking_for = coalesce(nullif(p_looking_for, ''), 'Marriage'),
    answers = coalesce(p_answers, '{}')
  where id = auth.uid() and status not in ('suspended', 'banned');
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
end;
$$;

create or replace function public.set_my_prompts(p_prompt4 text, p_prompt5 text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set prompt4 = p_prompt4, prompt5 = p_prompt5
  where id = auth.uid() and status not in ('suspended', 'banned');
end;
$$;

-- Attach an uploaded file. Replacing a photo or video always sends the
-- profile back to human review, and it disappears from Discover meanwhile.
create or replace function public.set_my_media(p_kind text, p_path text, p_seconds int default null)
returns text language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid();
  if not found then raise exception 'no_profile'; end if;
  if p.status in ('suspended', 'banned') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_kind not in ('photo', 'video') then raise exception 'bad_kind'; end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'bad_path' using errcode = '42501'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'media' and name = p_path) then
    raise exception 'file_not_found';
  end if;
  if p_kind = 'photo' then
    update profiles set photo_path = p_path where id = auth.uid();
  else
    update profiles set video_path = p_path, video_seconds = p_seconds where id = auth.uid();
  end if;
  if p.status in ('approved', 'rejected') then
    update profiles set status = 'pending', review_kind = 'changed', submitted_at = now()
    where id = auth.uid();
    perform _audit('replaced ' || p_kind || ', sent back to review', auth.uid());
    return 'pending';
  end if;
  return p.status;
end;
$$;

create or replace function public.submit_for_review() returns text
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid();
  if not found then raise exception 'no_profile'; end if;
  if p.photo_path is null or p.video_path is null then raise exception 'media_required' using errcode = '22023'; end if;
  if p.prompt4 is null or p.prompt5 is null then raise exception 'prompts_required' using errcode = '22023'; end if;
  if p.status = 'pending' then return 'pending'; end if;
  if p.status not in ('draft', 'rejected') then raise exception 'not_allowed' using errcode = '42501'; end if;
  update profiles set status = 'pending',
    review_kind = case when p.status = 'rejected' then 'changed' else 'new' end,
    submitted_at = now()
  where id = auth.uid();
  perform _audit('submitted for review', auth.uid());
  return 'pending';
end;
$$;

-- The caller's own state. Expired suspensions lift here.
create or replace function public.my_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  if auth.uid() is null then return jsonb_build_object('signed_in', false); end if;
  if exists (select 1 from staff where user_id = auth.uid()) then
    return jsonb_build_object('signed_in', true, 'staff', true);
  end if;
  update profiles set status = 'approved', suspended_until = null, decision_reason = null
  where id = auth.uid() and status = 'suspended' and suspended_until < now();
  select * into p from profiles where id = auth.uid();
  if not found then return jsonb_build_object('signed_in', true, 'profile', false); end if;
  return jsonb_build_object(
    'signed_in', true, 'profile', true, 'id', p.id, 'first_name', p.first_name,
    'status', case when p.report_hidden and p.status = 'approved' then 'hidden' else p.status end,
    'reason', p.decision_reason, 'items', p.decision_items,
    'suspended_until', p.suspended_until, 'appeal_requested_at', p.appeal_requested_at,
    'has_photo', p.photo_path is not null, 'has_video', p.video_path is not null,
    'has_prompts', p.prompt4 is not null
  );
end;
$$;

create or replace function public.request_appeal(p_text text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set appeal_requested_at = now()
  where id = auth.uid() and status in ('suspended', 'banned') and appeal_requested_at is null;
  if found then perform _audit('asked for a second review', auth.uid(), left(p_text, 300)); end if;
end;
$$;

create or replace function public.set_visibility(p_photo text, p_video text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_photo not in ('members', 'accepted') or p_video not in ('members', 'accepted') then
    raise exception 'bad_value';
  end if;
  update profiles set photo_visibility = p_photo, video_visibility = p_video where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Member functions: discovering and viewing other members
-- ---------------------------------------------------------------------------

create or replace function public.discover(
  p_min_age int default null, p_max_age int default null,
  p_country text default null, p_language text default null, p_search text default null
) returns table (
  id uuid, first_name text, age int, city text, country text, languages text[],
  photo_path text, photo_locked boolean, hue int
) language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_active();
  return query
  select p.id, p.first_name, _age(p.dob), p.city, p.country, p.languages,
    case when _media_allowed(auth.uid(), p.id, 'photo') then p.photo_path end,
    not _media_allowed(auth.uid(), p.id, 'photo'),
    p.hue
  from profiles p
  where _can_see(auth.uid(), p.id)
    and (p_min_age is null or _age(p.dob) >= p_min_age)
    and (p_max_age is null or _age(p.dob) <= p_max_age)
    and (p_country is null or p.country = p_country)
    and (p_language is null or p_language = any (p.languages))
    and (p_search is null or p.first_name ilike '%' || p_search || '%' or p.city ilike '%' || p_search || '%')
  order by p.decided_at desc nulls last
  limit 60;
end;
$$;

create or replace function public.discover_options() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_active();
  return jsonb_build_object(
    'countries', (select coalesce(jsonb_agg(distinct p.country), '[]') from profiles p where _can_see(auth.uid(), p.id)),
    'languages', (select coalesce(jsonb_agg(distinct l), '[]') from profiles p, unnest(p.languages) l where _can_see(auth.uid(), p.id))
  );
end;
$$;

-- Returns nothing at all when the caller may not see this member, so the
-- profile page answers 404 for hidden, pending, blocked or unknown profiles.
create or replace function public.get_member(p_id uuid) returns table (
  id uuid, first_name text, age int, city text, country text, languages text[], faith text,
  about text, community text, looking_for text, photo_path text, video_path text, video_seconds int,
  photo_locked boolean, video_locked boolean, conversation_id uuid, conversation_state text, hue int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not _can_see(auth.uid(), p_id) then return; end if;
  return query
  select p.id, p.first_name, _age(p.dob), p.city, p.country, p.languages, p.faith,
    p.about, p.community, p.looking_for,
    case when _media_allowed(auth.uid(), p.id, 'photo') then p.photo_path end,
    case when _media_allowed(auth.uid(), p.id, 'video') then p.video_path end,
    p.video_seconds,
    not _media_allowed(auth.uid(), p.id, 'photo'),
    not _media_allowed(auth.uid(), p.id, 'video'),
    c.id,
    case
      when c.id is null then 'none'
      when c.status = 'accepted' then 'accepted'
      when c.requester = auth.uid() then 'sent'          -- a declined request still looks "sent"
      when c.status = 'pending' then 'received'
      else 'none' end,
    p.hue
  from profiles p
  left join conversations c
    on (c.requester = auth.uid() and c.recipient = p.id) or (c.requester = p.id and c.recipient = auth.uid())
  where p.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Member functions: messaging, blocking, reporting, membership
-- ---------------------------------------------------------------------------

create or replace function public.membership_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'founding_total', s.founding_total,
    'founding_left', greatest(s.founding_total - s.founding_claimed, 0),
    'membership', p.membership,
    'until', p.membership_until,
    'active', p.membership <> 'none' and (p.membership_until is null or p.membership_until >= current_date)
  )
  from app_settings s left join profiles p on p.id = auth.uid();
$$;

-- Demo mode: no payment is taken; the founding offer is granted directly.
create or replace function public.claim_founding() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s app_settings;
begin
  perform _require_active();
  select * into s from app_settings for update;
  if exists (select 1 from profiles where id = auth.uid() and membership <> 'none'
             and (membership_until is null or membership_until >= current_date)) then
    return membership_info();
  end if;
  if s.founding_claimed >= s.founding_total then raise exception 'founding_full'; end if;
  update app_settings set founding_claimed = founding_claimed + 1 where id = 1;
  update profiles set membership = 'founding', membership_until = (current_date + interval '3 months')::date
  where id = auth.uid();
  perform _audit('claimed a founding membership (demo, no payment)', auth.uid());
  return membership_info();
end;
$$;

create or replace function public.send_request(p_to uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  conv uuid;
  me profiles;
begin
  perform _require_active();
  if not _can_see(auth.uid(), p_to) then raise exception 'not_found' using errcode = '42501'; end if;
  select * into me from profiles where id = auth.uid();
  if me.membership = 'none' or (me.membership_until is not null and me.membership_until < current_date) then
    raise exception 'membership_required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'empty_message'; end if;
  if exists (select 1 from conversations where least(requester, recipient) = least(auth.uid(), p_to)
             and greatest(requester, recipient) = greatest(auth.uid(), p_to)) then
    raise exception 'already_requested';
  end if;
  insert into conversations (requester, recipient) values (auth.uid(), p_to) returning id into conv;
  insert into messages (conversation_id, sender, body, flag_reason)
  values (conv, auth.uid(), trim(p_body), _screen(p_body));
  return conv;
end;
$$;

create or replace function public.respond_request(p_conversation uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c conversations;
begin
  perform _require_active();
  select * into c from conversations where id = p_conversation;
  if not found or c.recipient <> auth.uid() or c.status <> 'pending' or _blocked(c.requester, c.recipient) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  update conversations set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_conversation;
end;
$$;

create or replace function public.send_message(p_conversation uuid, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
  other uuid;
  new_id bigint;
begin
  perform _require_active();
  select * into c from conversations where id = p_conversation;
  if not found or auth.uid() not in (c.requester, c.recipient) or c.status <> 'accepted' then
    raise exception 'not_found' using errcode = '42501';
  end if;
  other := case when c.requester = auth.uid() then c.recipient else c.requester end;
  if not _can_see(auth.uid(), other) then raise exception 'not_found' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'empty_message'; end if;
  insert into messages (conversation_id, sender, body, flag_reason)
  values (p_conversation, auth.uid(), left(trim(p_body), 1000), _screen(p_body))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.my_conversations() returns table (
  id uuid, other_id uuid, other_name text, other_age int, other_city text, other_hue int,
  state text, last_body text, last_at timestamptz, last_from_me boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_active();
  return query
  select c.id, o.id, o.first_name, _age(o.dob), o.city, o.hue,
    case
      when c.status = 'accepted' then 'accepted'
      when c.requester = auth.uid() then 'sent'
      else 'received' end,
    m.body, m.created_at, m.sender = auth.uid()
  from conversations c
  join profiles o on o.id = case when c.requester = auth.uid() then c.recipient else c.requester end
  left join lateral (
    select body, created_at, sender from messages where conversation_id = c.id order by created_at desc limit 1
  ) m on true
  where auth.uid() in (c.requester, c.recipient)
    and (c.status <> 'declined' or c.requester = auth.uid())
    and _can_see(auth.uid(), o.id)
  order by m.created_at desc nulls last;
end;
$$;

create or replace function public.get_conversation(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c conversations;
  o profiles;
begin
  perform _require_active();
  select * into c from conversations where id = p_id;
  if not found or auth.uid() not in (c.requester, c.recipient) then return null; end if;
  if c.status = 'declined' and c.recipient = auth.uid() then return null; end if;
  select * into o from profiles where id = case when c.requester = auth.uid() then c.recipient else c.requester end;
  if not _can_see(auth.uid(), o.id) then return null; end if;
  return jsonb_build_object(
    'id', c.id,
    'state', case when c.status = 'accepted' then 'accepted' when c.requester = auth.uid() then 'sent' else 'received' end,
    'responded_at', c.responded_at,
    'requested_by_me', c.requester = auth.uid(),
    'other', jsonb_build_object('id', o.id, 'first_name', o.first_name, 'hue', o.hue, 'city', o.city,
      'photo_path', case when _media_allowed(auth.uid(), o.id, 'photo') then o.photo_path end),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'mine', m.sender = auth.uid(), 'body', m.body, 'at', m.created_at)
                       order by m.created_at)
      from messages m where m.conversation_id = c.id), '[]')
  );
end;
$$;

create or replace function public.block_member(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_id = auth.uid() or not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_id) then raise exception 'not_found'; end if;
  insert into blocks (blocker, blocked) values (auth.uid(), p_id) on conflict do nothing;
end;
$$;

create or replace function public.unblock_member(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from blocks where blocker = auth.uid() and blocked = p_id;
$$;

create or replace function public.my_blocks() returns table (id uuid, first_name text, city text, hue int, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.city, p.hue, b.created_at
  from blocks b join profiles p on p.id = b.blocked
  where b.blocker = auth.uid() order by b.created_at desc;
$$;

-- Report (and block). Three open reports from different members hide the
-- profile at once and put it into the moderator queue.
create or replace function public.report_member(p_id uuid, p_reason text, p_details text default null, p_block boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _require_active();
  if p_id = auth.uid() or not exists (select 1 from profiles where id = p_id) then raise exception 'not_found'; end if;
  if not _can_see(auth.uid(), p_id) and not _connected(auth.uid(), p_id) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  insert into reports (reporter, reported, reason, details)
  values (auth.uid(), p_id, p_reason, nullif(trim(coalesce(p_details, '')), ''))
  on conflict (reporter, reported) where status = 'open' do update set reason = excluded.reason, details = excluded.details;
  if p_block then
    insert into blocks (blocker, blocked) values (auth.uid(), p_id) on conflict do nothing;
  end if;
  select count(distinct reporter) into n from reports where reported = p_id and status = 'open';
  if n >= 3 then
    update profiles set report_hidden = true, review_kind = 'flagged' where id = p_id and not report_hidden;
    if found then
      insert into audit_log (actor_name, action, target_id, target_name, detail)
      select 'System', 'auto-hid profile after 3 reports', p.id,
             _short(p.first_name, p.last_name), null
      from profiles p where p.id = p_id;
    end if;
  end if;
end;
$$;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'detected_country' - 'languages_confirmed' from profiles p where p.id = auth.uid()),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at), '[]') from consents c where c.user_id = auth.uid()),
    'messages_sent', (select coalesce(jsonb_agg(jsonb_build_object('body', m.body, 'at', m.created_at) order by m.created_at), '[]')
                      from messages m where m.sender = auth.uid()),
    'blocked_members', (select count(*) from blocks where blocker = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------

create or replace function public.staff_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) from staff s where s.user_id = auth.uid();
$$;

create or replace function public.mod_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return jsonb_build_object(
    'new', (select count(*) from profiles where status = 'pending' and review_kind = 'new'),
    'changed', (select count(*) from profiles where status = 'pending' and review_kind = 'changed'),
    'flagged', (select count(*) from profiles where (status = 'pending' and review_kind = 'flagged')
                  or (report_hidden and status = 'approved')),
    'queue', (select count(*) from profiles where status = 'pending' or (report_hidden and status = 'approved')),
    'reports', (select count(*) from reports where status = 'open'),
    'hidden', (select count(*) from profiles where report_hidden),
    'flagged_messages', (select count(*) from messages where flag_reason is not null)
  );
end;
$$;

create or replace function public.mod_queue(p_filter text default 'new') returns table (
  id uuid, name text, age int, city text, review_kind text, submitted_at timestamptz,
  open_reports int, hidden boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return query
  select p.id, _short(p.first_name, p.last_name), _age(p.dob), p.city, p.review_kind,
    p.submitted_at,
    (select count(*)::int from reports r where r.reported = p.id and r.status = 'open'),
    p.report_hidden
  from profiles p
  where case p_filter
    when 'new' then p.status = 'pending' and p.review_kind = 'new'
    when 'changed' then p.status = 'pending' and p.review_kind = 'changed'
    when 'flagged' then (p.status = 'pending' and p.review_kind = 'flagged') or (p.report_hidden and p.status = 'approved')
    else p.status = 'pending' end
  order by p.submitted_at asc nulls last;
end;
$$;

create or replace function public.mod_profile(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  perform _require_staff();
  select * into p from profiles where id = p_id;
  if not found then return null; end if;
  return to_jsonb(p) || jsonb_build_object(
    'age', _age(p.dob),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('author', author_name, 'note', note, 'at', created_at)
              order by created_at desc), '[]') from review_notes where profile_id = p_id),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'details', details, 'at', created_at, 'status', status)
              order by created_at desc), '[]') from reports where reported = p_id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('actor', actor_name, 'action', action, 'detail', detail, 'at', created_at)
              order by created_at desc), '[]') from audit_log where target_id = p_id)
  );
end;
$$;

create or replace function public.mod_decide(
  p_id uuid, p_action text, p_reason text default null, p_items jsonb default null,
  p_note text default null, p_languages_confirmed boolean default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  me staff;
begin
  perform _require_staff();
  select * into me from staff where user_id = auth.uid();
  select * into p from profiles where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if not (p.status = 'pending' or (p.report_hidden and p.status = 'approved')) then
    raise exception 'not_in_queue';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into review_notes (profile_id, author_name, note) values (p_id, me.display_name, trim(p_note));
  end if;
  if p_action = 'approve' then
    update profiles set status = 'approved', report_hidden = false, review_kind = 'new',
      decided_at = now(), decision_reason = null, decision_items = '{}',
      languages_confirmed = p_languages_confirmed
    where id = p_id;
    update reports set status = 'resolved' where reported = p_id and status = 'open';
    perform _audit('approved', p_id, case when p_languages_confirmed then 'languages heard in video' end);
  elsif p_action = 'reject' then
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
    update profiles set status = 'rejected', report_hidden = false, decided_at = now(),
      decision_reason = trim(p_reason), decision_items = coalesce(p_items, '{}')
    where id = p_id;
    perform _audit('rejected', p_id, trim(p_reason));
  elsif p_action = 'flag' then
    update profiles set review_kind = 'flagged' where id = p_id;
    perform _audit('flagged for admin', p_id, nullif(trim(coalesce(p_note, '')), ''));
  else
    raise exception 'bad_action';
  end if;
end;
$$;

create or replace function public.mod_add_note(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_staff();
  insert into review_notes (profile_id, author_name, note)
  select p_id, display_name, trim(p_note) from staff where user_id = auth.uid();
  perform _audit('added a private note', p_id);
end;
$$;

create or replace function public.mod_reports() returns table (
  member_id uuid, name text, status text, hidden boolean, open_reports int,
  top_reason text, screening_flags int, latest_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return query
  select p.id, _short(p.first_name, p.last_name), p.status, p.report_hidden,
    count(r.id)::int,
    mode() within group (order by r.reason),
    (select count(*)::int from messages m where m.sender = p.id and m.flag_reason is not null),
    max(r.created_at)
  from reports r join profiles p on p.id = r.reported
  where r.status = 'open'
  group by p.id
  order by p.report_hidden desc, count(r.id) desc, max(r.created_at) desc;
end;
$$;

-- Moderators see only messages that screening flagged, never ordinary conversations.
create or replace function public.mod_flagged_messages() returns table (
  id bigint, sender_id uuid, sender_name text, recipient_name text, body text,
  flag_reason text, reported_by_recipient boolean, at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return query
  select m.id, s.id, _short(s.first_name, s.last_name),
    _short(r.first_name, r.last_name), m.body, m.flag_reason,
    exists (select 1 from reports x where x.reporter = r.id and x.reported = s.id),
    m.created_at
  from messages m
  join conversations c on c.id = m.conversation_id
  join profiles s on s.id = m.sender
  join profiles r on r.id = case when c.requester = m.sender then c.recipient else c.requester end
  where m.flag_reason is not null
  order by m.created_at desc
  limit 50;
end;
$$;

create or replace function public.mod_member_action(p_id uuid, p_action text, p_reason text default null, p_days int default 14)
returns void language plpgsql security definer set search_path = public as $$
declare msg text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform _require_staff();
  if not exists (select 1 from profiles where id = p_id) then raise exception 'not_found'; end if;
  if p_action = 'dismiss' then
    update reports set status = 'resolved' where reported = p_id and status = 'open';
    update profiles set report_hidden = false where id = p_id;
    perform _audit('dismissed reports for', p_id, msg);
  elsif p_action = 'warn' then
    update reports set status = 'resolved' where reported = p_id and status = 'open';
    update profiles set report_hidden = false where id = p_id;
    perform _audit('warned', p_id, coalesce(msg, 'Community guidelines reminder'));
  elsif p_action = 'suspend' then
    update reports set status = 'resolved' where reported = p_id and status = 'open';
    update profiles set status = 'suspended', report_hidden = false,
      suspended_until = (current_date + make_interval(days => greatest(coalesce(p_days, 14), 1)))::timestamptz,
      decision_reason = coalesce(msg, 'Messages that went against our community guidelines.'),
      appeal_requested_at = null, decided_at = now()
    where id = p_id;
    perform _audit('suspended', p_id, 'until ' || to_char(current_date + greatest(coalesce(p_days, 14), 1), 'DD Mon'));
  elsif p_action = 'ban' then
    update reports set status = 'resolved' where reported = p_id and status = 'open';
    update profiles set status = 'banned', report_hidden = false, suspended_until = null,
      decision_reason = coalesce(msg, 'Serious breach of our community guidelines.'),
      appeal_requested_at = null, decided_at = now()
    where id = p_id;
    perform _audit('banned', p_id, msg);
  elsif p_action = 'send_back' then
    update reports set status = 'resolved' where reported = p_id and status = 'open';
    update profiles set status = 'pending', review_kind = 'flagged', report_hidden = false, submitted_at = now()
    where id = p_id;
    perform _audit('sent back to review', p_id, msg);
  elsif p_action = 'reinstate' then
    update profiles set status = 'approved', report_hidden = false, suspended_until = null,
      decision_reason = null, appeal_requested_at = null, decided_at = now()
    where id = p_id;
    perform _audit('reinstated', p_id, msg);
  else
    raise exception 'bad_action';
  end if;
end;
$$;

create or replace function public.admin_members() returns table (
  id uuid, name text, status text, hidden boolean, membership text, membership_until date,
  country text, created_at timestamptz, appeal_requested_at timestamptz, suspended_until timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return query
  select p.id, p.first_name || ' ' || p.last_name, p.status, p.report_hidden, p.membership, p.membership_until,
    p.country, p.created_at, p.appeal_requested_at, p.suspended_until
  from profiles p
  order by case p.status when 'pending' then 0 when 'approved' then 1 else 2 end, p.first_name;
end;
$$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return jsonb_build_object(
    'approved', (select count(*) from profiles where status = 'approved'),
    'pending', (select count(*) from profiles where status = 'pending'),
    'paying', (select count(*) from profiles where membership = 'paid'),
    'founding_left', (select greatest(founding_total - founding_claimed, 0) from app_settings),
    'founding_total', (select founding_total from app_settings)
  );
end;
$$;

create or replace function public.admin_set_access(p_id uuid, p_access text, p_until date default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if p_access not in ('none', 'complimentary', 'paid', 'founding') then raise exception 'bad_value'; end if;
  update profiles set membership = p_access, membership_until = case when p_access = 'none' then null else p_until end
  where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform _audit(case p_access when 'complimentary' then 'gave complimentary access to'
                               when 'none' then 'removed access for' else 'changed access for' end,
                 p_id, case when p_until is not null then 'until ' || to_char(p_until, 'DD Mon YYYY') end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing for anonymous callers; internal helpers for nobody.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_staff(), public.is_admin(), public.me_active(), public.blocked_with(uuid),
  public.can_view_media(text), public.can_upload_media(text),
  public.create_my_profile(text, text, date, text, text, text, text, text[], boolean, boolean, boolean),
  public.set_faith_consent(boolean, text),
  public.update_my_details(text, text, text, jsonb), public.set_my_prompts(text, text),
  public.set_my_media(text, text, int), public.submit_for_review(), public.my_status(),
  public.request_appeal(text), public.set_visibility(text, text),
  public.discover(int, int, text, text, text), public.discover_options(), public.get_member(uuid),
  public.membership_info(), public.claim_founding(),
  public.send_request(uuid, text), public.respond_request(uuid, boolean), public.send_message(uuid, text),
  public.my_conversations(), public.get_conversation(uuid),
  public.block_member(uuid), public.unblock_member(uuid), public.my_blocks(),
  public.report_member(uuid, text, text, boolean), public.export_my_data(),
  public.staff_me(), public.mod_counts(), public.mod_queue(text), public.mod_profile(uuid),
  public.mod_decide(uuid, text, text, jsonb, text, boolean), public.mod_add_note(uuid, text),
  public.mod_reports(), public.mod_flagged_messages(), public.mod_member_action(uuid, text, text, int),
  public.admin_members(), public.admin_stats(), public.admin_set_access(uuid, text, date)
to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
