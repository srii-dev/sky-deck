import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/hooks/use-auth";
import { getSupabase } from "@/lib/supabase-client";

vi.mock("@/lib/supabase-client", () => ({ getSupabase: vi.fn() }));

type Session = { user: { id: string; email: string } } | null;
type Listener = (event: string, session: Session) => void;

function fakeSupabase(session: Session = null) {
  let listener: Listener | null = null;
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(async () => ({ data: { session } })),
    onAuthStateChange: vi.fn((fn: Listener) => {
      listener = fn;
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithPassword: vi.fn(async () => ({ error: null as null | { code: string } })),
    signUp: vi.fn(async () => ({
      data: { user: { identities: [{}] } as unknown, session: null as Session },
      error: null as null | { code: string },
    })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  const rpc = vi.fn(async () => ({ error: null as null | { message: string } }));
  return {
    sb: { auth, rpc },
    emit: (s: Session) => act(() => listener?.("SIGNED_IN", s)),
    unsubscribe,
  };
}

const session = (id: string, email: string): Session => ({ user: { id, email } });
const use = (sb: unknown) =>
  vi.mocked(getSupabase).mockResolvedValue(sb as Awaited<ReturnType<typeof getSupabase>>);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAuth state", () => {
  it("does not contact Supabase until it is made active", async () => {
    const { result, rerender } = renderHook(({ on }) => useAuth(on), {
      initialProps: { on: false },
    });
    await act(async () => {});
    expect(getSupabase).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");

    const f = fakeSupabase();
    use(f.sb);
    rerender({ on: true });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(getSupabase).toHaveBeenCalledTimes(1);
  });

  it("is unavailable when the site has no Supabase configuration", async () => {
    use(null);
    const { result } = renderHook(() => useAuth(true));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("restores a saved session and follows later sign-in changes", async () => {
    const f = fakeSupabase(session("u1", "a@example.com"));
    use(f.sb);
    const { result } = renderHook(() => useAuth(true));
    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    expect(result.current).toMatchObject({ userId: "u1", email: "a@example.com" });

    f.emit(null);
    expect(result.current).toMatchObject({ status: "signed-out", userId: null, email: null });
    f.emit(session("u2", "b@example.com"));
    expect(result.current).toMatchObject({ status: "signed-in", userId: "u2" });
  });

  it("unsubscribes from sign-in changes when unmounted", async () => {
    const f = fakeSupabase();
    use(f.sb);
    const { result, unmount } = renderHook(() => useAuth(true));
    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    unmount();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("ignores a Supabase lookup that finishes after unmounting", async () => {
    const f = fakeSupabase();
    let resolve!: (v: never) => void;
    vi.mocked(getSupabase).mockReturnValue(
      new Promise((r) => (resolve = r)) as ReturnType<typeof getSupabase>,
    );
    const { unmount } = renderHook(() => useAuth(true));
    unmount();
    await act(async () => resolve(f.sb as never));
    expect(f.sb.auth.getSession).not.toHaveBeenCalled();
    expect(f.sb.auth.onAuthStateChange).not.toHaveBeenCalled();
  });
});

describe("useAuth actions", () => {
  it("signs in with a normalised email and turns errors into friendly text", async () => {
    const f = fakeSupabase();
    use(f.sb);
    const { result } = renderHook(() => useAuth(false));
    expect(await result.current.signIn("  Pilot@Example.COM ", "pw")).toEqual({ error: null });
    expect(f.sb.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "pilot@example.com",
      password: "pw",
    });
    f.sb.auth.signInWithPassword.mockResolvedValueOnce({ error: { code: "invalid_credentials" } });
    expect(await result.current.signIn("a@b.co", "x")).toEqual({
      error: "That email and password do not match.",
    });
  });

  it("reports every action as unavailable without Supabase", async () => {
    use(null);
    const { result } = renderHook(() => useAuth(false));
    const off = "Accounts are not available right now.";
    expect(await result.current.signIn("a@b.co", "x")).toEqual({ error: off });
    expect(await result.current.signUp("a@b.co", "x")).toEqual({
      error: off,
      needsConfirmation: false,
    });
    expect(await result.current.deleteAccount()).toEqual({ error: off });
    await expect(result.current.signOut()).resolves.toBeUndefined();
  });

  it("signs up with a confirmation link back to this site", async () => {
    const f = fakeSupabase();
    use(f.sb);
    const { result } = renderHook(() => useAuth(false));
    expect(await result.current.signUp("New@Example.com", "long-password")).toEqual({
      error: null,
      needsConfirmation: true,
    });
    expect(f.sb.auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "long-password",
      options: { emailRedirectTo: window.location.origin },
    });

    // With a session straight away, no confirmation is needed.
    f.sb.auth.signUp.mockResolvedValueOnce({
      data: { user: { identities: [{}] }, session: session("u1", "new@example.com") },
      error: null,
    });
    expect((await result.current.signUp("new@example.com", "pw")).needsConfirmation).toBe(false);
  });

  it("says an address is taken when sign-up returns a user without identities", async () => {
    const f = fakeSupabase();
    use(f.sb);
    f.sb.auth.signUp.mockResolvedValueOnce({
      data: { user: { identities: [] }, session: null },
      error: null,
    });
    const { result } = renderHook(() => useAuth(false));
    expect(await result.current.signUp("a@b.co", "pw")).toEqual({
      error: "That email already has an account. Try signing in.",
      needsConfirmation: false,
    });
  });

  it("passes a sign-up error through as friendly text", async () => {
    const f = fakeSupabase();
    use(f.sb);
    f.sb.auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "weak_password" },
    });
    const { result } = renderHook(() => useAuth(false));
    const r = await result.current.signUp("a@b.co", "pw");
    expect(r.needsConfirmation).toBe(false);
    expect(r.error).toMatch(/too easy to guess/);
  });

  it("deletes the account through the database function, then signs out", async () => {
    const f = fakeSupabase();
    use(f.sb);
    const { result } = renderHook(() => useAuth(false));
    expect(await result.current.deleteAccount()).toEqual({ error: null });
    expect(f.sb.rpc).toHaveBeenCalledWith("delete_my_account");
    expect(f.sb.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("stays signed in when deleting the account fails", async () => {
    const f = fakeSupabase();
    use(f.sb);
    f.sb.rpc.mockResolvedValueOnce({ error: { message: "nope" } });
    const { result } = renderHook(() => useAuth(false));
    expect((await result.current.deleteAccount()).error).toMatch(/Could not delete the account/);
    expect(f.sb.auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out", async () => {
    const f = fakeSupabase();
    use(f.sb);
    const { result } = renderHook(() => useAuth(false));
    await result.current.signOut();
    expect(f.sb.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
