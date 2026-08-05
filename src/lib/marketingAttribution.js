export const HERO_VARIANT = "decision_v1";

const CAMPAIGN_KEYS = Object.freeze({
  utm_source: "campaign_source",
  utm_medium: "campaign_medium",
  utm_campaign: "campaign_name",
  utm_content: "campaign_content"
});

export function sanitizeCampaignValue(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .slice(0, 80)
    .replace(/[^a-zA-Z0-9 _.-]/g, "")
    .replace(/\s+/g, " ");
}

export function buildWaitlistAttribution(search = "", { explainerViewed = false } = {}) {
  const params = new URLSearchParams(search);
  const attribution = {
    hero_variant: HERO_VARIANT,
    explainer_viewed: Boolean(explainerViewed)
  };

  for (const [queryKey, field] of Object.entries(CAMPAIGN_KEYS)) {
    const value = sanitizeCampaignValue(params.get(queryKey));
    if (value) attribution[field] = value;
  }

  return attribution;
}
