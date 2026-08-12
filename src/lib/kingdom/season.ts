import { DEFAULT_KINGDOM_SEASON, KINGDOM_SEASONS, type KingdomSeason } from "./types";

const kingdomSeasonSet = new Set<string>(KINGDOM_SEASONS);

export const KINGDOM_SEASON_LABELS: Readonly<Record<KingdomSeason, string>> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

export function isKingdomSeason(value: unknown): value is KingdomSeason {
  return typeof value === "string" && kingdomSeasonSet.has(value);
}

export function kingdomSeasonOrDefault(value: unknown): KingdomSeason {
  return isKingdomSeason(value) ? value : DEFAULT_KINGDOM_SEASON;
}
