# Marketing store links

The public website remains useful and indexable, while its primary conversion path points visitors
toward the mobile releases. Store destinations are deployment settings because internal, closed,
open-testing, and production listings can use different URLs.

## Base44 build settings

Set these only to the exact links copied from the relevant store console:

```text
VITE_GOOGLE_PLAY_URL=https://play.google.com/...
VITE_APP_STORE_URL=https://apps.apple.com/...
```

- `VITE_GOOGLE_PLAY_URL` accepts only an HTTPS `play.google.com` URL. Use the tester opt-in link
  from Play Console while the app is in beta, then replace it with the production listing URL.
- `VITE_APP_STORE_URL` accepts only an HTTPS `apps.apple.com` URL. Leave it unset until the App
  Store listing or public pre-order page exists.
- When a URL is missing or invalid, the site deliberately falls back to the launch-list email form.
  It never constructs a store listing from an assumed package or app ID.

After changing either value, publish the Base44 build and verify the homepage plus one SEO page on
both a phone-sized viewport and desktop. External store links open in a new tab with opener access
disabled.
