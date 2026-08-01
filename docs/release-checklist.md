# RecompIQ release checklist

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
- [ ] Account deletion removes the disposable user's hosted records and current-device photos.
- [ ] Privacy and Terms pages load while signed out.
- [ ] Keyboard navigation, focus restoration, and Escape work in dialogs.
- [ ] Core flows render correctly on current iOS Safari and Android Chrome.

## Release decision

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:fitness`
- [ ] `npm run test:security`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] GitHub Actions is green.
- [ ] CodeQL is green; secret scanning, push protection, Dependabot alerts, and `main` branch protection are enabled.
- [ ] No secrets are present in the current tree or Git history.
- [ ] Remaining audit findings are documented with reachability and mitigation.
- [ ] A rollback commit or previously known-good deployment is identified.
- [ ] The pull request is taken out of draft only after the deployed smoke test passes.
