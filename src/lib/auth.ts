// Optional sign-in for community submissions (Supabase Auth). Adding a place
// requires an account (Google or email/password); browsing stays open. When
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't set, hasAuth() is false and
// the app keeps the current anonymous submit flow — so dev and forks work with
// no auth service.
//
// The Supabase SDK is loaded lazily (dynamic import) so deployments without
// auth never download it — keeps the offline PWA bundle small.

import type { SupabaseClient, User } from '@supabase/supabase-js';

// Strip ALL whitespace, not just the ends: env values pasted from a dashboard
// often pick up a stray newline mid-string (the key wraps in the UI), and an
// invalid character in the Supabase `apikey` header makes fetch throw
// "Failed to execute 'fetch' on 'Window': Invalid value". URLs and API keys
// never legitimately contain whitespace, so this is safe.
const URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\s+/g, '');
const ANON = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').replace(/\s+/g, '');

export function hasAuth(): boolean {
  return Boolean(URL && ANON);
}

let clientPromise: Promise<SupabaseClient> | null = null;
function getClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(URL, ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }),
    );
  }
  return clientPromise;
}

export interface AuthUser {
  name: string;
}

// First name + initial from the account's display name, else the email
// local-part — matches the server's attribution so the UI can preview it.
export function displayName(user: User | null | undefined): string {
  if (!user) return '';
  const full = (user.user_metadata?.full_name as string | undefined)?.trim();
  if (full) {
    const [first, ...rest] = full.split(/\s+/);
    return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
  }
  const local = (user.email ?? '').split('@')[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Traveller';
}

export async function getUser(): Promise<AuthUser | null> {
  if (!hasAuth()) return null;
  const { data } = await (await getClient()).auth.getUser();
  return data.user ? { name: displayName(data.user) } : null;
}

export async function getAccessToken(): Promise<string | null> {
  if (!hasAuth()) return null;
  const { data } = await (await getClient()).auth.getSession();
  return data.session?.access_token ?? null;
}

// Ask the Supabase server which OAuth providers are actually enabled. The
// /auth/v1/settings endpoint is public (needs only the anon key) and reflects
// the dashboard's Providers config. Returns true/false, or null if it can't be
// determined. This is the definitive check for "Google bounces straight back"
// — the usual cause is the Google provider simply not being enabled/saved.
export async function googleEnabled(): Promise<boolean | null> {
  if (!hasAuth()) return null;
  try {
    const res = await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: ANON } });
    if (!res.ok) return null;
    const s = await res.json();
    return Boolean(s?.external?.google);
  } catch {
    return null;
  }
}

// Waits for the popup's landing page (public/auth-popup.html) to post the
// OAuth response back, then installs the session on THIS window's client.
// Resolves on success; rejects with a readable error, including when the
// user simply closes the popup.
function finishPopupSignIn(client: SupabaseClient, popup: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMsg);
      window.clearInterval(closedPoll);
      try {
        popup.close();
      } catch {
        // already closed
      }
      fn();
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || (e.data as { type?: string })?.type !== 'pithop-auth') return;
      const d = e.data as { hash?: string; search?: string };
      const params = new URLSearchParams(
        `${String(d.hash ?? '').replace(/^#/, '')}&${String(d.search ?? '').replace(/^\?/, '')}`,
      );
      void (async () => {
        try {
          const access = params.get('access_token');
          const refresh = params.get('refresh_token');
          const code = params.get('code');
          if (access && refresh) {
            const { error } = await client.auth.setSession({ access_token: access, refresh_token: refresh });
            if (error) throw new Error(error.message);
          } else if (code) {
            // PKCE flow variant — exchange works here because the popup and
            // this window share the same localStorage code verifier.
            const { error } = await client.auth.exchangeCodeForSession(code);
            if (error) throw new Error(error.message);
          } else {
            const desc = params.get('error_description') ?? params.get('error') ?? 'Sign-in did not complete';
            throw new Error(desc.replace(/\+/g, ' '));
          }
          settle(resolve);
        } catch (err) {
          settle(() => reject(err instanceof Error ? err : new Error(String(err))));
        }
      })();
    };
    // If the user closes the popup, stop waiting — after a short grace period
    // so a message posted just before the close still wins the race.
    const closedPoll = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(closedPoll);
        window.setTimeout(() => settle(() => reject(new Error('Sign-in window was closed'))), 500);
      }
    }, 400);
    window.addEventListener('message', onMsg);
  });
}

export async function signInWithGoogle(): Promise<void> {
  if (!hasAuth()) return;
  // Open the popup synchronously, inside the click gesture — opening it after
  // an await would trip popup blockers. The OAuth URL is filled in below.
  const w = 500;
  const h = 650;
  const left = Math.max(0, (window.screenX ?? 0) + ((window.outerWidth ?? w) - w) / 2);
  const top = Math.max(0, (window.screenY ?? 0) + ((window.outerHeight ?? h) - h) / 2);
  const popup = window.open('about:blank', 'pithop-auth', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  const client = await getClient();
  if (!popup) {
    // Popup blocked — fall back to the classic full-tab redirect.
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { skipBrowserRedirect: true, redirectTo: `${window.location.origin}/auth-popup.html` },
  });
  if (error || !data?.url) {
    try {
      popup.close();
    } catch {
      // ignore
    }
    throw new Error(error?.message ?? 'Could not start Google sign-in');
  }
  popup.location.href = data.url;
  await finishPopupSignIn(client, popup);
}

// Supabase reports OAuth failures by redirecting back with the error in the
// URL hash (#error=...&error_description=...). Read it once and clean the
// hash, so the app can show WHY a sign-in bounced instead of looking like
// the button "did nothing".
export function consumeAuthErrorFromUrl(): string | null {
  const m = /[#&]error(?:_code)?=/.test(location.hash)
    ? new URLSearchParams(location.hash.slice(1))
    : null;
  if (!m) return null;
  const description = m.get('error_description') ?? m.get('error') ?? 'Sign-in failed';
  history.replaceState(null, '', location.pathname + location.search);
  return description.replace(/\+/g, ' ');
}

// Supabase surfaces auth failures as returned errors; normalize to a message
// the panel can show.
export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await (await getClient()).auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signUpWithEmail(email: string, password: string): Promise<{ needsConfirm: boolean }> {
  const { data, error } = await (await getClient()).auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  // No session yet means Supabase sent a confirmation email.
  return { needsConfirm: !data.session };
}

export async function signOut(): Promise<void> {
  if (!hasAuth()) return;
  await (await getClient()).auth.signOut();
}

// Notify on sign-in/out; returns an unsubscribe function. Loads the client
// lazily, so the callback fires once it's ready.
export function subscribe(cb: (user: AuthUser | null) => void): () => void {
  if (!hasAuth()) return () => {};
  let cancelled = false;
  let unsub: (() => void) | null = null;
  void getClient().then((client) => {
    if (cancelled) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      cb(session?.user ? { name: displayName(session.user) } : null);
    });
    unsub = () => data.subscription.unsubscribe();
  });
  return () => {
    cancelled = true;
    unsub?.();
  };
}
