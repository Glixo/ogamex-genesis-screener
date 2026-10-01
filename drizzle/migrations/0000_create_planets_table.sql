CREATE TABLE public.planets (
  "Coordinates" text PRIMARY KEY,
  "Planet" text,
  "Player" text,
  "PlayerId" text,
  "Moon" text
);

CREATE INDEX idx_planets_player ON public.planets ("Player");
CREATE INDEX idx_planets_player_lower ON public.planets (lower("Player"));
CREATE INDEX idx_planets_playerid ON public.planets ("PlayerId");

GRANT SELECT ON public.planets TO anon;
GRANT SELECT ON public.planets TO authenticated;
GRANT ALL ON public.planets TO service_role;

ALTER TABLE public.planets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planets are publicly readable"
  ON public.planets
  FOR SELECT
  TO anon, authenticated
  USING (true);