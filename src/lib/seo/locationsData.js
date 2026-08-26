// City data for local GEO landing pages. Each entry renders a unique page at
// /locations/:slug. Add cities here to expand coverage without touching routes.

export const locations = [
  {
    slug: "austin-tx",
    city: "Austin",
    state: "Texas",
    blurb:
      "Austin's active outdoor culture and busy tech workforce make sustainable body recomposition a popular goal. RecompOne helps Austin residents turn training, nutrition, and recovery data into one clear next move.",
    neighborhoods: ["Downtown Austin", "South Congress", "East Austin", "Mueller", "The Domain"]
  },
  {
    slug: "dallas-tx",
    city: "Dallas",
    state: "Texas",
    blurb:
      "From downtown fitness studios to suburban gyms across the Metroplex, Dallas residents use RecompOne to track nutrition and training trends and get adaptive guidance for fat loss and muscle retention.",
    neighborhoods: ["Uptown Dallas", "Deep Ellum", "Oak Lawn", "Preston Center", "Lower Greenville"]
  },
  {
    slug: "houston-tx",
    city: "Houston",
    state: "Texas",
    blurb:
      "Houston's year-round training climate and large fitness community make consistent progress tracking essential. RecompOne turns weight, waist, and adherence trends into evidence-backed adjustments.",
    neighborhoods: ["Montrose", "The Heights", "Midtown", "Rice Village", "Galleria"]
  },
  {
    slug: "denver-co",
    city: "Denver",
    state: "Colorado",
    blurb:
      "Denver's altitude and active lifestyle demand smart recovery and nutrition tracking. RecompOne helps Denver athletes and weekend warriors balance training load, steps, and calorie targets.",
    neighborhoods: ["LoDo", "RiNo", "Capitol Hill", "Washington Park", "Highland"]
  },
  {
    slug: "phoenix-az",
    city: "Phoenix",
    state: "Arizona",
    blurb:
      "Phoenix residents training through desert heat need careful hydration and recovery tracking. RecompOne adapts calorie and macro targets to your real weekly adherence and recovery signals.",
    neighborhoods: ["Downtown Phoenix", "Old Town Scottsdale", "Tempe", "Arcadia", "Biltmore"]
  },
  {
    slug: "los-angeles-ca",
    city: "Los Angeles",
    state: "California",
    blurb:
      "Los Angeles sets the tone for fitness culture. RecompOne gives LA residents an inspectable feedback loop that turns nutrition, training, and body-trend data into one prioritized next step.",
    neighborhoods: ["Santa Monica", "West Hollywood", "Silver Lake", "Venice", "Downtown LA"]
  },
  {
    slug: "chicago-il",
    city: "Chicago",
    state: "Illinois",
    blurb:
      "Chicago's seasonal training shifts make adaptive planning valuable. RecompOne helps Chicago residents adjust calories, macros, and step targets based on real progress rather than guesswork.",
    neighborhoods: ["Lakeview", "Lincoln Park", "West Loop", "Wicker Park", "South Loop"]
  },
  {
    slug: "atlanta-ga",
    city: "Atlanta",
    state: "Georgia",
    blurb:
      "Atlanta's growing fitness community uses RecompOne to connect nutrition logging, training sessions, and weekly check-ins into one confidence-aware recommendation for body recomposition.",
    neighborhoods: ["Midtown Atlanta", "Buckhead", "Inman Park", "Old Fourth Ward", "Virginia-Highland"]
  }
];

export function findLocation(slug) {
  return locations.find((loc) => loc.slug === slug) || null;
}