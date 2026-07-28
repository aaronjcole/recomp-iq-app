import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-gold text-buttonText px-4 py-2 flex items-center gap-2 text-xs font-medium shadow-md">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>You're offline — changes will sync when reconnected.</span>
    </div>
  );
}