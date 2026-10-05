import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Dumbbell,
  Sparkles,
  ScanLine,
  Bot,
  TrendingUp,
  RotateCcw,
  Check,
  Lock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { deriveAppleAppAccountToken } from "../../../base44/shared/appleAppAccountToken";
import { useAuth } from "@/lib/AuthContext";
import { usePremiumAccess } from "@/lib/PremiumAccessContext";
import { getNativeIapBridge, hasNativeIapBridge } from "@/lib/nativeIapBridge";
import { useToast } from "@/components/ui/use-toast";
import { APPLE_PRODUCT_ANNUAL, APPLE_PRODUCT_MONTHLY, premiumPlans } from "@/lib/premiumPlans";

// Apple App Store StoreKit product IDs. Both map to the same recompone_premium
// entitlement on the server (see base44/shared/premiumDomain.js and
// base44/functions/verifyApplePurchase/entry.ts).
const PAYWALL_FEATURES = [
  { icon: CalendarDays, title: "Adaptive meal plans & grocery lists" },
  { icon: Dumbbell, title: "4–6-week adaptive training blocks" },
  { icon: Sparkles, title: "Weekly Autopilot review" },
  { icon: TrendingUp, title: "Advanced cross-signal insights" },
  { icon: Bot, title: "Lifestyle Coach" },
  { icon: ScanLine, title: "Visual Progress tools" }
];

function isNativePurchase(value) {
  return Boolean(
    value &&
    typeof value.transactionId === "string" &&
    value.transactionId.length > 0 &&
    value.transactionId.length <= 128 &&
    (value.productId === APPLE_PRODUCT_MONTHLY || value.productId === APPLE_PRODUCT_ANNUAL)
  );
}

async function verifyAndFinish(bridge, purchase) {
  await base44.functions.invoke("verifyApplePurchase", {
    transactionId: purchase.transactionId,
    productId: purchase.productId
  });
  await bridge.finishTransaction(purchase.transactionId);
}

export default function PremiumPaywall() {
  const { user } = useAuth();
  const { refresh, isUnavailable } = usePremiumAccess();
  const { toast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const bridgeAvailable = hasNativeIapBridge();
  // Localized prices and trial eligibility come from StoreKit; null = loading.
  const [products, setProducts] = useState(null);
  const [pricesUnavailable, setPricesUnavailable] = useState(false);
  // An iOS build without getProducts, or StoreKit not answering, keeps the
  // reference prices purchasable as before; Apple's sheet shows the real price.
  const legacyBridge = bridgeAvailable
    && (pricesUnavailable || typeof getNativeIapBridge()?.getProducts !== "function");

  useEffect(() => {
    const bridge = getNativeIapBridge();
    if (!bridge || typeof bridge.getProducts !== "function") return undefined;
    let active = true;
    let timer = null;
    // The App Store connection can still be starting when the paywall opens.
    const attempt = (remaining) => {
      bridge.getProducts()
        .then((result) => {
          if (active) setProducts(Array.isArray(result?.products) ? result.products : []);
        })
        .catch(() => {
          if (!active) return;
          if (remaining > 0) timer = setTimeout(() => attempt(remaining - 1), 1500);
          else setPricesUnavailable(true);
        });
    };
    attempt(3);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const plans = premiumPlans({ storeKit: bridgeAvailable, products, legacyBridge });

  async function handlePlanSelect(productId) {
    if (!bridgeAvailable || isBusy) return;
    setIsBusy(true);
    try {
      const bridge = getNativeIapBridge();
      if (!bridge) throw new Error("Native StoreKit bridge is unavailable");
      if (!user?.id) throw new Error("A signed-in account is required");
      const appAccountToken = await deriveAppleAppAccountToken(user.id);
      // Native presents StoreKit and returns only the transaction metadata.
      // Verification stays in this authenticated Base44 session, so the native
      // layer never receives the Base44 access token. StoreKit is finished only
      // after the server has confirmed and recorded the entitlement.
      const result = await bridge.requestPurchase(productId, appAccountToken);
      if (!isNativePurchase(result) || result.productId !== productId) {
        throw new Error("StoreKit returned an unexpected transaction");
      }
      await verifyAndFinish(bridge, result);
      const access = await refresh();
      if (!access.hasBundleAccess) throw new Error("Premium access was not confirmed");
      toast({ title: "Premium unlocked", description: "Your subscription is active." });
    } catch {
      toast({ title: "Purchase incomplete", description: "The purchase was not completed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRestore() {
    if (!bridgeAvailable || isBusy) return;
    setIsBusy(true);
    try {
      const bridge = getNativeIapBridge();
      if (!bridge) throw new Error("Native StoreKit bridge is unavailable");
      // StoreKit returns active transactions; each one is verified through the
      // signed-in Base44 client before native code finishes the transaction.
      const result = await bridge.restorePurchases();
      const purchases = Array.isArray(result?.purchases)
        ? result.purchases.filter(isNativePurchase)
        : [];
      let verified = 0;
      for (const purchase of purchases) {
        try {
          await verifyAndFinish(bridge, purchase);
          verified += 1;
        } catch {
          // Leave an unverified StoreKit transaction unfinished so it can be
          // delivered again rather than silently granting or discarding access.
        }
      }
      const access = await refresh();
      toast({
        title: access.hasBundleAccess ? "Purchases restored" : "No active purchase found",
        description: verified > 0 && access.hasBundleAccess
          ? "Your Premium access has been restored."
          : "No previous purchases were found."
      });
    } catch {
      toast({ title: "Restore failed", description: "Could not restore purchases. Try again later." });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-line bg-panel">
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">RecompOne Premium</h2>
            <p className="text-sm text-muted-foreground">
              Your all-in-one adaptive nutrition, training, and coaching toolkit.
            </p>
          </div>
          <ul className="space-y-2.5">
            {PAYWALL_FEATURES.map(({ icon: Icon, title }) => (
              <li key={title} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {title}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Food, workout, sleep, habit, and progress tracking remain free.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3" aria-label="Premium plans">
        {plans.map((plan) => (
          <Card
            key={plan.productId}
            className={`border-line bg-panel ${plan.highlighted ? "ring-2 ring-teal" : ""}`}
          >
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{plan.label}</p>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{plan.priceLabel}</p>
                  <p className="text-xs text-muted-foreground">{plan.periodLabel}</p>
                </div>
              </div>
              {plan.badge && (
                <span className="inline-flex items-center rounded-full bg-teal/15 px-2.5 py-1 text-xs font-medium text-teal">
                  {plan.badge}
                </span>
              )}
              <Button
                className="w-full"
                disabled={!bridgeAvailable || isBusy || !plan.purchasable}
                onClick={() => handlePlanSelect(plan.productId)}
              >
                {bridgeAvailable ? `Subscribe ${plan.label}` : "Available in the iOS app"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full border-line"
        disabled={!bridgeAvailable || isBusy}
        onClick={handleRestore}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {bridgeAvailable ? "Restore Purchases" : "Restore Purchases (in iOS app)"}
      </Button>

      <div className="space-y-2 text-xs text-muted-foreground" aria-label="Subscription terms">
        <p>
          RecompOne Premium is an auto-renewing subscription, monthly or annual. Payment is charged
          to your Apple ID at confirmation of purchase. The subscription renews automatically at
          the price shown unless it is cancelled at least 24 hours before the end of the current
          period, and your account is charged for renewal within the 24 hours before the period
          ends. Manage or cancel it in your Apple ID's subscription settings. Any unused part of a
          free trial ends when you buy a subscription.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/terms" className="underline underline-offset-2">Terms of Use</Link>
          <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>
        </p>
      </div>

      {!bridgeAvailable && (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Subscriptions are managed by the App Store on iOS.
        </p>
      )}

      {isUnavailable && (
        <p className="text-center text-xs text-gold" role="status">
          Premium status is temporarily unavailable. Access remains locked until it can be verified.
        </p>
      )}
    </div>
  );
}
