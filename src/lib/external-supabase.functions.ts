import { createServerFn } from "@tanstack/react-start";

// Renvoie la configuration du Supabase externe stockée dans les Secrets du projet.
// Ces deux valeurs sont publiques par conception (clé publishable, jamais service_role).
export const getExternalSupabaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env["EXTERNAL_SUPABASE_URL"] ?? "";
  const key = process.env["EXTERNAL_SUPABASE_PUBLISHABLE_KEY"] ?? "";
  if (url.startsWith("https://") && key.startsWith("sb_publishable_")) {
    return { url, key };
  }
  return null;
});
