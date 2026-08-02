# RecompOne security and data-integrity audit

Audit date: August 1, 2026

## Release decision

The source tree is substantially safer and now has repeatable security, fitness, and browser
regression checks. It should not be treated as production-ready until the deployment-only checks
below pass in Base44.

## Fixed on the release branch

- AI photo analysis now uses Base44 private storage and five-minute signed URLs instead of the
  documented public `UploadFile` path. JPEG, PNG, and WebP uploads are capped at 10 MB in the UI.
- The privacy and deletion copy now distinguishes hosted records, on-device progress photos, and
  provider-managed AI analysis files.
- The body-composition photo feature is disabled by default behind an explicit build-time flag,
  and the app exposes a monitored support/privacy address.
- Fitness calculations are bounded to entity-schema limits and have explicit regression coverage
  for extreme profiles, missing or duplicate data, stale weigh-ins, all supported goals, and recent
  projection windows.
- Base44 entity schemas have automated CRUD/RLS regression checks, including service-role account
  deletion scoping.
- CI now runs lint, typecheck, 32 fitness tests, security tests, production build, and public-browser
  smoke tests. GitHub Actions are pinned to immutable commit SHAs.
- CodeQL and Dependabot configuration are present in source.
- GitHub secret scanning, push protection, Dependabot security updates, and protected `main`
  checks are enabled.
- Daily logs and habit entries now pass through an authenticated backend reconciliation function
  instead of creating records directly in the browser.

## Deployment release blockers

1. **Private analysis runtime:** verify Base44's `InvokeLLM` accepts the short-lived signed URLs for
   both food and body photos. Confirm the URL expires and ask Base44 to document private-file
   retention and deletion. Keep body-composition scanning out of production if retention cannot be
   made acceptable for sensitive physique photos.
2. **Frame isolation:** Base44 SDK 0.8.41 forwards full API request and response data to a parent
   window while framed. Verify the deployed app has a restrictive `Content-Security-Policy`
   `frame-ancestors` directive or equivalent protection that permits only required Base44 editor
   origins. Arbitrary third-party framing is a blocker.
3. **Deployed authorization:** use two disposable normal accounts to prove each user cannot list,
   fetch, update, or delete the other's Base44 records. Confirm whether administrator access to all
   health records is intended and operationally controlled.
4. **OAuth callback integrity:** the current callback marker has a ten-minute window but is not
   bound to a cryptographic state/PKCE value. Confirm Base44's supported state mechanism and verify
   that a callback cannot swap sessions or clear an unrelated session.
5. **Cross-instance uniqueness:** Base44 does not expose a declared unique constraint or transaction
   for these entity schemas. Daily logs and habit entries now serialize same-key writes within a
   function instance and reconcile all duplicates they observe into a stable record. Test two
   simultaneous deployed instances and confirm follow-up writes remove any transient duplicate.
   Weekly check-ins still need the prepare/apply state machine in the v2 specification.
6. **Public waitlist abuse controls:** the function's in-memory limiter is per instance and forwarded
   IP headers are not a trustworthy distributed control. Configure a Base44 gateway/shared limiter
   or CAPTCHA and enforce normalized-email idempotency outside process memory.
## GitHub controls

Completed August 1, 2026 and verified through the GitHub API:

- Secret scanning, push protection, Dependabot alerts, and security updates are enabled.
- `main` requires pull requests, an up-to-date branch, `verify`, and JavaScript/TypeScript CodeQL.
- Administrator enforcement, linear history, and conversation resolution are enabled; force pushes
  and branch deletion are disabled. Approval count is zero so a solo maintainer can merge after CI.
- Dependabot groups patch updates, leaves minor updates individually reviewable, and defers major
  upgrades to dedicated migration pull requests.

## Repository history and dependencies

A pattern-based scan of every reachable Git object found no tracked or historical environment
file, private key, credential file, or high-confidence AWS, Google, GitHub, Slack, Stripe, or OpenAI
token signature. The remote has only `main` and `codex/release-stabilization`, with no tags.

`npm audit` currently reports two high entries caused by one React Router advisory affecting React
Server Components action handling. RecompOne uses declarative client-side `BrowserRouter` routes and
does not use RSC mode, route actions, or loaders, so that vulnerable path is not currently
reachable. GitHub alert 1 is dismissed as `tolerable_risk` with this rationale. Track the advisory,
retest a compatible upgrade, and remove this temporary exception as soon as the dependency line
provides a safe migration:
<https://github.com/advisories/GHSA-qwww-vcr4-c8h2>.

## Evidence and operating documents

- [Release checklist](release-checklist.md)
- [Product roadmap](product-roadmap.md)
- [Weekly Check-In v2 specification](features/weekly-check-in-v2.md)
- Base44's SDK reference documents `UploadFile` as public and `UploadPrivateFile` plus
  `CreateFileSignedUrl` as the private alternative:
  <https://docs.base44.com/developers/references/sdk/docs/type-aliases/integrations>
