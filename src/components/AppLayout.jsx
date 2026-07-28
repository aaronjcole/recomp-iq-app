import { useRef } from "react";
import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Utensils, Dumbbell, TrendingUp, Menu } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

const tabs = [
  { to: "/today", icon: LayoutDashboard, label: "Today", end: true },
  { to: "/nutrition", icon: Utensils, label: "Fuel", end: false },
  { to: "/training", icon: Dumbbell, label: "Train", end: false },
  { to: "/progress", icon: TrendingUp, label: "Progress", end: false },
  { to: "/more", icon: Menu, label: "More", end: false }
];

const TAB_PATHS = ["/today", "/nutrition", "/training", "/progress", "/more"];

export default function AppLayout() {
  useTheme();
  const location = useLocation();
  const outlet = useOutlet();
  const cache = useRef({});

  const isTab = TAB_PATHS.includes(location.pathname);
  if (isTab) cache.current[location.pathname] = outlet;

  return (
    <div className="min-h-screen bg-bg text-foreground flex flex-col">
      <main className={`mx-auto w-full max-w-md flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] ${isTab ? "pb-28" : "pb-6"}`}>
        {TAB_PATHS.filter((p) => cache.current[p]).map((p) => (
          <div key={p} className={p === location.pathname ? "" : "hidden"}>
            {cache.current[p]}
          </div>
        ))}
        <AnimatePresence mode="wait">
          {!isTab && (
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
      </main>
      {isTab && (
        <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-md border-t border-line bg-panel/95 backdrop-blur z-50 pb-[env(safe-area-inset-bottom)]">
          <div className="flex">
            {tabs.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium leading-tight transition-colors ${
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