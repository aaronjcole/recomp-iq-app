const DEFAULT_DESCRIPTION =
  "RecompOne turns daily nutrition, training, and recovery signals into a plan that adapts to real progress.";

const ROUTE_METADATA = Object.freeze({
  "/": {
    title: "RecompOne — Adaptive Recomposition",
    announcement: "RecompOne home",
    description:
      "Turn nutrition, training, recovery, and body-trend data into one evidence-backed next move."
  },
  "/hero": {
    title: "RecompOne — Adaptive Recomposition",
    announcement: "RecompOne overview",
    description:
      "Build a personalized nutrition and training plan that adapts to your real recomposition progress."
  },
  "/coming-soon": {
    title: "Coming Soon | RecompOne",
    announcement: "Coming soon",
    description: "Join the RecompOne Android beta and see how your fitness signals become one clear next move."
  },
  "/privacy": {
    title: "Privacy Policy | RecompOne",
    announcement: "Privacy policy",
    description: "Learn how RecompOne collects, uses, and protects your information."
  },
  "/terms": {
    title: "Terms of Service | RecompOne",
    announcement: "Terms of service",
    description: "Review the RecompOne terms of service and health disclaimer."
  },
  "/support": {
    title: "Support | RecompOne",
    announcement: "RecompOne support",
    description: "Get help with your RecompOne account and app experience."
  },
  "/delete-account": {
    title: "Delete Account | RecompOne",
    announcement: "Delete your RecompOne account",
    description: "Learn how to request deletion of your RecompOne account and data."
  },
  "/login": {
    title: "Sign In | RecompOne",
    announcement: "Sign in",
    description: "Sign in to your RecompOne account."
  },
  "/register": {
    title: "Create Account | RecompOne",
    announcement: "Create your account",
    description: "Create a RecompOne account and start building your adaptive plan."
  },
  "/forgot-password": {
    title: "Reset Password | RecompOne",
    announcement: "Reset your password",
    description: "Request a password reset for your RecompOne account."
  },
  "/reset-password": {
    title: "Choose a New Password | RecompOne",
    announcement: "Choose a new password",
    description: "Choose a new password for your RecompOne account."
  },
  "/onboarding": {
    title: "Set Up Your Plan | RecompOne",
    announcement: "Set up your plan",
    description: "Set up your RecompOne nutrition, training, and coaching preferences."
  },
  "/today": {
    title: "Today | RecompOne",
    announcement: "Today",
    description: "See today's RecompOne signal, priorities, habits, and quick log."
  },
  "/nutrition": {
    title: "Fuel | RecompOne",
    announcement: "Fuel",
    description: "Review nutrition targets, meals, recipes, and food logs."
  },
  "/nutrition/meal-plan": {
    title: "Adaptive Meal Plan | RecompOne",
    announcement: "Adaptive meal plan",
    description: "Build a seven-day meal plan and grocery list from your targets and weekly progress."
  },
  "/training": {
    title: "Training | RecompOne",
    announcement: "Training",
    description: "Plan and log training sessions with RecompOne."
  },
  "/progress": {
    title: "Progress | RecompOne",
    announcement: "Progress",
    description: "Review weight, measurements, strength, and recomposition trends."
  },
  "/plan": {
    title: "Plan | RecompOne",
    announcement: "Your plan",
    description: "Review your current adaptive RecompOne plan."
  },
  "/decisions": {
    title: "Decision History | RecompOne",
    announcement: "Decision history",
    description: "Review the adjustments and evidence behind your RecompOne plan."
  },
  "/coach": {
    title: "Coach | RecompOne",
    announcement: "Coach",
    description: "Ask the RecompOne coach for educational guidance based on your recent data."
  },
  "/more": {
    title: "More | RecompOne",
    announcement: "More",
    description: "Open RecompOne settings, plan tools, support, and account options."
  },
  "/profile": {
    title: "Profile | RecompOne",
    announcement: "Profile",
    description: "Review and update your RecompOne profile."
  },
  "/more/plan": {
    title: "Plan | RecompOne",
    announcement: "Your plan",
    description: "Review your current adaptive RecompOne plan."
  },
  "/more/decisions": {
    title: "Decision History | RecompOne",
    announcement: "Decision history",
    description: "Review the adjustments and evidence behind your RecompOne plan."
  },
  "/more/coach": {
    title: "Coach | RecompOne",
    announcement: "Coach",
    description: "Ask the RecompOne coach for educational guidance based on your recent data."
  },
  "/more/profile": {
    title: "Profile | RecompOne",
    announcement: "Profile",
    description: "Review and update your RecompOne profile."
  },
  "/more/premium": {
    title: "Premium Features | RecompOne",
    announcement: "Premium features",
    description: "Review RecompOne Premium features and testing access."
  }
});

const NOT_FOUND_METADATA = Object.freeze({
  title: "Page Not Found | RecompOne",
  announcement: "Page not found",
  description: DEFAULT_DESCRIPTION
});

export function getRouteMetadata(pathname) {
  const normalizedPath = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_METADATA[normalizedPath] ?? NOT_FOUND_METADATA;
}
