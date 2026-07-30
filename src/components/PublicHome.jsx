import Hero from "@/pages/Hero";
import ComingSoon from "@/pages/ComingSoon";

export default function PublicHome() {
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  // Promo/marketing domain shows the coming-soon page; everywhere else (incl. the base44.app
  // preview and localhost) uses the normal Hero so login and the app still work.
  const isPromoDomain = host.includes("fitnesstrackerapps");
  return isPromoDomain ? <ComingSoon /> : <Hero />;
}