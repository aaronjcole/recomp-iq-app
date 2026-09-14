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

## First EAS setup

From this directory:

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform ios --profile development
```

The `eas init` command adds the account-specific EAS project ID to the Expo
configuration. Do not invent or commit Apple private keys to this project; EAS
manages signing credentials separately from the Base44 App Store Server API
secrets.

After the development build passes sandbox purchase tests, create the TestFlight
artifact with:

```bash
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```
