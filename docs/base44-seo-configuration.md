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

## Per-page indexing

| Route | Search setting | Purpose |
|---|---|---|
| `/` | Index | Canonical Coming Soon marketing homepage |
| `/privacy` | Index | Public privacy policy |
| `/terms` | Index | Public terms and health disclaimer |
| `/support` | Index | Public support information |
| `/delete-account` | Index | Public account-deletion instructions |
| `/hero` | No index | Accessible web-beta sign-in gateway |
| `/coming-soon` | No index | Legacy client redirect to `/` |
| `/login` | No index | Authentication utility route |
| `/register` | No index | Authentication utility route |
| `/forgot-password` | No index | Authentication utility route |
| `/reset-password` | No index | Authentication utility route |

Pages that require login are excluded automatically by Base44. Confirm that authenticated app
routes are absent from the generated sitemap after every routing release.

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
redirects or response headers. `/coming-soon` therefore performs a React Router replacement to
`/`; its platform indexing toggle must remain off. A true 301/308 requires moving the frontend to
hosting that supports path rules or a future Base44 platform capability.

## Post-publish verification

1. Confirm `/` initial HTML contains the homepage title, description, canonical, and `index`.
2. Confirm `/hero` and the auth pages contain `noindex` in their initial HTML.
3. Confirm `/sitemap.xml` returns valid XML with an XML content type and lists only the five
   indexable public routes above.
4. Confirm `/robots.txt` returns plain text and references the canonical sitemap URL.
5. Confirm `/coming-soon` reaches `/` in the browser and remains absent from the sitemap.
6. Submit the sitemap in Google Search Console and request indexing for `/`.

## Platform references

- [Base44 SEO & GEO advanced settings](https://docs.base44.com/Performance-and-SEO/checking-your-seo-and-geo)
- [Base44 sitemap and crawler-file ownership](https://docs.base44.com/Performance-and-SEO/SEO-and-search-visibility)
- [Base44 static SPA hosting constraint](https://docs.base44.com/developers/backend/overview/features)
- [Base44 redirect limitations](https://docs.base44.com/Setting-up-your-app/Setting-up-your-custom-domain)
