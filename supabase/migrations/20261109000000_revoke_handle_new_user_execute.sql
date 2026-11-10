-- The signup trigger function must not be callable through the public API (/rest/v1/rpc/handle_new_user).
-- Found by the Supabase security advisor right after the first migration ran on the real project.
-- The trigger still fires: a trigger function is not executed through the caller's EXECUTE privilege.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
