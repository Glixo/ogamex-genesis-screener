import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "https://genesis.ogamex.net",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
    },
  });
}

function tokenOk(header: string | null, expected: string) {
  if (!header?.startsWith("Bearer ")) return false;

  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/ogamex-watch-list")({
  server: {
    handlers: {
      // TEST TEMPORAIRE :
      // permet de vérifier si POST fonctionne alors que GET renvoie 404
      POST: async () =>
        json({
          success: true,
          test: "watch-list-post-ok",
        }),

      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: CORS,
        }),

      GET: async ({ request }) => {
        const token = process.env["OGAMEX_SYNC_TOKEN"] ?? "";

        if (
          !token ||
          !tokenOk(request.headers.get("Authorization"), token)
        ) {
          return json(
            {
              success: false,
              error: "Unauthorized",
            },
            401,
          );
        }

        const url = process.env["EXTERNAL_SUPABASE_URL"] ?? "";
        const key = process.env["EXTERNAL_SUPABASE_SECRET_KEY"] ?? "";

        if (!url || !key) {
          return json(
            {
              success: false,
              error: "Supabase configuration missing",
            },
            500,
          );
        }

        const headers: Record<string, string> = {
          apikey: key,
          Authorization: `Bearer ${key}`,
        };

        // 1. Récupération des joueurs surveillés
        const watchedRes = await fetch(
          `${url.replace(/\/$/, "")}/rest/v1/watched_players?select=PlayerId,Player`,
          {
            headers,
          },
        );

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
            players: [],
            planets: [],
            systems: [],
          });
        }

        const ids = players
          .map((player) => player.PlayerId)
          .filter(Boolean);

        const filter = ids
          .map((id) => `"${String(id).replace(/"/g, '\\"')}"`)
          .join(",");

        // 2. Récupération des planètes appartenant
        // aux joueurs surveillés
        const planetsRes = await fetch(
          `${url.replace(/\/$/, "")}/rest/v1/planets?select=Coordinates,Planet,Player,PlayerId,Moon&PlayerId=in.(${encodeURIComponent(filter)})`,
          {
            headers,
          },
        );

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

        // 3. Transformation des coordonnées en systèmes
        // Exemple : 5:213:6 -> 5:213
        const systems = Array.from(
          new Set(
            planets
              .map((planet) => {
                const parts = planet.Coordinates?.split(":");

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
          const [galaxyA, systemA] = a.split(":").map(Number);
          const [galaxyB, systemB] = b.split(":").map(Number);

          return galaxyA - galaxyB || systemA - systemB;
        });

        return json({
          success: true,
          players,
          planets,
          systems,
        });
      },
    },
  },
});