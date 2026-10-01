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
    headers: {
      "Content-Type": "application/json",
      ...CORS,
    },
  });

const ActivitySchema = z.object({
  Coordinates: z
    .string()
    .regex(/^\d{1,2}:\d{1,3}:\d{1,2}$/),

  PlayerId: z
    .string()
    .max(200)
    .nullable()
    .optional(),

  PlanetActivity: z
    .string()
    .max(20)
    .nullable()
    .optional(),

  MoonActivity: z
    .string()
    .max(20)
    .nullable()
    .optional(),
});

const BodySchema = z.object({
  activities: z
    .array(ActivitySchema)
    .min(1)
    .max(500),
});

function tokenOk(
  header: string | null,
  expected: string
) {
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const received = Buffer.from(
    header.slice(7)
  );

  const wanted = Buffer.from(expected);

  return (
    received.length === wanted.length &&
    timingSafeEqual(received, wanted)
  );
}

export const Route = createFileRoute(
  "/api/public/sync-ogamex-activity"
)({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: CORS,
        }),

      POST: async ({ request }) => {
        const token =
          process.env["OGAMEX_SYNC_TOKEN"];

        const url =
          process.env[
            "EXTERNAL_SUPABASE_URL"
          ];

        const key =
          process.env[
            "EXTERNAL_SUPABASE_SECRET_KEY"
          ];

        if (!token || !url || !key) {
          return json(
            {
              success: false,
              error: "Server not configured",
            },
            500
          );
        }

        if (
          !tokenOk(
            request.headers.get(
              "authorization"
            ),
            token
          )
        ) {
          return json(
            {
              success: false,
              error: "Unauthorized",
            },
            401
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
            400
          );
        }

        const parsed =
          BodySchema.safeParse(raw);

        if (!parsed.success) {
          return json(
            {
              success: false,
              error: "Invalid payload",
              details:
                parsed.error.issues,
            },
            400
          );
        }

        const checkedAt =
          new Date().toISOString();

        const rows =
          parsed.data.activities.map(
            (activity) => ({
              Coordinates:
                activity.Coordinates,

              PlayerId:
                activity.PlayerId ??
                null,

              PlanetActivity:
                activity.PlanetActivity ??
                null,

              MoonActivity:
                activity.MoonActivity ??
                null,

              CheckedAt:
                checkedAt,
            })
          );

        const headers: Record<
          string,
          string
        > = {
          apikey: key,
          "Content-Type":
            "application/json",

          Prefer:
            "resolution=merge-duplicates,return=minimal",
        };

        /*
         * Les anciennes clés Supabase JWT
         * utilisent Authorization.
         *
         * Les nouvelles clés sb_secret_
         * fonctionnent avec apikey.
         */
        if (!key.startsWith("sb_")) {
          headers["Authorization"] =
            `Bearer ${key}`;
        }

        const endpoint =
          `${url.replace(/\/$/, "")}` +
          `/rest/v1/planet_activity` +
          `?on_conflict=Coordinates`;

        try {
          const response = await fetch(
            endpoint,
            {
              method: "POST",
              headers,
              body: JSON.stringify(rows),
            }
          );

          if (!response.ok) {
            const errorText =
              await response.text();

            return json(
              {
                success: false,
                error:
                  `Activity sync failed: ` +
                  errorText,
              },
              502
            );
          }

          return json({
            success: true,
            activities: rows.length,
            checkedAt,
          });
        } catch (error) {
          return json(
            {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
            502
          );
        }
      },
    },
  },
});