import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as cloudClient } from "@/integrations/supabase/client";
import { getExternalSupabaseConfig } from "@/lib/external-supabase.functions";

export interface PlanetRow {
  Coordinates: string;
  Planet: string | null;
  Player: string | null;
  PlayerId: string | null;
  Moon: string | null;
}

// Les clés publishables ("sb_publishable_...") sont opaques : elles ne sont pas
// des JWT et ne doivent pas être envoyées en en-tête Authorization.
function createExternalFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    if (headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

let _clientPromise: Promise<SupabaseClient> | undefined;

// Client résolu une fois : Supabase externe si les secrets sont configurés,
// sinon repli sur la base Lovable Cloud.
function getClient(): Promise<SupabaseClient> {
  if (!_clientPromise) {
    _clientPromise = (async () => {
      const external = await getExternalSupabaseConfig();
      if (external) {
        return createClient(external.url, external.key, {
          global: { fetch: createExternalFetch(external.key) },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
      }
      return cloudClient as unknown as SupabaseClient;
    })();
  }
  return _clientPromise;
}

export function isSupabaseConfigured(): boolean {
  return true;
}

/** Recherche partielle, insensible à la casse, sur le pseudo joueur. */
export async function searchPlayers(query: string): Promise<{ Player: string; PlayerId: string }[]> {
  const client = await getClient();
  const { data, error } = await client
    .from("planets")
    .select("Player, PlayerId")
    .ilike("Player", `%${query}%`)
    .limit(400);
  if (error) throw error;

  const seen = new Map<string, string>();
  for (const row of (data ?? []) as Pick<PlanetRow, "Player" | "PlayerId">[]) {
    if (row.PlayerId && row.Player && !seen.has(row.PlayerId)) seen.set(row.PlayerId, row.Player);
  }
  return Array.from(seen, ([PlayerId, Player]) => ({ PlayerId, Player })).slice(0, 8);
}

/** Toutes les planètes d'un joueur, triées par galaxie, système, position. */
export async function getPlayerPlanets(playerId: string): Promise<PlanetRow[]> {
  const client = await getClient();
  const { data, error } = await client
    .from("planets")
    .select("Coordinates, Planet, Player, PlayerId, Moon")
    .eq("PlayerId", playerId);
  if (error) throw error;

  const rows = (data ?? []) as PlanetRow[];
  return rows.sort((a, b) => {
    const pa = a.Coordinates.split(":").map(Number);
    const pb = b.Coordinates.split(":").map(Number);
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
}

let _authClientPromise: Promise<SupabaseClient | null> | undefined;

/** Client Auth du Supabase externe (version Electron uniquement). Session persistée localement. */
export function getElectronAuthClient(): Promise<SupabaseClient | null> {
  if (!_authClientPromise) {
    _authClientPromise = (async () => {
      const external = await getExternalSupabaseConfig();
      if (!external) return null;
      return createClient(external.url, external.key, {
        global: { fetch: createExternalFetch(external.key) },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: "ogamex-electron-auth",
          storage: typeof window !== "undefined" ? window.localStorage : undefined,
        },
      });
    })();
  }
  return _authClientPromise;
}

export interface WatchedPlayer {
  PlayerId: string;
  Player: string | null;
  AddedAt: string;
}

async function requireAuthClient(): Promise<SupabaseClient> {
  const c = await getElectronAuthClient();
  if (!c) throw new Error("Service de connexion indisponible.");
  const { data } = await c.auth.getSession();
  if (!data.session) throw new Error("Connexion requise.");
  return c;
}

/** Joueurs surveillés (utilisateur Electron authentifié). */
export async function listWatchedPlayers(): Promise<WatchedPlayer[]> {
  const c = await requireAuthClient();
  const { data, error } = await c
    .from("watched_players")
    .select("PlayerId, Player, AddedAt")
    .order("Player", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WatchedPlayer[];
}

export async function addWatchedPlayer(playerId: string, player: string): Promise<void> {
  const c = await requireAuthClient();
  const { error } = await c
    .from("watched_players")
    .upsert({ PlayerId: playerId, Player: player }, { onConflict: "PlayerId" });
  if (error) throw error;
}

export async function removeWatchedPlayer(playerId: string): Promise<void> {
  const c = await requireAuthClient();
  const { error } = await c.from("watched_players").delete().eq("PlayerId", playerId);
  if (error) throw error;
}

export interface WatchedPlanet extends PlanetRow {
  PlanetActivity: string | null;
  MoonActivity: string | null;
  CheckedAt: string | null;
}

export interface WatchedPlayerOverview extends WatchedPlayer {
  planets: WatchedPlanet[];
}

function coordCompare(a: string, b: string) {
  const pa = a.split(":").map(Number);
  const pb = b.split(":").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Lecture paginée (aucune limite de lignes) d'une requête filtrée par une liste de valeurs. */
async function fetchAllIn<T>(
  c: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  values: string[],
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let i = 0; i < values.length; i += 100) {
    const chunk = values.slice(i, i + 100);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await c
        .from(table)
        .select(columns)
        .in(column, chunk)
        .order(column, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

/** Joueurs surveillés + toutes leurs planètes + dernière activité connue (lecture seule). */
export async function getWatchedOverview(): Promise<WatchedPlayerOverview[]> {
  const c = await requireAuthClient();
  const players = await listWatchedPlayers();
  if (players.length === 0) return [];

  const planets = await fetchAllIn<PlanetRow>(
    c,
    "planets",
    "Coordinates, Planet, Player, PlayerId, Moon",
    "PlayerId",
    players.map((p) => p.PlayerId),
  );
  const acts = await fetchAllIn<{
    Coordinates: string;
    PlanetActivity: string | null;
    MoonActivity: string | null;
    CheckedAt: string | null;
  }>(c, "planet_activity", "Coordinates, PlanetActivity, MoonActivity, CheckedAt", "Coordinates",
    planets.map((p) => p.Coordinates));
  const actBy = new Map(acts.map((a) => [a.Coordinates, a]));

  return players.map((pl) => ({
    ...pl,
    planets: planets
      .filter((p) => p.PlayerId === pl.PlayerId)
      .map((p) => {
        const a = actBy.get(p.Coordinates);
        return {
          ...p,
          PlanetActivity: a?.PlanetActivity ?? null,
          MoonActivity: a?.MoonActivity ?? null,
          CheckedAt: a?.CheckedAt ?? null,
        };
      })
      .sort((x, y) => coordCompare(x.Coordinates, y.Coordinates)),
  }));
}
