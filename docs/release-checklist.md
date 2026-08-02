# RecompOne release checklist

Use this checklist against a Base44 preview or staging deployment before merging a release PR.
Production accounts and production health data must not be used for automation.

## Automated checks

Install the Chromium test browser once:

```bash
npx playwright install chromium
```

Run the credential-free local public-route suite:

```bash
npm run test:e2e
```

This starts Vite with a non-secret placeholder app ID and mocks Base44's public-settings response
plus an explicit signed-out response for defensive current-user checks. It does not mock an
authenticated user, application entities, or backend functions.

Run public checks against the real Base44 deployment:

```bash
E2E_BASE_URL="https://your-preview.example" npm run test:e2e:deployed
```

To include the sign-in check, provide a disposable test user's credentials through environment
variables or CI secrets. Never put them in this repository, a committed env file, or test source.

```bash
E2E_BASE_URL="https://your-preview.example" \
E2E_USER_EMAIL="disposable-test-user@example.com" \
E2E_USER_PASSWORD="set-outside-git" \
npm run test:e2e:deployed
```

The automated authenticated check only signs in and confirms that Base44 routes the user to
onboarding or the Today page. It does not mutate or delete account data.

Playwright retains screenshots, videos, or traces only for failures/retries. Treat those artifacts
as confidential because a deployed test could capture test-user data.

## AI response moderation

The production Base44 administrator reviews `AiContentReport` records. Before public launch, name
a primary owner and a backup who can access that entity and the support inbox at
`recompappsupport@gmail.com`.

- Review new `received` reports every business day and before each production release.
- Prioritize `unsafe_health_advice` and `harmful_or_offensive`; escalate credible imminent-harm
  concerns immediately under the app's safety-response procedure.
- Move records through `received` → `reviewing` → `resolved` or `dismissed` so the queue is auditable.
- Use the stored AI reply snapshot, category, and optional reporter explanation for review. Do not
  ask users to send passwords, verification codes, photos, or additional health records by email.
- Record product or prompt remediation in the relevant issue or release notes without copying
  health-related report content into GitHub.
- Reports remain account-scoped and are deleted by the account-deletion cascade, subject to the
  exceptions disclosed in the Privacy Policy.

## Manual Base44 smoke test

- [ ] GitHub branch changes appear in the Base44 Builder preview.
- [ ] Environment injection supplies the expected app ID and API base URL.
- [ ] Email registration, OTP verification, login, logout, and password reset work.
- [ ] Google OAuth returns to the app in both the hosted page and Builder preview.
- [ ] A new user can complete onboarding; refreshing midway does not create partial core records.
- [ ] Daily nutrition, habits, weight, steps, sleep, mood, and waist values survive a refresh.
- [ ] Two rapid writes or two open tabs do not create duplicate daily or habit records.
- [ ] Creating and deleting a training session keeps linked strength logs and daily markers in sync.
- [ ] Weekly targets and projections are plausible for fat loss, maintenance, gain, and recomp goals.
- [ ] Barcode and food-photo dialogs handle permission denial, cancellation, and retry.
- [ ] Food and body-composition analysis work with private uploads; captured URLs expire and no public upload URL is produced.
- [ ] The deployed response prevents arbitrary websites from framing the app; only required Base44 editor origins are allowed.
- [ ] With two normal accounts, neither account can list, fetch, update, or delete the other's records.
- [ ] Offline messaging is accurate and queued work is not claimed to be saved when it is not.
- [ ] A signed-in user can report an AI Coach response; the report appears in `AiContentReport` and
      an administrator can move it through the moderation lifecycle.
- [ ] Account deletion removes the disposable user's hosted records and current-device photos.
- [ ] Privacy, Terms, Support, and account-deletion pages load while signed out.
- [ ] Keyboard navigation, focus restoration, and Escape work in dialogs.
- [ ] Core flows render correctly on current iOS Safari and Android Chrome.

## Release decision

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:fitness`
- [ ] `npm run test:security`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] `npm run verify:android`
- [ ] `npm run verify:android:live`
- [ ] GitHub Actions is green.
- [ ] CodeQL is green; secret scanning, push protection, Dependabot alerts, and `main` branch protection are enabled.
- [ ] No secrets are present in the current tree or Git history.
- [ ] Remaining audit findings are documented with reachability and mitigation.
- [ ] Primary and backup AI-report moderation owners are named and have tested production access.
- [ ] A rollback commit or previously known-good deployment is identified.
- [ ] The pull request is taken out of draft only after the deployed smoke test passes.

## Google Play artifact

- [ ] Base44 supplies a least-privilege replacement AAB that removes the unused location, contacts,
      calendar, microphone, phone, broad-storage, and media-audio permissions plus unrelated required
      location/Bluetooth hardware features found in the 2026-08-01 bundle audit.
- [ ] Base44's Google Play scan has no unresolved critical findings.
- [ ] The AAB package is `com.base6a68bb922bf88da5ec767da3.app` and targets API 36 or newer.
- [ ] The AAB permission list matches the released features; barcode camera access is the only
      reviewed device permission and no forbidden permission from `android/play-release.json` appears.
- [ ] The AAB contains no native libraries, or every native library passes 16 KB page-size testing.
- [ ] Play App Signing is enabled and its SHA-256 certificate is added to Base44.
- [ ] `PLAY_APP_SIGNING_SHA256="..." npm run verify:android:live` passes.
- [ ] The installed Play-generated build passes login, Google OAuth, deep-link, Android-back,
      keyboard, offline/retry, barcode-permission, support, and account-deletion testing.
- [ ] Play Console has the Health Apps, Data Safety, content-rating, target-audience, app-access,
      privacy-policy, and account-deletion declarations completed from actual production behavior.
- [ ] A permanent reviewer account and concise login instructions are available to Google Play.
