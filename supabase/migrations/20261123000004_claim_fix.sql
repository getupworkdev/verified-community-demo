-- Founding counter update needs an explicit WHERE (safe-update guard).
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
