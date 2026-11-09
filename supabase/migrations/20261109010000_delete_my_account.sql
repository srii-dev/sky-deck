-- Phase 18d: a signed-in user can delete their own account without a server-side admin key.
-- Deleting the auth user also removes their profile row (profiles.id references auth.users on delete cascade).
-- Only the signed-in user's own id is ever deleted: the id comes from the session (auth.uid()), never from an argument.

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Signed-in users may call it; visitors who are not signed in may not.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
