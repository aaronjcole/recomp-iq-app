import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { EMPTY_PREMIUM_ACCESS, PREMIUM_FEATURES } from "../../base44/shared/premiumDomain";

const PremiumAccessContext = createContext(null);

/**
 * @typedef {object} PremiumAccessState
 * @property {boolean} hasAnyAccess
 * @property {boolean} hasBundleAccess
 * @property {boolean} testerAccess
 * @property {Record<string, boolean>} features
 * @property {{bodyCompositionScan: boolean}} releaseFlags
 * @property {readonly string[]} products
 * @property {readonly string[]} sources
 */

function normalizeResponse(result) {
  const access = result?.data ?? result;
  if (!access || typeof access !== "object" || typeof access.features !== "object") {
    return EMPTY_PREMIUM_ACCESS;
  }
  return {
    hasAnyAccess: access.hasAnyAccess === true,
    hasBundleAccess: access.hasBundleAccess === true,
    testerAccess: access.testerAccess === true,
    hasLifestyleCoach: access.features?.[PREMIUM_FEATURES.AI_LIFESTYLE_COACH] === true,
    features: Object.fromEntries(
      Object.values(PREMIUM_FEATURES).map((feature) => [feature, access.features[feature] === true])
    ),
    releaseFlags: {
      bodyCompositionScan: access.releaseFlags?.bodyCompositionScan === true
    },
    products: Array.isArray(access.products)
      ? access.products.filter((product) => typeof product === "string")
      : [],
    sources: Array.isArray(access.sources)
      ? access.sources.filter((source) => typeof source === "string")
      : []
  };
}

export function PremiumAccessProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [access, setAccess] = useState(
    /** @type {PremiumAccessState} */ (EMPTY_PREMIUM_ACCESS)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestVersion.current;
    if (!isAuthenticated || !user?.id) {
      setAccess(EMPTY_PREMIUM_ACCESS);
      setIsUnavailable(false);
      setIsLoading(false);
      return EMPTY_PREMIUM_ACCESS;
    }

    setIsLoading(true);
    setIsUnavailable(false);
    try {
      const result = await base44.functions.invoke("getPremiumAccess", {});
      const nextAccess = normalizeResponse(result);
      if (requestId === requestVersion.current) setAccess(nextAccess);
      return nextAccess;
    } catch {
      if (requestId === requestVersion.current) {
        setAccess(EMPTY_PREMIUM_ACCESS);
        setIsUnavailable(true);
      }
      return EMPTY_PREMIUM_ACCESS;
    } finally {
      if (requestId === requestVersion.current) setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    ...access,
    isLoading,
    isUnavailable,
    canAccess: (feature) => access.features[feature] === true,
    refresh
  }), [access, isLoading, isUnavailable, refresh]);

  return (
    <PremiumAccessContext.Provider value={value}>
      {children}
    </PremiumAccessContext.Provider>
  );
}

export function usePremiumAccess() {
  const context = useContext(PremiumAccessContext);
  if (!context) throw new Error("usePremiumAccess must be used within PremiumAccessProvider");
  return context;
}
