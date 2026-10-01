import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "https://genesis.ogamex.net",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const PlanetSchema = z.object({
  Coordinates: z.string().regex(/^\d{1,2}:\d{1,3}:\d{1,2}$/),
  Planet: z.string().max(200).nullable().optional(),
  Player: z.string().max(200).nullable().optional(),
  PlayerId: z.string().max(200).nullable().optional(),
  Moon: z.enum(["Oui", "Non"]),
});

const SyncBodySchema = z.object({
  galaxy: z.number().int().min(1).max(8),
  system: z.number().int().min(1).max(499),
  planets: z.array(PlanetSchema).max(15),
});

const WatchListBodySchema = z.object({
  action: z.literal("watch-list"),
});

function tokenOk(header: string | null, expected: string) {
  if (!header?.startsWith("Bearer ")) return false;

  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/sync-ogamex-system")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: CORS,
        }),

      POST: async ({ request }) => {
        const token = process.env["OGAMEX_SYNC_TOKEN"];
        const url = process.env["EXTERNAL_SUPABASE_URL"];
        const key = process.env["EXTERNAL_SUPABASE_SECRET_KEY"];

        if (!token || !url || !key) {
          return json(
            {
              success: false,
              error: "Server not configured",
            },
            500,
          );
        }

        if (!tokenOk(request.headers.get("authorization"), token)) {
          return json(
            {
              success: false,
              error: "Unauthorized",
            },
            401,
          );
        }

        let raw: unknown;

        try {
          raw = await request.json();
        } catch {
          return json(
            {
              success: false,
              error: "Invalid JSON",
            },
            400,
          );
        }

        /*
         * MODE SURVEILLANCE
         *
         * Body :
         * {
         *   "action": "watch-list"
         * }
         */
        const watchParsed = WatchListBodySchema.safeParse(raw);

        if (watchParsed.success) {
          const headers: Record<string, string> = {
            apikey: key,
            "Content-Type": "application/json",
          };

          if (!key.startsWith("sb_")) {
            headers["Authorization"] = `Bearer ${key}`;
          }

          // 1. Joueurs surveillés
          const watchedUrl =
            `${url.replace(/\/$/, "")}` +
            `/rest/v1/watched_players?select=PlayerId,Player`;

          const watchedRes = await fetch(watchedUrl, {
            headers,
          });

          if (!watchedRes.ok) {
            return json(
              {
                success: false,
                error: `watched_players failed: ${await watchedRes.text()}`,
              },
              502,
            );
          }

          const players = (await watchedRes.json()) as Array<{
            PlayerId: string;
            Player: string | null;
          }>;

          if (players.length === 0) {
            return json({
              success: true,
              action: "watch-list",
              players: [],
              planets: [],
              systems: [],
            });
          }

          const playerIds = players
            .map((player) => player.PlayerId)
            .filter(Boolean);

          const filter = playerIds
            .map(
              (id) =>
                `"${String(id).replace(/"/g, '\\"')}"`,
            )
            .join(",");

          // 2. Planètes de tous les joueurs surveillés
          const planetsUrl =
            `${url.replace(/\/$/, "")}` +
            `/rest/v1/planets` +
            `?select=Coordinates,Planet,Player,PlayerId,Moon` +
            `&PlayerId=in.(${encodeURIComponent(filter)})`;

          const planetsRes = await fetch(planetsUrl, {
            headers,
          });

          if (!planetsRes.ok) {
            return json(
              {
                success: false,
                error: `planets failed: ${await planetsRes.text()}`,
              },
              502,
            );
          }

          const planets = (await planetsRes.json()) as Array<{
            Coordinates: string;
            Planet: string | null;
            Player: string | null;
            PlayerId: string | null;
            Moon: string | null;
          }>;

          // 3. Liste unique des systèmes à scanner
          // 5:213:6 -> 5:213
          const systems = Array.from(
            new Set(
              planets
                .map((planet) => {
                  const parts =
                    planet.Coordinates?.split(":");

                  if (!parts || parts.length !== 3) {
                    return null;
                  }

                  return `${parts[0]}:${parts[1]}`;
                })
                .filter(
                  (value): value is string =>
                    value !== null,
                ),
            ),
          ).sort((a, b) => {
            const [galaxyA, systemA] =
              a.split(":").map(Number);

            const [galaxyB, systemB] =
              b.split(":").map(Number);

            return galaxyA - galaxyB || systemA - systemB;
          });

          return json({
            success: true,
            action: "watch-list",
            players,
            planets,
            systems,
          });
        }

        /*
         * MODE SCANNER NORMAL
         *
         * Le fonctionnement existant reste inchangé.
         */
        const parsed = SyncBodySchema.safeParse(raw);

        if (!parsed.success) {
          return json(
            {
              success: false,
              error: "Invalid payload",
              details: parsed.error.issues,
            },
            400,
          );
        }

        const { galaxy, system, planets } = parsed.data;

        const seen = new Set<string>();

        for (const p of planets) {
          const [g, s, pos = 0] =
            p.Coordinates.split(":").map(Number);

          if (
            g !== galaxy ||
            s !== system ||
            pos < 1 ||
            pos > 15
          ) {
            return json(
              {
                success: false,
                error: `Invalid coordinates ${p.Coordinates}`,
              },
              400,
            );
          }

          if (seen.has(p.Coordinates)) {
            return json(
              {
                success: false,
                error: `Duplicate coordinates ${p.Coordinates}`,
              },
              400,
            );
          }

          seen.add(p.Coordinates);
        }

        const headers: Record<string, string> = {
          apikey: key,
          "Content-Type": "application/json",
        };

        if (!key.startsWith("sb_")) {
          headers["Authorization"] = `Bearer ${key}`;
        }

        const rpcUrl =
          `${url.replace(/\/$/, "")}` +
          `/rest/v1/rpc/sync_ogamex_system`;

        const rows = planets.map((p) => ({
          Coordinates: p.Coordinates,
          Planet: p.Planet ?? null,
          Player: p.Player ?? null,
          PlayerId: p.PlayerId ?? null,
          Moon: p.Moon,
        }));

        const res = await fetch(rpcUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_galaxy: galaxy,
            p_system: system,
            p_planets: rows,
          }),
        });

        if (!res.ok) {
          return json(
            {
              success: false,
              error: `Sync failed: ${await res.text()}`,
            },
            502,
          );
        }

        return json({
          success: true,
          galaxy,
          system,
          planets: planets.length,
        });
      },
    },
  },
});