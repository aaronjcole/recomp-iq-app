# RecompOne Premium — testing and launch runbook

This is the source of truth for Premium access while the app is in testing and for the transition to a paid launch. The implementation is deliberately fail-closed: seeing a Premium card never grants access, and an unavailable entitlement check leaves every Premium feature locked.

## What is available now

| Feature | Route | Individual product ID | Data handling |
|---|---|---|---|
| Adaptive weekly meal plan + grocery list | `/nutrition/meal-plan` | `adaptive_meal_plans` | Server-generated from the signed-in user's current targets and recent progress. |
| Adaptive 4–6 week training block | `/training/plan` | `adaptive_training_blocks` | Server-generated from schedule, equipment, recent sessions, and recovery signals. |
| Weekly Autopilot Review | `/today/autopilot` | `weekly_autopilot` | Server-generated seven-day scorecard with one prioritized next action. |
| Visual Progress Check | `/progress/visual-check` | `visual_progress_checks` | Reads existing photos from this device's IndexedDB. No upload, AI analysis, body-fat estimate, or medical claim. |

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

### AI body-composition scanning

The older `BodyCompositionScan` remains off by default. It uploads sensitive photos, makes exact body-fat/lean-mass estimates, and cannot yet guarantee immediate private-file deletion because Base44's documented integrations expose private upload and signed URL creation but not a delete-file operation.

The shipped Visual Progress Check is the safe testing alternative: comparison stays on-device and is descriptive only. Do not enable the older scanner until retention/deletion, explicit consent, estimate validation, usage limits, and Play Data Safety disclosures are approved.

Reference: [Base44 integrations reference](https://docs.base44.com/developers/references/sdk/docs/type-aliases/integrations)

## Release invariants

- Premium UI is discoverable while locked; data access and generation are not.
- Server-backed Premium features verify entitlement before reading fitness history.
- Visual Progress Check never sends photos or photo metadata to Base44 or an AI provider.
- No entitlement stores an email, purchase receipt, profile field, or health metric.
- In-app account deletion removes server-owned Premium entitlements and the current device's progress photos.
- Both brand PNGs remain in the repository.
