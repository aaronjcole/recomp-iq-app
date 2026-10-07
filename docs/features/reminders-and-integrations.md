# Reminders and integrations: design

Status: discovery. This is the privacy, consent, duplicate-data and revocation design that the roadmap requires before implementation. Nothing here is built yet. Sections marked **Decision** need a product call.

## What exists today

- **Server push plumbing exists, but nothing uses it.** `registerPushToken` and the `PushDevice` entity store APNs/FCM tokens. No app code calls the function, nothing sends a push, and no Base44 function runs on a schedule.
- **`PushDevice` is already covered** by account deletion and by the data export, which redacts the token.
- **The iOS shell** (`expo-ios/`) has no notifications library and no bridge message for notifications.
- **Android** runs in the Base44 store wrapper (`wixMobileNativeBridge`). Whether that wrapper exposes notifications is not known.
- **No health or wearable integration** exists.

## Reminders

### Recommendation: local notifications, not server push

Schedule reminders on the device with `expo-notifications` in the iOS shell. Don't send them from the server.

| | Local (on device) | Server push |
|---|---|---|
| **Needs a scheduler** | No; the OS fires them | Yes, and Base44 has no scheduled functions in this repo (unverified whether the platform offers one) |
| **Needs APNs keys and token storage** | No | Yes (`PushDevice`, key rotation, invalid-token cleanup) |
| **Data leaves the device** | No | A device token plus the reminder schedule |
| **Works offline** | Yes | No |
| **Knows "logged today?"** | Yes, the web app tells the shell when a log is saved | Server-side, from DailyLog |
| **Reaches a user who stopped opening the app** | Yes, until they turn it off | Yes |

Local covers every reminder on the roadmap. Server push only earns its cost for events the device can't know about, such as a coach reply, and none are planned.

**Decision 1:** use local notifications. If yes, `registerPushToken` and `PushDevice` should stay unused, or be removed. Storing device tokens with no purpose is data collected without a reason.

### Reminder types

All reminders are **off by default**. Each is its own opt-in.

| Reminder | Schedule | Suppressed when |
|---|---|---|
| **Weigh-in** | Daily at a chosen time (default 7:00) | Today already has a weight |
| **Weekly check-in** | A chosen weekday and time | This week's check-in is recorded |
| **Missed-log nudge** | Off, daily, or weekdays, at a chosen time (default 20:00) | Anything was logged today. At most one a day. |

**Backing off.** After three nudges in a row are ignored, the missed-log nudge pauses itself and says so in settings. Nagging is the fastest way to get notifications turned off at the OS level.

**Decision 2:** confirm these three, the defaults, and the back-off rule.

### Consent and the permission prompt

- **Ask for permission only when the user turns a reminder on.** The settings screen explains what will be sent before the iOS prompt appears; never ask at launch. App Review and users both punish an early prompt.
- **If permission is denied,** the toggle shows as blocked and links to iOS Settings. It never re-prompts.

### Notification content

**Lock-screen text never contains health data.**
- Good: "Time to weigh in", "Your weekly check-in is ready".
- Never: weights, calories, or "you're 2 lb up".

### Revocation

- **Turning a reminder off** cancels everything it scheduled.
- **Signing out and deleting the account** cancel all scheduled reminders through the bridge. Otherwise, reminders for a deleted account keep firing.
- **Turning notifications off in iOS Settings** is detected on the next app open and shown in settings.

### Where settings live

- **Store reminder settings on the device,** in the shell. They are device-scoped, like the notifications themselves.
- **Don't add a server field.** Nothing needs to sync, and the export and deletion stay unchanged.
- **The trade-off:** a second device has its own settings.

### Bridge additions

The web app hides reminder settings unless the shell supports them. A shell build without them (every current build) shows nothing, the same pattern as the legacy `getProducts` handling.

| Message | Purpose |
|---|---|
| `getReminderStatus` | Permission state plus current settings |
| `setReminders(settings)` | Requests permission if needed, then reschedules everything from scratch |
| `markLogged({ date, kinds })` | Cancels today's weigh-in and missed-log nudges once the user has logged |
| `cancelAllReminders` | Sign-out and account deletion |

All of these are pure scheduling logic that can be unit-tested in Node, like `nativeAuth.ts`. The native calls stay thin.

### Platforms

- **iOS:** as above. Needs a new EAS build and adds the `expo-notifications` plugin. Local notifications need no new entitlement.
- **Android (Base44 wrapper):** unknown. The web app shows nothing until the wrapper reports support. **Decision 3:** is Android in scope for reminders?
- **Web:** none. Web push on iOS only works from a home-screen install and is unreliable, so it isn't worth building.

## Health and wearable import (feasibility)

| Source | What it gives | What it takes | Feasibility here |
|---|---|---|---|
| **Apple Health (HealthKit)** | Weight, steps, sleep, workouts, and possibly body fat | A native module in the iOS shell (no first-party Expo module), the HealthKit entitlement, `NSHealthShareUsageDescription`, updated App Privacy labels and Privacy Policy, and closer App Review scrutiny | Good. The shell is ours. |
| **Health Connect (Android)** | The same data on Android | Native code in the Android app, which is the Base44 wrapper and not ours | Unlikely without native control of the Android build |
| **Fitbit Web API** | Steps, sleep, weight | Web OAuth, server-side token storage, encryption, refresh, rate limits, and Fitbit's app review | Possible from the web on any platform, but the most server work |
| **Garmin / Oura / Whoop** | Varies | Partner programs and approval | Not before one of the above ships |

**Decision 4:** which source comes first. The recommendation is Apple Health, read-only, starting with weight, steps and sleep.

### Duplicate data and precedence

Imported values are written to `DailyLog` with an `*_source` field per measure (for example `steps_source: "apple_health"`). A user's own manual entry always wins.

| Measure | Rule when there are several readings for the same day |
|---|---|
| **Steps** | Use the health source's daily total. Never add it to a manual entry. |
| **Weight** | The earliest reading of the day, matching "morning weigh-in". A manual entry replaces it. |
| **Sleep** | The main sleep session that ends that morning. |
| **Workouts** | Import as an `ExerciseSession` with an `external_id`, so re-syncing updates the session instead of duplicating it. |

Re-syncing a day is idempotent: the same source and the same day overwrite the imported value only.

### Revocation for imports

- **Disconnecting a source stops syncing.** It asks whether to keep or delete the values already imported; keep is the default, since they're the user's data.
- **Imported values stay in scope for export and deletion.** They live in existing entities, and the account-deletion test fails if a new entity is left out.
- **Fitbit tokens** would be server-owned rows. They go into the deletion cascade, and the export redacts them like push tokens.

### Privacy obligations before any import ships

- **Privacy Policy and App Privacy labels** must list each imported data type.
- **Health data can't be used for advertising,** and HealthKit data can't leave the user's control without consent. Telemetry must never include it.
- **The consent screen names each data type and what it's used for,** and can be revoked from the same place.

## Proposed slices

1. **Reminder scheduling logic and bridge protocol.** Pure functions with unit tests, plus web settings hidden behind bridge detection. Ships safely, because nothing shows without a new shell.
2. **iOS shell:** `expo-notifications`, the four bridge messages, and the permission flow. This needs a new EAS build and on-device testing: permission prompt, denial, rescheduling, sign-out cancel, and lock-screen copy.
3. **Missed-log nudge back-off,** and the "logged today" suppression wired from the app's log saves.
4. **Health import:** the source-precedence fields, an Apple Health read-only module, the consent screen, and the policy updates. This is its own design review, not a follow-on PR.

## Decisions needed

1. Local notifications instead of server push. If yes, leave `registerPushToken` and `PushDevice` unused or remove them.
2. The three reminder types, their defaults, and the back-off rule.
3. Whether Android is in scope.
4. Which import source comes first, and whether import is wanted before launch at all.
