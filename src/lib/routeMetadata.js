const DEFAULT_DESCRIPTION =
  "RecompIQ turns daily nutrition, training, and recovery signals into a plan that adapts to real progress.";

const ROUTE_METADATA = Object.freeze({
  "/": {
    title: "RecompIQ — Adaptive Recomposition",
    announcement: "RecompIQ home",
    description:
      "Build a personalized nutrition and training plan that adapts to your real recomposition progress."
  },
  "/hero": {
    title: "RecompIQ — Adaptive Recomposition",
    announcement: "RecompIQ overview",
    description:
      "Build a personalized nutrition and training plan that adapts to your real recomposition progress."
  },
  "/coming-soon": {
    title: "Coming Soon | RecompIQ",
    announcement: "Coming soon",
    description: "Join the RecompIQ early-access list."
  },
  "/privacy": {
    title: "Privacy Policy | RecompIQ",
    announcement: "Privacy policy",
    description: "Learn how RecompIQ collects, uses, and protects your information."
  },
  "/terms": {
    title: "Terms of Service | RecompIQ",
    announcement: "Terms of service",
    description: "Review the RecompIQ terms of service and health disclaimer."
  },
  "/support": {
    title: "Support | RecompIQ",
    announcement: "RecompIQ support",
    description: "Get help with your RecompIQ account and app experience."
  },
  "/delete-account": {
    title: "Delete Account | RecompIQ",
    announcement: "Delete your RecompIQ account",
    description: "Learn how to request deletion of your RecompIQ account and data."
  },
  "/login": {
    title: "Sign In | RecompIQ",
    announcement: "Sign in",
    description: "Sign in to your RecompIQ account."
  },
  "/register": {
    title: "Create Account | RecompIQ",
    announcement: "Create your account",
    description: "Create a RecompIQ account and start building your adaptive plan."
  },
  "/forgot-password": {
    title: "Reset Password | RecompIQ",
    announcement: "Reset your password",
    description: "Request a password reset for your RecompIQ account."
  },
  "/reset-password": {
    title: "Choose a New Password | RecompIQ",
    announcement: "Choose a new password",
    description: "Choose a new password for your RecompIQ account."
  },
  "/onboarding": {
    title: "Set Up Your Plan | RecompIQ",
    announcement: "Set up your plan",
    description: "Set up your RecompIQ nutrition, training, and coaching preferences."
  },
  "/today": {
    title: "Today | RecompIQ",
    announcement: "Today",
    description: "See today's RecompIQ signal, priorities, habits, and quick log."
  },
  "/nutrition": {
    title: "Fuel | RecompIQ",
    announcement: "Fuel",
    description: "Review nutrition targets, meals, recipes, and food logs."
  },
  "/training": {
    title: "Training | RecompIQ",
    announcement: "Training",
    description: "Plan and log training sessions with RecompIQ."
  },
  "/progress": {
    title: "Progress | RecompIQ",
    announcement: "Progress",
    description: "Review weight, measurements, strength, and recomposition trends."
  },
  "/plan": {
    title: "Plan | RecompIQ",
    announcement: "Your plan",
    description: "Review your current adaptive RecompIQ plan."
  },
  "/decisions": {
    title: "Decision History | RecompIQ",
    announcement: "Decision history",
    description: "Review the adjustments and evidence behind your RecompIQ plan."
  },
  "/coach": {
    title: "Coach | RecompIQ",
    announcement: "Coach",
    description: "Ask the RecompIQ coach for educational guidance based on your recent data."
  },
  "/more": {
    title: "More | RecompIQ",
    announcement: "More",
    description: "Open RecompIQ settings, plan tools, support, and account options."
  },
  "/profile": {
    title: "Profile | RecompIQ",
    announcement: "Profile",
    description: "Review and update your RecompIQ profile."
  }
});

const NOT_FOUND_METADATA = Object.freeze({
  title: "Page Not Found | RecompIQ",
  announcement: "Page not found",
  description: DEFAULT_DESCRIPTION
});

export function getRouteMetadata(pathname) {
  const normalizedPath = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_METADATA[normalizedPath] ?? NOT_FOUND_METADATA;
}
