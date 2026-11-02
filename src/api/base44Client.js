import { createClient } from '@base44/sdk';
import { appParams, markAuthRedirectPending } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl,
  // The SDK otherwise sends page views and a heartbeat tagged with the user id.
  // Collection stays off until it is approved and disclosed (Privacy page,
  // Play Data Safety), matching analyticsTracker: false in vite.config.js.
  analytics: { enabled: false }
});

// Bind an OAuth/login callback to a short-lived navigation initiated by this tab.
// app-params.js rejects unsolicited access_token query parameters.
const loginWithProvider = base44.auth.loginWithProvider.bind(base44.auth);
base44.auth.loginWithProvider = (provider, fromUrl) => {
  markAuthRedirectPending();
  return loginWithProvider(provider, fromUrl);
};

const redirectToLogin = base44.auth.redirectToLogin.bind(base44.auth);
base44.auth.redirectToLogin = (nextUrl) => {
  markAuthRedirectPending();
  return redirectToLogin(nextUrl);
};
