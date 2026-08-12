import { KingdomExperience } from "@/components/kingdom";
import { DEFAULT_KINGDOM_SEASON } from "@/lib/kingdom";

export default function HomePage() {
  return <KingdomExperience initialMode="landing" initialSeason={DEFAULT_KINGDOM_SEASON} />;
}
