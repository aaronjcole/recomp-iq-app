import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Utensils, Dumbbell, TrendingUp, Menu } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

const tabs = [
  { to: "/", icon: LayoutDashboard, label: "Today", end: true },
  { to: "/nutrition", icon: Utensils, label: "Nutrition", end: false },
  { to: "/training", icon: Dumbbell, label: "Training", end: false },
  { to: "/progress", icon: TrendingUp, label: "Progress", end: false },
  { to: "/more", icon: Menu, label: "More", end: false }
];

export default function AppLayout() {
  useTheme();
  return (
    <div className="min-h-screen bg-bg text-foreground flex flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-6">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-md border-t border-line bg-panel/95 backdrop-blur z-50">
        <div className="flex">
          {tabs.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                  isActive ? "text-teal" : "text-muted-foreground"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}