# RecompOne iOS shell

This Expo app supplies the native StoreKit capability that the Base44-managed
WebView does not expose. It displays the deployed RecompOne app, injects a
strict message bridge for the two configured subscription products, and leaves
Base44 authentication and entitlement verification inside the web app.

## Security boundary

- Native code never receives or stores the Base44 access token.
- Only messages from `https://recomp-iq.base44.app` are processed.
- Only `recompone_premium_monthly` and `recompone_premium_annual` are accepted.
- New purchases include a pseudonymous `appAccountToken` that Apple signs and
  the Base44 verifier independently derives from the authenticated account.
- StoreKit transactions are not finished until the authenticated web app has
  called `verifyApplePurchase` and received server confirmation.
- A restore uses the same server verification path as a new purchase.

## Local verification

```bash
npm ci
npm run typecheck
npm run doctor
```

`react-native-iap` is a native module, so Expo Go cannot exercise purchases.
Use an EAS development build or a local `expo run:ios` build on a signed device.

## Optional meal speech input

The web Describe composer can mount the default-exported
`src/components/nutrition/MealSpeechInput.jsx` with
`{ onTranscript, disabled = false }`. It returns final text only (at most 4,000
characters); the parent retains editable typed input, review and explicit saving.
No audio, transcript or diary entry is persisted by this control or native bridge.
Existing `VoiceInput.jsx` and the StoreKit command/product allowlists are unchanged.

Speech uses `expo-speech-recognition` **57.1.1**, the library's SDK 57 line, not
the latest major. Primary references:
[versioned library docs](https://github.com/jamsch/expo-speech-recognition/tree/v57.1.1)
and [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/).
The config plugin adds `NSMicrophoneUsageDescription` and
`NSSpeechRecognitionUsageDescription` to the generated Info.plist.

**A rebuilt iOS binary is required.** Publishing the web app or updating JavaScript
does not install the native module or permissions into an existing shell. Expo Go
does not include this module. An optional native-module lookup and permission-free,
two-second capability handshake keep old/unavailable shells from crashing or
showing an unsupported native mic button. The control uses the browser recognizer
only when available in a secure top-level context with user-activation support;
otherwise it is hidden and typed input remains available.

Each session requires a web Record gesture, disclosure, a native Continue tap,
then iOS microphone/speech permission. Apple (or the browser speech provider) may
process speech online; no offline-only guarantee is made. Audio-file persistence
is explicitly disabled. Consent/permission waits time out after 30 seconds,
recording after 60 seconds, and Stop finalization after 5 seconds. Stop asks for
one final transcript; Cancel discards it. Errors, backgrounding, page navigation,
reload and component unmount abort and detach listeners. Native abort events are
drained before another capture can start. Both the frame's sender URL and the
current top-page URL must be the exact HTTPS app origin; no auth-host microphone
access or arbitrary speech options are accepted.

Local checks (Node 24 supports the TypeScript domain tests directly):

```bash
npm run typecheck
npm run test:speech
node --test ../tests/security/native-meal-speech.test.js
npx expo config --type prebuild --json
```

TypeScript, config resolution and mock recognizer tests do **not** verify iOS
compilation, OS prompts, live microphone routing or recognition quality. EAS Build
can compile and sign this app in the cloud; a local Xcode installation is needed
only for local native builds. A rebuilt binary on an iPhone is still required to
test grant/deny/restricted permission, Stop/Cancel, interruption, backgrounding,
navigation and network failures. Do not upload a binary as an incidental part of
the local checks.

## Existing EAS project

This app is already linked to `@promptlabllc/recompone-app`, project
`df0b21a1-85f8-415f-9c8c-b465f7fbc1f0`, with App Store Connect app ID
`6803546092`. Do not initialize a replacement project. Check the existing account,
project and included build allowance from this directory:

```bash
npx eas-cli whoami
npx eas-cli project:info
npx eas-cli account:usage promptlabllc --non-interactive
```

Sign in to the existing account if needed. EAS manages signing credentials
separately from the Base44 App Store Server API secrets; never commit Apple
private keys. The production profile uses remote build versions and
`autoIncrement`, so EAS selects the next build number rather than reusing the
legacy `buildNumber` in app.json.

Build a signed archive using existing credentials, without submitting it:

```bash
npx eas-cli build --platform ios --profile production --freeze-credentials --non-interactive
```

Only start the build after confirming included allowance or an approved spending
limit. A successful build produces an IPA, not an App Store release or a
TestFlight installation. Upload that exact build to TestFlight only with explicit
approval. Public App Store review/release is a separate action. Test barcode
camera access, native sign-in, speech, and sandbox purchase/restore on the rebuilt
binary before releasing it to users.
