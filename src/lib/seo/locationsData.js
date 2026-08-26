// City data for local GEO landing pages. Each entry renders a unique page at
// /locations/:slug. Add cities here to expand coverage without touching routes.

export const locations = [
  {
    slug: "austin-tx",
    city: "Austin",
    state: "Texas",
    blurb:
      "Austin's active outdoor culture and busy tech workforce make sustainable body recomposition a popular goal. RecompOne helps Austin residents turn training, nutrition, and recovery data into one clear next move.",
    neighborhoods: ["Downtown Austin", "South Congress", "East Austin", "Mueller", "The Domain"],
    climate: "Austin's hot summers push training to early mornings or air-conditioned gyms from June through September.",
    activities: ["hiking the Barton Creek Greenbelt", "paddleboarding on Lady Bird Lake", "training at East Austin gyms"],
    faq: [
      { q: "How do I handle Austin's summer heat during training?", a: "Shift to early-morning or indoor sessions and track your water intake; RecompOne adjusts your weekly targets around the sessions you actually complete." },
      { q: "Is body recomposition realistic with Austin's active social food scene?", a: "Yes — RecompOne focuses on weekly consistency, so occasional dinners out don't derail your plan as long as your protein and average calories stay on track." }
    ]
  },
  {
    slug: "dallas-tx",
    city: "Dallas",
    state: "Texas",
    blurb:
      "From downtown fitness studios to suburban gyms across the Metroplex, Dallas residents use RecompOne to track nutrition and training trends and get adaptive guidance for fat loss and muscle retention.",
    neighborhoods: ["Uptown Dallas", "Deep Ellum", "Oak Lawn", "Preston Center", "Lower Greenville"],
    climate: "Dallas's hot, humid summers make indoor gyms the default from June through September, with pleasant outdoor training in spring and fall.",
    activities: ["running the Katy Trail", "training at Uptown studios", "cycling White Rock Lake"],
    faq: [
      { q: "How do Dallas residents stay consistent through summer heat?", a: "Move training indoors and track your steps; RecompOne lowers your calorie target if your activity drops and raises it again when you're back outside." },
      { q: "What's the best way to start recomposition in Dallas?", a: "Use the TDEE calculator to set a baseline, track for two to three weeks, then let RecompOne read your trends and recommend the first adjustment." }
    ]
  },
  {
    slug: "houston-tx",
    city: "Houston",
    state: "Texas",
    blurb:
      "Houston's year-round training climate and large fitness community make consistent progress tracking essential. RecompOne turns weight, waist, and adherence trends into evidence-backed adjustments.",
    neighborhoods: ["Montrose", "The Heights", "Midtown", "Rice Village", "Galleria"],
    climate: "Houston's Gulf Coast humidity makes early-morning or indoor training essential for much of the year.",
    activities: ["running Memorial Park", "training at Montrose gyms", "cycling Buffalo Bayou Park"],
    faq: [
      { q: "How does Houston's humidity affect my training targets?", a: "Humidity raises perceived effort and sweat loss; track water intake and log sessions by duration and effort, and RecompOne handles the weekly math." },
      { q: "Can I recomposition while training mostly indoors?", a: "Yes — progressive overload on indoor lifts plus tracked nutrition drives recomposition regardless of where you train." }
    ]
  },
  {
    slug: "denver-co",
    city: "Denver",
    state: "Colorado",
    blurb:
      "Denver's altitude and active lifestyle demand smart recovery and nutrition tracking. RecompOne helps Denver athletes and weekend warriors balance training load, steps, and calorie targets.",
    neighborhoods: ["LoDo", "RiNo", "Capitol Hill", "Washington Park", "Highland"],
    climate: "Denver's mile-high altitude and sunny climate support year-round outdoor training, with hydration extra important at elevation.",
    activities: ["hiking in the foothills", "running Washington Park", "training at LoDo gyms"],
    faq: [
      { q: "Does Denver's altitude affect my calorie needs?", a: "Slightly — altitude can modestly increase resting energy expenditure; track consistently and let RecompOne adjust your targets based on real weight and waist trends." },
      { q: "How do I balance mountain weekends with a training plan?", a: "Log hikes and outdoor sessions as activity; RecompOne reads your weekly totals so weekend adventures count toward your adherence." }
    ]
  },
  {
    slug: "phoenix-az",
    city: "Phoenix",
    state: "Arizona",
    blurb:
      "Phoenix residents training through desert heat need careful hydration and recovery tracking. RecompOne adapts calorie and macro targets to your real weekly adherence and recovery signals.",
    neighborhoods: ["Downtown Phoenix", "Old Town Scottsdale", "Tempe", "Arcadia", "Biltmore"],
    climate: "Phoenix's extreme summer heat makes early-morning or indoor training essential from May through September.",
    activities: ["hiking Camelback Mountain in cooler months", "training at Scottsdale gyms", "running Tempe Town Lake"],
    faq: [
      { q: "How do I train safely through Phoenix's summer heat?", a: "Shift to early-morning or indoor sessions and track water intake; RecompOne adjusts your weekly targets around the sessions you actually complete." },
      { q: "Does dehydration affect my weight tracking in Phoenix?", a: "Daily weight can swing with hydration, so use the weekly trend; RecompOne smooths daily noise into a reliable signal." }
    ]
  },
  {
    slug: "los-angeles-ca",
    city: "Los Angeles",
    state: "California",
    blurb:
      "Los Angeles sets the tone for fitness culture. RecompOne gives LA residents an inspectable feedback loop that turns nutrition, training, and body-trend data into one prioritized next step.",
    neighborhoods: ["Santa Monica", "West Hollywood", "Silver Lake", "Venice", "Downtown LA"],
    climate: "Los Angeles's mild, sunny climate supports year-round outdoor training with minimal seasonal disruption.",
    activities: ["running the Santa Monica stairs", "training at Venice outdoor gyms", "hiking Runyon Canyon"],
    faq: [
      { q: "How does LA's year-round outdoor culture help recomposition?", a: "Consistent outdoor activity keeps your step count high and your TDEE stable, making adherence easier and progress more predictable." },
      { q: "Can I track studio classes alongside strength training?", a: "Yes — log classes as cardio or sessions and RecompOne factors them into your weekly adherence and next move." }
    ]
  },
  {
    slug: "chicago-il",
    city: "Chicago",
    state: "Illinois",
    blurb:
      "Chicago's seasonal training shifts make adaptive planning valuable. RecompOne helps Chicago residents adjust calories, macros, and step targets based on real progress rather than guesswork.",
    neighborhoods: ["Lakeview", "Lincoln Park", "West Loop", "Wicker Park", "South Loop"],
    climate: "Chicago's cold, snowy winters push training indoors for months, with a strong outdoor rebound in spring and summer.",
    activities: ["running the Lakefront Trail", "training at West Loop gyms", "cycling the 606"],
    faq: [
      { q: "How do Chicago winters affect my recomposition plan?", a: "RecompOne lowers your calorie target to match reduced winter activity, then raises it as your outdoor training returns in spring." },
      { q: "Can I keep progressing with indoor-only winter training?", a: "Yes — maintain progressive overload on indoor lifts and hit your protein target; RecompOne tracks both so you retain muscle through winter." }
    ]
  },
  {
    slug: "atlanta-ga",
    city: "Atlanta",
    state: "Georgia",
    blurb:
      "Atlanta's growing fitness community uses RecompOne to connect nutrition logging, training sessions, and weekly check-ins into one confidence-aware recommendation for body recomposition.",
    neighborhoods: ["Midtown Atlanta", "Buckhead", "Inman Park", "Old Fourth Ward", "Virginia-Highland"],
    climate: "Atlanta's hot, humid summers and mild winters make spring and fall the most comfortable outdoor training seasons.",
    activities: ["running the BeltLine", "training at Midtown gyms", "hiking Piedmont Park trails"],
    faq: [
      { q: "How does Atlanta's humidity affect outdoor training?", a: "Shift intense sessions to mornings or cooler months and track water intake; RecompOne adjusts your weekly targets around what you actually log." },
      { q: "Can the BeltLine running culture support recomposition?", a: "Yes — running builds your activity base, and RecompOne keeps protein and strength training front and center so you retain muscle while leaning out." }
    ]
  },
  {
    slug: "seattle-wa",
    city: "Seattle",
    state: "Washington",
    blurb:
      "Seattle's rainy winters push training indoors for much of the year, making consistent nutrition and strength tracking especially valuable. RecompOne helps Seattle residents keep recomposition on track through every season.",
    neighborhoods: ["Capitol Hill", "Ballard", "Belltown", "Fremont", "West Seattle"],
    climate: "Seattle's cool, wet winters mean many residents shift to indoor gyms and home training from late fall through early spring.",
    activities: ["hiking in the Cascades", "kayaking on Lake Union", "indoor climbing in SoDo"],
    faq: [
      { q: "How do I stay consistent during Seattle's rainy season?", a: "Move strength training indoors and keep a simple step target — RecompOne adjusts your weekly plan around the activity you actually log, rain or shine." },
      { q: "Is body recomposition realistic with an indoor-focused routine?", a: "Yes. Progressive overload on indoor lifts plus tracked nutrition is enough to drive recomposition — you don't need outdoor training to make progress." }
    ]
  },
  {
    slug: "portland-or",
    city: "Portland",
    state: "Oregon",
    blurb:
      "Portland's outdoor-minded residents balance hiking, cycling, and gym training year-round. RecompOne gives Portland users an adaptive feedback loop that respects seasonal activity swings.",
    neighborhoods: ["Pearl District", "Alberta Arts District", "Hawthorne", "Mississippi", "Sellwood"],
    climate: "Portland's mild but wet climate keeps outdoor training feasible most of the year, with a few indoor-heavy winter weeks.",
    activities: ["cycling the Springwater Corridor", "hiking Forest Park", "bouldering in the Central Eastside"],
    faq: [
      { q: "How does RecompOne handle Portland's seasonal activity changes?", a: "Your weekly check-in reads your actual step and training logs, so when outdoor activity drops in winter, your calorie and macro targets adjust down to match." },
      { q: "Can I track cycling and hiking alongside strength training?", a: "Yes — log cardio sessions and steps alongside your lifts, and RecompOne factors all of it into your adherence and next-move recommendation." }
    ]
  },
  {
    slug: "san-francisco-ca",
    city: "San Francisco",
    state: "California",
    blurb:
      "San Francisco's steep hills and active residents make daily movement a built-in advantage. RecompOne helps SF users turn walking, training, and nutrition data into one clear weekly adjustment.",
    neighborhoods: ["Mission District", "Marina", "Noe Valley", "SoMa", "Richmond District"],
    climate: "San Francisco's cool, foggy summers and mild winters make year-round outdoor training comfortable.",
    activities: ["walking the Embarcadero", "trail running in the Presidio", "training at outdoor staircases"],
    faq: [
      { q: "Does all the walking in San Francisco count toward my targets?", a: "Yes — daily steps are a core signal. RecompOne uses your step consistency alongside training and nutrition to set realistic weekly targets." },
      { q: "How do I handle the city's microclimates when training outdoors?", a: "Track your sessions regardless of weather; RecompOne cares about consistency and load, not conditions. Adjust timing to cooler foggy mornings on hot inland days." }
    ]
  },
  {
    slug: "san-diego-ca",
    city: "San Diego",
    state: "California",
    blurb:
      "San Diego's year-round sunshine and beach culture make outdoor training a daily option. RecompOne helps San Diego residents balance high activity with smart recovery and nutrition targets.",
    neighborhoods: ["Pacific Beach", "North Park", "La Jolla", "Gaslamp Quarter", "Encinitas"],
    climate: "San Diego's warm, sunny climate supports outdoor and beach training almost every day of the year.",
    activities: ["surfing at Pacific Beach", "running along Mission Bay", "open-water swimming at La Jolla"],
    faq: [
      { q: "How does high outdoor activity affect my calorie target in San Diego?", a: "More activity means a higher TDEE. RecompOne reads your step and session logs and adjusts your calorie target up so you don't under-fuel." },
      { q: "Can I track surfing and swimming as cardio?", a: "Yes — log them as cardio sessions with duration and perceived effort, and they count toward your weekly activity adherence." }
    ]
  },
  {
    slug: "boston-ma",
    city: "Boston",
    state: "Massachusetts",
    blurb:
      "Boston's deep running culture and cold winters create sharp seasonal training shifts. RecompOne helps Boston residents adapt nutrition and training targets as conditions change.",
    neighborhoods: ["Back Bay", "South End", "Cambridge", "Beacon Hill", "Allston"],
    climate: "Boston's cold, snowy winters push training indoors for several months before a busy outdoor spring and summer.",
    activities: ["running the Charles River Esplanade", "indoor training during winter", "cycling the Minuteman Trail"],
    faq: [
      { q: "How do I adjust when Boston winters cut my outdoor activity?", a: "RecompOne lowers your calorie target to match the drop in steps and cardio, then raises it again as your outdoor training picks up in spring." },
      { q: "Is the Boston running culture compatible with body recomposition?", a: "Yes — running builds your activity base, and RecompOne keeps protein and strength training front and center so you retain muscle while leaning out." }
    ]
  },
  {
    slug: "new-york-ny",
    city: "New York",
    state: "New York",
    blurb:
      "New York's walking-heavy lifestyle and dense gym scene make daily movement easy but scheduling hard. RecompOne helps NYC residents turn fragmented routines into consistent weekly progress.",
    neighborhoods: ["Upper West Side", "Williamsburg", "Astoria", "Chelsea", "Park Slope"],
    climate: "New York's four distinct seasons shift training between outdoor walking and indoor gyms throughout the year.",
    activities: ["walking across the city", "training at boutique gyms", "running in Central Park"],
    faq: [
      { q: "Does all the walking in New York help with recomposition?", a: "Absolutely — NYC's walking volume keeps your step count high, which supports a higher calorie target and better adherence." },
      { q: "How do I fit training into a busy New York schedule?", a: "Log short, consistent sessions and let RecompOne track your weekly totals; consistency matters more than any single long workout." }
    ]
  },
  {
    slug: "philadelphia-pa",
    city: "Philadelphia",
    state: "Pennsylvania",
    blurb:
      "Philadelphia's mix of historic neighborhoods and growing fitness studios gives residents plenty of training options. RecompOne helps Philly users connect daily logging to one adaptive weekly plan.",
    neighborhoods: ["Center City", "Fishtown", "Northern Liberties", "Rittenhouse Square", "University City"],
    climate: "Philadelphia's humid summers and cold winters create indoor-heavy stretches in midsummer and midwinter.",
    activities: ["running along the Schuylkill River Trail", "training at Center City gyms", "cycling Kelly Drive"],
    faq: [
      { q: "How does RecompOne handle Philadelphia's seasonal training swings?", a: "Your weekly check-in reflects the sessions and steps you actually logged, so targets shift with the seasons rather than a fixed plan." },
      { q: "What's the best way to start recomposition in Philly?", a: "Use the TDEE calculator to set a baseline, then track weight, waist, and training for two to three weeks before letting RecompOne recommend your first adjustment." }
    ]
  },
  {
    slug: "washington-dc",
    city: "Washington",
    state: "DC",
    blurb:
      "Washington's active professionals balance long work hours with running, cycling, and gym training along the Mall and Rock Creek. RecompOne helps DC residents keep recomposition on track through busy schedules.",
    neighborhoods: ["Logan Circle", "Adams Morgan", "Navy Yard", "Georgetown", "Shaw"],
    climate: "Washington's humid summers and mild winters make spring and fall the most active outdoor seasons.",
    activities: ["running the National Mall", "cycling Rock Creek Park", "training at downtown gyms"],
    faq: [
      { q: "How do I stay consistent with a demanding DC work schedule?", a: "RecompOne focuses on weekly totals, so a few short sessions and steady steps keep you on track even during busy weeks." },
      { q: "Does running the Mall count toward my targets?", a: "Yes — log it as cardio or let your step count capture it; both feed into your weekly adherence and next-move recommendation." }
    ]
  },
  {
    slug: "miami-fl",
    city: "Miami",
    state: "Florida",
    blurb:
      "Miami's heat and beach culture make early-morning and evening training the norm. RecompOne helps Miami residents balance high activity with hydration-aware recovery and nutrition tracking.",
    neighborhoods: ["South Beach", "Wynwood", "Brickell", "Coconut Grove", "Edgewater"],
    climate: "Miami's hot, humid weather pushes most training to early mornings or air-conditioned gyms.",
    activities: ["beach training at South Beach", "running Ocean Drive", "paddleboarding in Biscayne Bay"],
    faq: [
      { q: "How does Miami's heat affect my calorie and hydration targets?", a: "Heat increases sweat loss and can raise perceived effort; track water intake and let RecompOne adjust your weekly targets based on the sessions you actually complete." },
      { q: "Can I train outdoors year-round in Miami?", a: "Yes, but shift to mornings or evenings. Log your sessions consistently and RecompOne handles the rest." }
    ]
  },
  {
    slug: "nashville-tn",
    city: "Nashville",
    state: "Tennessee",
    blurb:
      "Nashville's growing fitness scene and music-city energy keep residents active across gyms, trails, and studios. RecompOne helps Nashville users turn varied routines into one clear weekly adjustment.",
    neighborhoods: ["The Gulch", "East Nashville", "12 South", "Germantown", "Midtown"],
    climate: "Nashville's humid summers and mild winters allow year-round training with seasonal indoor stretches.",
    activities: ["running the Shelby Bottoms Greenway", "training at Midtown gyms", "cycling the Music City Bikeway"],
    faq: [
      { q: "How does RecompOne work with a varied Nashville routine?", a: "Log whatever you do — gym, trail, or studio — and RecompOne reads your weekly totals to recommend the next move." },
      { q: "What if my schedule changes week to week?", a: "RecompOne adapts weekly, so shifting session days or activity types doesn't break your plan." }
    ]
  },
  {
    slug: "minneapolis-mn",
    city: "Minneapolis",
    state: "Minnesota",
    blurb:
      "Minneapolis's harsh winters and strong outdoor summer culture create big seasonal swings in activity. RecompOne helps Minneapolis residents adjust calorie and training targets as the seasons turn.",
    neighborhoods: ["North Loop", "Uptown", "Northeast", "Dinkytown", "Linden Hills"],
    climate: "Minneapolis's bitterly cold winters push training indoors for months, while summers are highly active outdoors.",
    activities: ["lake swimming in summer", "indoor training during winter", "cycling the Grand Rounds"],
    faq: [
      { q: "How do I handle Minneapolis's big winter activity drop?", a: "RecompOne lowers your calorie target to match reduced steps and cardio in winter, then raises it as your outdoor activity returns in summer." },
      { q: "Can I maintain muscle through a long indoor winter?", a: "Yes — keep progressive overload on indoor lifts and hit your protein target; RecompOne tracks both so you retain muscle until outdoor training returns." }
    ]
  },
  {
    slug: "charlotte-nc",
    city: "Charlotte",
    state: "North Carolina",
    blurb:
      "Charlotte's mild climate and growing corporate workforce make lunchtime and evening gym sessions popular. RecompOne helps Charlotte residents turn consistent logging into adaptive recomposition guidance.",
    neighborhoods: ["Uptown", "NoDa", "Plaza Midwood", "South End", "Dilworth"],
    climate: "Charlotte's mild four-season climate supports year-round outdoor training with only short indoor stretches.",
    activities: ["running the Little Sugar Creek Greenway", "training at South End gyms", "cycling the Booty Loop"],
    faq: [
      { q: "Is Charlotte's climate good for year-round recomposition?", a: "Yes — mild winters mean you can keep outdoor activity consistent, which makes weekly adherence easier to maintain." },
      { q: "How does RecompOne fit a busy corporate schedule?", a: "Short, consistent sessions and steady steps are enough; RecompOne tracks weekly totals, not single perfect days." }
    ]
  }
];

export function findLocation(slug) {
  return locations.find((loc) => loc.slug === slug) || null;
}