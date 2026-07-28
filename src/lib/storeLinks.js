// Replace these with your live Google Play listing + app package before shipping.
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.recompiq.app";
export const APP_PACKAGE = "com.recompiq.app";
// Android intent URL: opens the app to /today if installed, else falls back to Play Store.
export const APP_INTENT_URL = `intent://today#Intent;scheme=recompiq;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;