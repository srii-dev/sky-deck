import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthApi } from "@/hooks/use-auth";
import { formError, MIN_PASSWORD_LENGTH, type AuthMode } from "@/lib/auth-forms";

/*
 * Account dialog (Phase 18d): sign in, create an account, sign out, delete the account.
 * Nothing in SkyDeck needs an account yet; this is the foundation for saved data (Phase 5g and later).
 * What is stored: the email address and a password hash at Supabase, plus an empty profile row. Nothing else.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The shared sign-in state (it lives in the page so the lists can sync). */
  auth: AuthApi;
  /** Sync status of the watchlist and recent flights, shown when signed in. */
  syncNote?: string | null;
}

export function AccountDialog({ open, onOpenChange, auth, syncNote }: Props) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reset = () => {
    setPassword("");
    setError(null);
    setNotice(null);
    setConfirmDelete(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = formError(mode, email, password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign-in") {
        const r = await auth.signIn(email, password);
        if (r.error) setError(r.error);
        else reset();
      } else {
        const r = await auth.signUp(email, password);
        if (r.error) setError(r.error);
        else if (r.needsConfirmation) {
          setNotice("Check your email: open the link we sent to finish creating the account.");
          setPassword("");
        } else reset();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await auth.deleteAccount();
      if (r.error) setError(r.error);
      else {
        reset();
        setNotice("Your account was deleted.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>
            An account is optional. SkyDeck works fully without one; accounts will be used to save
            things across devices later.
          </DialogDescription>
        </DialogHeader>

        {auth.status === "idle" || auth.status === "loading" ? (
          <p className="hud-label animate-pulse">Loading…</p>
        ) : auth.status === "unavailable" ? (
          <p className="text-sm text-muted-foreground">
            Accounts are not available on this site yet.
          </p>
        ) : auth.status === "signed-in" ? (
          <div className="space-y-4">
            <p className="text-sm">
              Signed in as <strong className="break-all">{auth.email}</strong>
            </p>
            <p className="text-xs text-muted-foreground">
              Your watchlist and recently viewed flights are saved to this account.
              {syncNote ? " " + syncNote : ""} Signing out keeps the lists on this device; Settings,
              Delete my saved data removes them.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void auth.signOut()} disabled={busy}>
                Sign out
              </Button>
              {!confirmDelete ? (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  Delete my account…
                </Button>
              ) : (
                <div className="w-full space-y-2 rounded-md border border-destructive/50 p-3">
                  <p className="text-sm">
                    This permanently deletes your account and the data stored with it. It cannot be
                    undone.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
                      Yes, delete it
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                      Keep it
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
            <div className="flex gap-2" role="group" aria-label="Sign in or create an account">
              {(["sign-in", "sign-up"] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={mode === m ? "default" : "outline"}
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                    setNotice(null);
                  }}
                >
                  {m === "sign-in" ? "Sign in" : "Create account"}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="account-email">Email</Label>
              <Input
                id="account-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="account-password">Password</Label>
              <Input
                id="account-password"
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              {mode === "sign-up" && (
                <p className="text-xs text-muted-foreground">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-success">
                {notice}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
            <p className="text-xs text-muted-foreground">
              We store your email address and a hashed password with Supabase, nothing else. You can
              delete the account here at any time.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
