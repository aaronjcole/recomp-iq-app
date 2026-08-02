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
