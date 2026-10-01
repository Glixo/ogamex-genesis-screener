import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Moon as MoonIcon, Rocket, Search, Satellite } from "lucide-react";
import {
  getPlayerPlanets,
  isSupabaseConfigured,
  searchPlayers,
  type PlanetRow,
} from "@/lib/supabase";
import { ElectronAuthGate } from "@/components/ElectronAuthGate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OGameX Genesis Screener — Recherche de joueurs" },
      {
        name: "description",
        content:
          "Outil de recherche de joueurs pour l'univers Genesis d'OGameX : localisez les planètes et les lunes de n'importe quel joueur.",
      },
      { property: "og:title", content: "OGameX Genesis Screener" },
      {
        property: "og:description",
        content:
          "Recherchez un joueur de l'univers Genesis et affichez toutes ses planètes et lunes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { electron?: string } =>
    search["electron"] != null ? { electron: String(search["electron"]) } : {},
  component: Page,
});

interface PlayerSuggestion {
  Player: string;
  PlayerId: string;
}

function Page() {
  const { electron } = Route.useSearch();
  if (electron === "1") {
    return (
      <ElectronAuthGate>
        <Index />
      </ElectronAuthGate>
    );
  }
  return <Index />;
}

function Index() {
  const configured = useMemo(() => isSupabaseConfigured(), []);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [planets, setPlanets] = useState<PlanetRow[] | null>(null);
  const [loadingPlanets, setLoadingPlanets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fermer les suggestions au clic extérieur
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Recherche avec debounce pendant la frappe
  useEffect(() => {
    if (!configured) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlayers(q);
        setSuggestions(results);
        setShowSuggestions(true);
        setError(null);
      } catch {
        setError("Erreur lors de la recherche. Vérifiez la connexion à la base de données.");
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, configured]);

  async function selectPlayer(player: PlayerSuggestion) {
    setShowSuggestions(false);
    setQuery(player.Player);
    setSelectedPlayer(player.Player);
    setLoadingPlanets(true);
    setPlanets(null);
    setError(null);
    try {
      const rows = await getPlayerPlanets(player.PlayerId);
      setPlanets(rows);
    } catch {
      setError("Impossible de récupérer les planètes de ce joueur.");
    } finally {
      setLoadingPlanets(false);
    }
  }

  async function copyCoordinates(coords: string) {
    try {
      await navigator.clipboard.writeText(coords);
      setCopied(coords);
      setTimeout(() => setCopied((c) => (c === coords ? null : c)), 1500);
    } catch {
      // presse-papiers indisponible
    }
  }

  const moonCount = planets?.filter((p) => p.Moon === "Oui").length ?? 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-10 sm:px-6 sm:py-16">
      {/* En-tête */}
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-3">
          <Rocket className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            OGameX <span className="text-primary text-glow">Genesis</span> Screener
          </h1>
        </div>
        <p className="max-w-md text-sm text-muted-foreground sm:text-base">
          Recherchez un joueur de l'univers Genesis et localisez toutes ses planètes et lunes.
        </p>
      </header>

      {!configured ? (
        <div className="mt-14 rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
          <Satellite className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Base de données non connectée</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Connectez votre projet Supabase (Paramètres du projet → Connecteurs → Supabase) pour
            activer la recherche sur la table « planets ». Aucune donnée de démonstration n'est
            affichée.
          </p>
        </div>
      ) : (
        <>
          {/* Barre de recherche */}
          <div ref={boxRef} className="relative mt-10">
            <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-4 py-3 transition-shadow focus-within:glow-ring sm:px-5 sm:py-4">
              <Search className="h-5 w-5 shrink-0 text-primary" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedPlayer(null);
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Rechercher un joueur par son pseudo…"
                className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-lg"
                autoComplete="off"
              />
              {searching && (
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg shadow-black/40">
                {suggestions.map((s) => (
                  <li key={s.PlayerId}>
                    <button
                      type="button"
                      onClick={() => selectPlayer(s)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent sm:text-base"
                    >
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <span className="text-popover-foreground">{s.Player}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {showSuggestions && !searching && suggestions.length === 0 && query.trim().length >= 2 && (
              <div className="absolute z-10 mt-2 w-full rounded-xl border border-border bg-popover px-4 py-3 text-sm text-muted-foreground">
                Aucun joueur trouvé pour « {query.trim()} ».
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loadingPlanets && (
            <div className="mt-12 flex items-center justify-center gap-3 text-muted-foreground">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Scan du secteur en cours…
            </div>
          )}

          {/* Résultats */}
          {planets && selectedPlayer && (
            <section className="mt-10">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Joueur</p>
                  <p className="mt-1 text-xl font-bold text-primary text-glow">{selectedPlayer}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Planètes trouvées
                  </p>
                  <p className="mt-1 text-xl font-bold">{planets.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Avec lune
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xl font-bold">
                    <MoonIcon className="h-5 w-5 text-primary" />
                    {moonCount}
                  </p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Coordonnées</th>
                      <th className="px-4 py-3 font-medium">Planète</th>
                      <th className="px-4 py-3 font-medium">Lune</th>
                      <th className="px-4 py-3 font-medium">
                        <span className="sr-only">Copier</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {planets.map((p) => (
                      <tr
                        key={p.Coordinates}
                        className="border-b border-border/50 transition-colors last:border-0 hover:bg-accent/40"
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-primary">
                          [{p.Coordinates}]
                        </td>
                        <td className="px-4 py-3">{p.Planet}</td>
                        <td className="px-4 py-3">
                          {p.Moon === "Oui" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                              <MoonIcon className="h-3.5 w-3.5" /> Oui
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Non</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => copyCoordinates(p.Coordinates)}
                            title="Copier les coordonnées"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            {copied === p.Coordinates ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-primary" /> Copié
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" /> Copier
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <footer className="mt-auto pt-14 text-center text-xs text-muted-foreground">
        OGameX Genesis Screener — Univers Genesis
      </footer>
    </div>
  );
}
