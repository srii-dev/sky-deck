import { useCallback, useEffect, useState } from "react";

import { authErrorMessage, normalizeEmail, signUpLooksRegistered } from "@/lib/auth-forms";
import { getSupabase } from "@/lib/supabase-client";

/*
 * Sign-in state and actions (Phase 18d). It only starts talking to Supabase once `active` is true (the first time
 * the account dialog opens), so visitors who never open it cost nothing. Errors come back as friendly text.
 */

export type AuthStatus = "idle" | "loading" | "unavailable" | "signed-out" | "signed-in";

export interface AuthActions {
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signUp(
    email: string,
    password: string,
  ): Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<{ error: string | null }>;
}

export type AuthApi = {
  status: AuthStatus;
  email: string | null;
  userId: string | null;
} & AuthActions;

export function useAuth(active: boolean): AuthApi {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setStatus((s) => (s === "idle" ? "loading" : s));
    void getSupabase().then(async (sb) => {
      if (cancelled) return;
      if (!sb) {
        setStatus("unavailable");
        return;
      }
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      setEmail(data.session?.user.email ?? null);
      setUserId(data.session?.user.id ?? null);
      setStatus(data.session ? "signed-in" : "signed-out");
      const sub = sb.auth.onAuthStateChange((_event, session) => {
        setEmail(session?.user.email ?? null);
        setUserId(session?.user.id ?? null);
        setStatus(session ? "signed-in" : "signed-out");
      });
      unsubscribe = () => sub.data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [active]);

  const signIn = useCallback<AuthActions["signIn"]>(async (e, password) => {
    const sb = await getSupabase();
    if (!sb) return { error: "Accounts are not available right now." };
    const { error } = await sb.auth.signInWithPassword({ email: normalizeEmail(e), password });
    return { error: error ? authErrorMessage(error) : null };
  }, []);

  const signUp = useCallback<AuthActions["signUp"]>(async (e, password) => {
    const sb = await getSupabase();
    if (!sb) return { error: "Accounts are not available right now.", needsConfirmation: false };
    const { data, error } = await sb.auth.signUp({
      email: normalizeEmail(e),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { error: authErrorMessage(error), needsConfirmation: false };
    if (signUpLooksRegistered(data.user)) {
      return { error: authErrorMessage({ code: "user_already_exists" }), needsConfirmation: false };
    }
    // No session yet means the address still has to be confirmed by email.
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const sb = await getSupabase();
    await sb?.auth.signOut();
  }, []);

  const deleteAccount = useCallback<AuthActions["deleteAccount"]>(async () => {
    const sb = await getSupabase();
    if (!sb) return { error: "Accounts are not available right now." };
    // The database function deletes only the signed-in user's own account.
    const { error } = await sb.rpc("delete_my_account");
    if (error)
      return { error: "Could not delete the account. Try again, or sign out and in first." };
    await sb.auth.signOut();
    return { error: null };
  }, []);

  return { status, email, userId, signIn, signUp, signOut, deleteAccount };
}
