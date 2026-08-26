# Base44 SEO & GEO deployment configuration

Base44 serves RecompOne as a static single-page application. Keep platform meta-tag injection
enabled so crawler-visible HTML matches the route policy below. Keep Base44's generated crawler
files disabled: the generator currently labels both responses as `text/html`, which Google Search
Console can reject. With generation disabled, Base44 serves the repository's validated
`public/sitemap.xml` and `public/robots.txt` instead.

## Advanced settings

- Platform meta tag injection: **Enabled**
- Platform structured data injection: **Disabled** (RecompOne supplies the `WebSite` and
  `Organization` JSON-LD in `index.html`.)
- Generate robots.txt: **Disabled** (serve `public/robots.txt`)
- Generate sitemap.xml: **Disabled** (serve `public/sitemap.xml`)
- Primary custom domain: `https://fitnesstrackerapps.com`

> **Publish before verifying.** SEO content routes (`/tools/*`, `/learn/*`, `/tips/*`,
> `/locations/*`) only resolve after the app is published. A stale deploy returns the app's
> 404 page for these routes. After publishing, register each SEO route under Per-page
> indexing so the platform pre-renders it with the correct title, description, and canonical.

## Per-page indexing

| Route | Search setting | Purpose |
|---|---|---|
| `/` | Index | Auth-aware root redirect (authenticated → /today, unauthenticated → /coming-soon) |
| `/coming-soon` | Index | Marketing homepage — canonical URL is `https://fitnesstrackerapps.com/` |
| `/privacy` | Index | Public privacy policy |
| `/terms` | Index | Public terms and health disclaimer |
| `/support` | Index | Public support information |
| `/delete-account` | Index | Public account-deletion instructions |
| `/tools/tdee-calculator` | Index | Free TDEE calculator (SEO tool) |
| `/tools/macro-calculator` | Index | Free macro calculator (SEO tool) |
| `/learn` | Index | Learning hub index |
| `/learn/body-recomposition-guide` | Index | Long-form body recomposition guide |
| `/tips` | Index | Fitness tips hub |
| `/tips/:slug` | Index | Individual tip articles (16 articles) |
| `/locations` | Index | Local GEO locations index |
| `/locations/:slug` | Index | City landing pages (8 cities) |
| `/hero` | No index | Web-beta sign-in gateway; reachable by direct link only, not linked from `/coming-soon` |
| `/login` | No index | Authentication utility route |
| `/register` | No index | Authentication utility route |
| `/forgot-password` | No index | Authentication utility route |
| `/reset-password` | No index | Authentication utility route |

`public/sitemap.xml` is the source of truth for route inclusion. Whenever routing changes, update
and verify its exact public URL set; authenticated, authentication-utility, beta-gateway, and
other non-public routes must remain absent.

## Page metadata

Homepage title:

> RecompOne: Adaptive Body Recomposition

Homepage description:

> RecompOne turns nutrition, training, recovery, weight, and waist trends into adaptive meal plans, workout blocks, and one clear next move.

Beta gateway title:

> Beta Access | RecompOne

Beta gateway description:

> Sign in to the RecompOne web beta or create an approved tester account.

Use `https://fitnesstrackerapps.com/brand/recompone-feature-1024x500.png` for the social image and
`https://fitnesstrackerapps.com/brand/recompone-logo-primary.png` for the organization logo.

## Known hosting constraint

Base44 hosting supports static SPAs and does not expose repository-configurable, path-level HTTP
redirects or response headers. A true 301/308 from a vanity path to the canonical root would
require hosting that supports path rules or a future Base44 platform capability.

## Post-publish verification

1. Confirm `/` initial HTML contains the homepage title, description, canonical, and `index`.
2. Confirm `/hero` and the auth pages contain `noindex` in their initial HTML.
3. Confirm `/sitemap.xml` returns valid XML with `application/xml`, `text/xml`, or an
   `application/*+xml` media type (an optional charset is allowed) and lists only the five
   indexable public routes above. `text/html` is a failure.
4. Confirm `/robots.txt` returns `text/plain` (an optional charset is allowed) and references the
   canonical sitemap URL. `text/html` is a failure.
5. Confirm `/coming-soon` renders the marketing page with `index,follow` and a canonical pointing to the root URL; it should remain absent from the sitemap because its canonical is `https://fitnesstrackerapps.com/`.
6. Fetch `/tips` and `/tools/tdee-calculator` and confirm they return real content (not the app 404 page). If they 404, publish the app and register the routes under Per-page indexing.
7. Submit the sitemap in Google Search Console and request indexing for `/`.

## Platform references

- [Base44 SEO & GEO advanced settings](https://docs.base44.com/Performance-and-SEO/checking-your-seo-and-geo)
- [Base44 sitemap and crawler-file ownership](https://docs.base44.com/Performance-and-SEO/SEO-and-search-visibility)
- [Base44 static SPA hosting constraint](https://docs.base44.com/developers/backend/overview/features)
- [Base44 redirect limitations](https://docs.base44.com/Setting-up-your-app/Setting-up-your-custom-domain)