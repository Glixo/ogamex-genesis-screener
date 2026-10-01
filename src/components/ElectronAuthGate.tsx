import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import { LogOut, Rocket } from "lucide-react";
import { getElectronAuthClient } from "@/lib/supabase";

export function ElectronAuthGate({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    getElectronAuthClient()
      .then(async (c) => {
        if (!c) {
          setError("Service de connexion indisponible.");
          setReady(true);
          return;
        }
        setClient(c);
        const { data } = await c.auth.getSession();
        setSession(data.session);
        const { data: sub } = c.auth.onAuthStateChange((_e, s) => setSession(s));
        unsub = () => sub.subscription.unsubscribe();
        setReady(true);
      })
      .catch(() => {
        setError("Service de connexion indisponible.");
        setReady(true);
      });
    return () => unsub?.();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError(null);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError("Email ou mot de passe incorrect.");
    setPassword("");
    setBusy(false);
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (session) {
    return (
      <>
        <div className="fixed right-4 top-4 z-20">
          <button
            type="button"
            onClick={() => client?.auth.signOut()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Rocket className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold">
            OGameX <span className="text-primary text-glow">Genesis</span> Screener
          </h1>
          <p className="text-sm text-muted-foreground">Connexion requise</p>
        </div>
        <label className="mb-1 block text-sm text-muted-foreground" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus:glow-ring"
        />
        <label className="mb-1 block text-sm text-muted-foreground" htmlFor="password">Mot de passe</label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus:glow-ring"
        />
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy || !client}
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
