# RecompOne Premium — testing and launch runbook

This is the source of truth for Premium access while the app is in testing and for the transition to a paid launch. The implementation is deliberately fail-closed: seeing a Premium card never grants access, and an unavailable entitlement check leaves every Premium feature locked.

## What is available now

| Feature | Route | Individual product ID | Data handling |
|---|---|---|---|
| Adaptive weekly meal plan + grocery list | `/nutrition/meal-plan` | `adaptive_meal_plans` | Server-generated from the signed-in user's current targets and recent progress. |
| Adaptive 4–6 week training block | `/training/plan` | `adaptive_training_blocks` | Server-generated from schedule, equipment, recent sessions, and recovery signals. |
| Weekly Autopilot Review | `/today/autopilot` | `weekly_autopilot` | Server-generated seven-day scorecard with one prioritized next action. |
| Visual progress tools | `/progress/visual-check` and Progress | `visual_progress_checks` | On-device comparison plus an optional, deploy-enabled AI body-composition range. The AI flow uses private uploads, five-minute signed links, server-side entitlement checks, and no medical claim. |

The all-in-one product ID is `recompone_premium`. It unlocks all four features. The individual product IDs above are already supported so pricing can later be bundle-only, add-on-only, or a mixture without changing feature gates.

## Give an account testing access

In the Base44 data dashboard, create one `PremiumEntitlement` record:

```text
owner_id: <the tester's Base44 User ID, not email>
product_id: recompone_premium
source: tester
status: active
expires_at: <optional ISO date-time; omit for access until revoked>
```

Use the bundle record for internal testing so every feature is available. To test an individual add-on, use its product ID instead. `PremiumEntitlement` is admin-owned; ordinary clients cannot create, read, update, or delete these records directly.

Test the following states before launch:

1. No entitlement: all four catalog cards remain visible and say they are locked.
2. Active bundle tester entitlement: all four cards say `Access granted · available now` and open their feature routes.
3. Active individual entitlement: only its mapped feature opens.
4. Revoked, expired, malformed, or unknown entitlement: access fails closed.
5. Entitlement service failure: the catalog reports that status is unavailable and all features remain locked.

## Launch cutover

Before the production launch:

1. Revoke or expire every `source: tester` record that should not survive launch.
2. Keep the current server and client checks in place. Do not replace them with a build-time flag or client-only unlock.
3. Create Google Play products whose stable IDs match the product IDs above.
4. Add a trusted purchase-verification path that validates Google Play purchase state on the server before creating or refreshing a `source: google_play`, `status: active` entitlement.
5. Revoke or expire the entitlement when a purchase is refunded, canceled, expires, or otherwise loses access.
6. Test purchase, pending, cancellation, restore, refund, reinstall, account switch, offline, and service-failure states with Play license testers.
7. Update the Play listing, Terms, Privacy Policy, and Data Safety answers before advertising Premium.

Recommended first commercial shape: one all-in-one Premium product. The individual IDs should remain available in the domain model, but launching a single bundle gives users a simpler promise and creates fewer billing and support edge cases. Add-on pricing can be introduced after real usage shows that users understand and value a feature independently.

## Platform blockers — do not route around these

### Google Play Billing

The entitlement model is ready, but it intentionally does not invent a purchase bridge. Base44 documents that its mobile app is a secure WebView and that digital goods in mobile apps require Apple/Google native billing; Base44 also says built-in StoreKit/Google Play Billing support is still being developed. Do not use Stripe or trust a browser callback to unlock Premium inside the Android app.

Confirm Base44's supported billing bridge before implementation. This is a Section 3.D platform-gated item and requires founder approval plus device/license-tester verification.

Reference: [Base44 — Uploading your app to app stores](https://docs.base44.com/documentation/building-your-app/uploading-to-app-stores)

### AI body-composition scanning — approved deploy opt-in

`BodyCompositionScan` remains off by default in source. Local Vite builds can opt in with `VITE_ENABLE_BODY_COMPOSITION_SCAN=true`. A hosted Base44 release must instead set the app Secret `ENABLE_BODY_COMPOSITION_SCAN=true`; the authenticated Premium-access function exposes only that release boolean, and the analysis endpoint independently enforces the same Secret. The founder accepted Base44's current private-file deletion limitation for the initial live test. The limitation is disclosed immediately before upload and in the Privacy Policy.

The enabled flow requires the `visual_progress` Premium entitlement in both the UI and backend. The browser uploads only to private storage; the authenticated backend verifies entitlement before reading profile data, creates five-minute signed URLs, invokes the AI provider, and returns a conservative body-fat range. Lean-mass ranges are derived on the server from the bounded result. Results remain in session storage only. Safety flags pause the flow.

Before a public Play rollout, re-review usage limits and confirm that Play Data Safety answers cover optional body photos and AI processing. Keep the on-device Visual Progress Check available as the lower-data alternative.

Reference: [Base44 integrations reference](https://docs.base44.com/developers/references/sdk/docs/type-aliases/integrations)

## Release invariants

- Premium UI is discoverable while locked; data access and generation are not.
- Server-backed Premium features verify entitlement before reading fitness history.
- Visual Progress Check never sends photos or photo metadata to Base44 or an AI provider; the separate, explicitly disclosed AI range does.
- No entitlement stores an email, purchase receipt, profile field, or health metric.
- In-app account deletion removes server-owned Premium entitlements and the current device's progress photos.
- Both brand PNGs remain in the repository.
