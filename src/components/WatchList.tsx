import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Moon as MoonIcon, RefreshCw, Trash2 } from "lucide-react";
import {
  getWatchedOverview,
  removeWatchedPlayer,
  type WatchedPlayerOverview,
} from "@/lib/supabase";

const REFRESH_MS = 10_000;

function msg(e: unknown, fallback: string) {
  return (e as { message?: string })?.message ?? fallback;
}

function ago(iso: string | null, now: number) {
  if (!iso) return "jamais";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function freshness(iso: string | null, now: number) {
  if (!iso) return "text-muted-foreground";
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 120) return "text-primary";
  if (s < 900) return "text-foreground";
  return "text-muted-foreground";
}

function Activity({ value }: { value: string | null }) {
  if (value === null || value === "")
    return <span className="text-muted-foreground/60">Aucune</span>;
  if (value === "*")
    return (
      <span className="inline-flex min-w-8 justify-center rounded bg-destructive px-2 py-0.5 font-mono text-xs font-bold text-destructive-foreground">
        *
      </span>
    );
  return (
    <span className="inline-flex rounded bg-primary/20 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
      {value} min
    </span>
  );
}

export function WatchList() {
  const [rows, setRows] = useState<WatchedPlayerOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      setRows(await getWatchedOverview());
      setError(null);
    } catch (e) {
      setRows((r) => r ?? []);
      setError(msg(e, "Impossible de charger la surveillance."));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  // Relecture des données toutes les 10 s tant que l'onglet est affiché (aucun scan déclenché).
  useEffect(() => {
    load();
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load]);

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await removeWatchedPlayer(id);
      setRows((r) => r?.filter((x) => x.PlayerId !== id) ?? null);
    } catch (e) {
      setError(msg(e, "Échec du retrait."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Eye className="h-5 w-5 text-primary" /> Joueurs surveillés
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
          Actualisation auto. 10 s
        </span>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {rows === null ? (
        <div className="flex justify-center py-10">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
          Aucun joueur sous surveillance.
        </p>
      ) : (
        <div className="space-y-5">
          {rows.map((r) => (
            <div key={r.PlayerId} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/40 px-4 py-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="font-semibold text-primary text-glow">{r.Player ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.planets.length} planète{r.planets.length > 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.PlayerId)}
                  disabled={busyId === r.PlayerId}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-destructive/20 hover:text-destructive disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Retirer
                </button>
              </div>
              {r.planets.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Aucune planète connue.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Coord.</th>
                        <th className="px-4 py-2 font-medium">Planète</th>
                        <th className="px-4 py-2 font-medium">Lune</th>
                        <th className="px-4 py-2 font-medium">Act. planète</th>
                        <th className="px-4 py-2 font-medium">Act. lune</th>
                        <th className="px-4 py-2 font-medium">Vérifié</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.planets.map((p) => (
                        <tr key={p.Coordinates} className="border-t border-border/40 hover:bg-accent/30">
                          <td className="px-4 py-1.5 font-mono font-semibold text-primary">[{p.Coordinates}]</td>
                          <td className="px-4 py-1.5">{p.Planet}</td>
                          <td className="px-4 py-1.5">
                            {p.Moon === "Oui" ? (
                              <MoonIcon className="h-4 w-4 text-primary" aria-label="Oui" />
                            ) : (
                              <span className="text-muted-foreground/60">Non</span>
                            )}
                          </td>
                          <td className="px-4 py-1.5"><Activity value={p.PlanetActivity} /></td>
                          <td className="px-4 py-1.5">
                            {p.Moon === "Oui" ? (
                              <Activity value={p.MoonActivity} />
                            ) : (
                              <span className="text-muted-foreground/60">Pas de lune</span>
                            )}
                          </td>
                          <td className={`px-4 py-1.5 text-xs tabular-nums ${freshness(p.CheckedAt, now)}`}>
                            {ago(p.CheckedAt, now)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
