import { useEffect, useRef } from "react";
import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { LayoutDashboard, Utensils, Dumbbell, TrendingUp, Menu } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { getTabRootPath, isTabRootPath, ROOT_TAB_PATHS } from "@/lib/tabNavigation";

const tabs = [
  { to: "/today", icon: LayoutDashboard, label: "Today", end: true },
  { to: "/nutrition", icon: Utensils, label: "Fuel", end: false },
  { to: "/training", icon: Dumbbell, label: "Train", end: false },
  { to: "/progress", icon: TrendingUp, label: "Progress", end: false },
  { to: "/more", icon: Menu, label: "More", end: false }
];

export default function AppLayout() {
  useTheme();
  const location = useLocation();
  const outlet = useOutlet();
  const cache = useRef({});

  const tabRootPath = getTabRootPath(location.pathname);
  const isTabRoute = Boolean(tabRootPath);
  const isTabRoot = isTabRootPath(location.pathname);
  if (isTabRoot) cache.current[tabRootPath] = outlet;

  // Preserve scroll position per root tab (keep-alive)
  const scrollPositions = useRef({});
  const activePath = useRef(location.pathname);
  activePath.current = location.pathname;

  useEffect(() => {
    const onScroll = () => {
      const p = activePath.current;
      if (isTabRootPath(p)) scrollPositions.current[p] = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (isTabRoot) {
      const saved = scrollPositions.current[tabRootPath] ?? 0;
      requestAnimationFrame(() =>
        window.scrollTo({ top: saved, left: 0, behavior: "instant" })
      );
    }
  }, [isTabRoot, tabRootPath]);

  return (
    <div className="min-h-screen bg-bg text-foreground flex flex-col">
      <main id="main-content" tabIndex={-1} className={`mx-auto w-full max-w-md flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] ${isTabRoute ? "pb-28" : "pb-6"}`}>
        {ROOT_TAB_PATHS.filter((p) => cache.current[p]).map((p) => (
          <div key={p} className={isTabRoot && p === tabRootPath ? "" : "hidden"}>
            {cache.current[p]}
          </div>
        ))}
        <MotionConfig reducedMotion="user">
          <AnimatePresence mode="wait">
            {!isTabRoot && (
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {outlet}
              </motion.div>
            )}
          </AnimatePresence>
        </MotionConfig>
      </main>
      {isTabRoute && (
        <nav aria-label="Primary" className="fixed bottom-0 inset-x-0 mx-auto max-w-md border-t border-line bg-panel/95 backdrop-blur z-50 pb-[env(safe-area-inset-bottom)]">
          <div className="flex">
            {tabs.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                replace
                onClick={(event) => {
                  if (location.pathname !== to) return;
                  event.preventDefault();
                  scrollPositions.current[to] = 0;
                  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
                }}
                className={({ isActive }) =>
                  `flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-medium leading-tight transition-colors ${
                    isActive ? "text-teal" : "text-muted-foreground"
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px]" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
