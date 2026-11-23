-- The message read rule needs the conversation's status, which members are
-- not allowed to read directly. Evaluate it in a helper that answers only
-- "may the caller read this message?".
create or replace function public.can_read_message(p_conversation uuid, p_sender uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id = p_conversation
      and auth.uid() in (c.requester, c.recipient)
      and (c.status <> 'declined' or p_sender = auth.uid())
      and _is_active(auth.uid())
      and not _blocked(c.requester, c.recipient)
  );
$$;
revoke execute on function public.can_read_message(uuid, uuid) from public, anon;
grant execute on function public.can_read_message(uuid, uuid) to authenticated;

drop policy if exists messages_read_participant on public.messages;
create policy messages_read_participant on public.messages for select to authenticated
  using (public.can_read_message(conversation_id, sender));
