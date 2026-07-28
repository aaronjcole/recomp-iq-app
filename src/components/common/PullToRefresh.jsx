import { useRef, useState } from "react";

const THRESHOLD = 70;
const REFRESH_HEIGHT = 44;
const MAX_PULL = 110;

export default function PullToRefresh({ onRefresh, children }) {
  const [dist, setDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const distRef = useRef(0);
  const active = useRef(false);

  const onTouchStart = (e) => {
    if (refreshing || window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    active.current = true;
  };

  const onTouchMove = (e) => {
    if (!active.current || refreshing) return;
    const d = e.touches[0].clientY - startY.current;
    if (d <= 0) {
      distRef.current = 0;
      setDist(0);
      return;
    }
    const v = Math.min(MAX_PULL, d * 0.5);
    distRef.current = v;
    setDist(v);
  };

  const onTouchEnd = async () => {
    if (!active.current) return;
    active.current = false;
    if (distRef.current >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setDist(REFRESH_HEIGHT);
      distRef.current = REFRESH_HEIGHT;
      try {
        await onRefresh?.();
      } finally {
        setRefreshing(false);
        setDist(0);
        distRef.current = 0;
      }
    } else {
      setDist(0);
      distRef.current = 0;
    }
  };

  const showIndicator = refreshing || dist > 0;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="flex items-end justify-center overflow-hidden"
        style={{
          height: dist,
          transition: active.current ? "none" : "height 0.2s ease-out"
        }}
      >
        {showIndicator && (
          <div
            className={`mb-1 w-7 h-7 rounded-full border-2 border-panel2 border-t-teal ${
              refreshing ? "animate-spin" : ""
            }`}
          />
        )}
      </div>
      {children}
    </div>
  );
}