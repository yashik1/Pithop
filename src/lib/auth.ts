// Optional sign-in for community submissions (Supabase Auth). Adding a place
// requires an account (Google or email/password); browsing stays open. When
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't set, hasAuth() is false and
// the app keeps the current anonymous submit flow — so dev and forks work with
// no auth service.
//
// The Supabase SDK is loaded lazily (dynamic import) so deployments without
// auth never download it — keeps the offline PWA bundle small.

import type { SupabaseClient, User } from '@supabase/supabase-js';

const URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
const ANON = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim();

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

export async function signInWithGoogle(): Promise<void> {
  if (!hasAuth()) return;
  await (await getClient()).auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
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
