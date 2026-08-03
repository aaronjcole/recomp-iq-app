# Base44 support escalation — over-broad Android permissions block Play release

**Why this exists:** the Base44-generated AAB requests sensitive permissions RecompOne does not
use, which Google requires a Health & Fitness app to remove. Base44 documents that generated-package
permissions are not editable in-repo, so this is a support request for a least-privilege rebuild.
Everything the repo can do about it (the `verify:android:aab` gate) is already in place and
intentionally blocks the current artifact.

Send the message below to Base44 support (`app.base44.com/support`). Track the reply and re-run
`npm run verify:android:aab` against their replacement AAB before any Play upload.

---

## Ready-to-send message

**Subject:** Least-privilege AAB rebuild needed — health app blocked by unused permissions

Hi Base44 team,

Our app is packaged through your managed Android/WebView AAB generator and is a **Health & Fitness**
app on Google Play, so Google requires that any requested permission map to actual in-app
functionality. The generated bundle currently declares several sensitive permissions and required
hardware features that RecompOne does not use, which will fail Play review and put the listing at
risk on our next update.

**App / package identity**

- Base44 app ID: `6a68bb922bf88da5ec767da3`
- Package name: `com.base6a68bb922bf88da5ec767da3.app`
- Web origin: `https://recomp-iq.base44.app`
- AAB version: `2.130297.0` (version code `2`), target API `36`

**The only capability we actually use**

- `android.permission.CAMERA` — barcode scanning for food logging (user-initiated)
- `android.permission.INTERNET`

**Please remove from the generated manifest (unused by our app):**

- Location — `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`
- Contacts — `READ_CONTACTS`, `WRITE_CONTACTS`
- Calendar — `READ_CALENDAR`, `WRITE_CALENDAR`
- Microphone / audio — `RECORD_AUDIO`, `READ_MEDIA_AUDIO`
- Phone / SMS — `CALL_PHONE`, `READ_PHONE_STATE`, `READ_SMS`, `SEND_SMS`
- Body sensors / activity — `BODY_SENSORS`, `BODY_SENSORS_BACKGROUND`, `ACTIVITY_RECOGNITION`
- Legacy broad storage — `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE`

**Please stop marking these hardware features as _required_** (they exclude devices and imply unused
capabilities):

- `android.hardware.location`
- `android.hardware.bluetooth`

Ideally the rebuilt manifest requests **only `CAMERA` + `INTERNET`**, with `CAMERA` declared as an
optional feature (`uses-feature android:required="false"`) so devices without a camera can still
install and use the rest of the app.

Two related items while you're regenerating:

1. The managed web manifest fixes native theme/background at black/white; our brand colors are
   `theme_color #12836f` / `background_color #07110f`. If branding controls exist, please apply them.
2. The embedded launcher still shows the legacy icon. We've provided the current RecompOne launcher
   at `docs/play-store/app-icon-512.png` — please use it in the regenerated bundle.

Could you regenerate a least-privilege AAB and confirm the resulting permission/feature list? Happy
to provide anything else you need. Thanks!

---

## After Base44 replies

1. Download their regenerated AAB.
2. `AAB_PATH=/path/to/app.aab npm run verify:android:aab` — the verifier must pass (it currently
   blocks the old artifact by design; see `scripts/verify-android-release.mjs` and
   `android/play-release.json`).
3. Confirm `CAMERA` is still present **and declared optional** (`uses-feature android:required="false"`,
   not just the permission), that barcode scanning survives the rebuild, and that every entry in
   `forbiddenAndroidPermissions` / `forbiddenRequiredAndroidFeatures` is gone.
4. Only then proceed with the Play Console upload and the Health Apps + Data Safety declarations in
   `docs/android-play-release.md`.

## Repo-side guardrail (already covered, keep it)

`npm run verify:android` runs in CI and `tests/security/android-release.test.js` asserts the
required/forbidden permission **contract in `android/play-release.json`** — but that is a *static*
check of the repo's declared policy, not an inspection of the generated bundle. Actual permission
scanning of an AAB only happens with `npm run verify:android:aab` (it needs `AAB_PATH` and
`BUNDLETOOL_JAR`). So CI alone will **not** catch a regenerated bundle that re-adds forbidden
permissions — that is exactly why `verify:android:aab` against Base44's rebuilt AAB must be a
mandatory manual gate before every Play upload (or wired into CI with those env vars).
