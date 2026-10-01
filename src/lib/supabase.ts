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
