export const SUPPORT_EMAIL = "recompappsupport@gmail.com";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

const mailto = (subject, body) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const SUPPORT_REQUEST_MAILTO = mailto(
  "RecompOne support request",
  "Please describe what happened and the device/browser you were using. Do not include your password, progress photos, or sensitive health details."
);

export const ACCOUNT_DELETION_MAILTO = mailto(
  "RecompOne account deletion request",
  "Please delete the RecompOne account associated with this email address. I understand that you may need to verify account ownership before completing the request."
);

export const PRIVACY_REQUEST_MAILTO = mailto(
  "RecompOne privacy request",
  "Tell us what you need: a copy of your data, a correction, deletion, or a question about how your data is used. Send this from the email address on your RecompOne account so we can verify it. Do not include passwords or health details."
);
