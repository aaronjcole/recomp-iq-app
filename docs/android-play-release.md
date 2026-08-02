# Android and Google Play release

RecompIQ uses Base44's managed Android wrapper and AAB generator. Do not create a second
Bubblewrap package for the Base44 production origin: Base44 already publishes the Android package
association and owns the wrapper's upload-key workflow.

## Stable release identity

- Base44 app ID: `6a68bb922bf88da5ec767da3`
- Android package: `com.base6a68bb922bf88da5ec767da3.app`
- Production origin: `https://recomp-iq.base44.app`
- Managed mobile manifest: `https://recomp-iq.base44.app/api/apps/manifests/6a68bb922bf88da5ec767da3/manifest.json`
- Digital Asset Links: `https://recomp-iq.base44.app/.well-known/assetlinks.json`
- Privacy policy: `https://recomp-iq.base44.app/privacy`
- Terms: `https://recomp-iq.base44.app/terms`
- Support: `https://recomp-iq.base44.app/support`
- Account deletion: `https://recomp-iq.base44.app/delete-account`

The package name is permanent after the first Play release. Confirm it, the launch origin, target SDK,
version, wrapper type, exported components, and permission list in the generated AAB before creating
or uploading a Play artifact. The managed mobile manifest is controlled by Base44's dashboard
branding and may differ from the repository's `/manifest.json`; the live verifier checks both.

## Generate the AAB

1. Publish the exact approved Git revision to Base44.
2. In the Base44 editor, open **Publish → Mobile app**.
3. Run the Google Play app scan and resolve all critical findings.
4. Choose **Build Store Files → Create Google Play files**.
5. Confirm the RecompIQ icon and generate the AAB.
6. Download the AAB to a secure, non-repository location. Never commit an AAB, keystore, service
   account key, Play credential, or signing certificate private key.

The generated bundle must target Android 16 / API 36 or newer. Base44 may update its wrapper
independently, so inspect every release artifact instead of assuming the prior result still applies.

## Repository and live-origin verification

Run the deterministic repository checks:

```bash
npm run verify:android
```

Check the deployed manifest, public policy pages, package association, and certificate format:

```bash
npm run verify:android:live
```

After Play App Signing is enabled, copy the SHA-256 certificate fingerprint from **Play Console →
Setup → App integrity → App signing key certificate** and verify that Base44 publishes it:

```bash
PLAY_APP_SIGNING_SHA256="AA:BB:..." npm run verify:android:live
```

If Google login is enabled, add that same Play app-signing SHA-256 value in **Base44 → Publish →
Mobile app → Build Store Files → Google Play → More Actions → Add Google Play SHA**. Then rerun the
live verification. The Play signing certificate is different from the upload certificate.

## Inspect a downloaded AAB

Install a current JDK and download Google's `bundletool` jar outside the repository. Then run:

```bash
AAB_PATH="/secure/path/recompiq.aab" \
BUNDLETOOL_JAR="/secure/path/bundletool-all.jar" \
JAVA_BIN="/secure/path/jdk/bin/java" \
npm run verify:android:aab
```

The inspection fails when the package differs, the target SDK is below API 36, a required network
permission is absent, or an undeclared high-risk permission appears. It also reports every Android
permission, validates the upload certificate, and checks 64-bit ELF libraries for 16 KB page
alignment. Still install a Play-generated APK on a 16 KB page-size emulator before production.

Camera permission is expected only for the user-initiated barcode scanner and must be tested for
allow, deny, cancel, and retry. RecompIQ does not need location, contacts, calendar, microphone,
SMS, phone-state, physical-activity, body-sensor, or broad-storage permissions.

## Latest generated AAB audit (2026-08-01)

Base44 generated `android-2.130297.2.aab` after the approved RecompIQ icon was uploaded. Keep that
artifact outside the repository. Verified passes:

- Package `com.base6a68bb922bf88da5ec767da3.app`, target API 36, version `2.130297.0` (code 2).
- Release is not debuggable, does not opt into cleartext traffic, and uses the expected Base44
  WebView wrapper.
- The embedded launcher uses the approved RecompIQ icon.
- The upload certificate SHA-256 matches Base44's published Digital Asset Links certificate.
- All 76 arm64/x86_64 libraries use 16 KB ELF load alignment. An installed 16 KB-emulator test is
  still required.

Do **not** upload this AAB to a Play release yet. Its Base44/Wix wrapper declares unused sensitive
permissions for precise/coarse location, contacts, calendar, microphone, phone calls, legacy broad
storage, and device audio. It also marks location and Bluetooth hardware as required. RecompIQ does
not use those capabilities. For a health app, Google requires unused permissions to be removed; a
privacy-policy explanation cannot turn unused access into necessary core functionality.

Base44 documents that generated-package permissions are not editable in its interface, so repository
code cannot fix this manifest. Send Base44 support the package name, AAB version, and failing
permission/feature list and request a regenerated least-privilege bundle. Re-run
`npm run verify:android:aab` on their replacement. The verifier intentionally blocks the current
artifact.

The Base44-managed web manifest also fixes its native theme/background at black and white rather than
the desired RecompIQ teal/forest colors. The correct icon is now live; the splash colors remain a
non-blocking visual advisory unless Base44 exposes branding controls.

## Play Console completion

- Use a verified organization developer account for this health and fitness app.
- Enroll in Play App Signing and protect the upload key.
- Complete the Health Apps declaration for Activity & Fitness, Nutrition & Weight Management, and
  Sleep Management; keep the non-medical disclaimer visible.
- Complete Data Safety from actual production behavior, including profile/body metrics, nutrition,
  workouts, sleep and wellness check-ins, Coach messages, AI processing, and Base44 providers.
- Supply the public privacy and account-deletion URLs above.
- Provide a permanent reviewer account and instructions for the login-gated experience.
- Complete content rating, target audience, ads, access, and store-listing declarations.
- Run internal testing, then the required closed test if the Play account is subject to the personal
  developer production-access rule.
- Install the Play-generated build and test sign-up, Google/email login, password reset, Android back,
  deep links, keyboard/focus, offline/retry, barcode permission, support, and account deletion.

Do not advertise subscriptions or paid digital features in the Android app until Google Play Billing
and the corresponding disclosure and entitlement flows are implemented.
