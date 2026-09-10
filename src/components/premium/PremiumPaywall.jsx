import { useState } from "react";
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

// Apple App Store StoreKit product IDs. Both map to the same recompone_premium
// entitlement on the server (see base44/shared/premiumDomain.js and
// base44/functions/verifyApplePurchase/entry.ts). Inlined here because frontend
// code cannot import from base44/shared/.
const APPLE_PRODUCT_MONTHLY = "recompone_premium_monthly";
const APPLE_PRODUCT_ANNUAL = "recompone_premium_annual";

const PAYWALL_FEATURES = [
  { icon: CalendarDays, title: "Adaptive meal plans & grocery lists" },
  { icon: Dumbbell, title: "4–6-week adaptive training blocks" },
  { icon: Sparkles, title: "Weekly Autopilot review" },
  { icon: TrendingUp, title: "Advanced cross-signal insights" },
  { icon: Bot, title: "Lifestyle Coach" },
  { icon: ScanLine, title: "Visual Progress tools" }
];

const PLANS = [
  {
    productId: APPLE_PRODUCT_MONTHLY,
    label: "Monthly",
    price: "$4.99",
    period: "/month",
    description: "Billed monthly. Cancel anytime."
  },
  {
    productId: APPLE_PRODUCT_ANNUAL,
    label: "Annual",
    price: "$39.99",
    period: "/year",
    description: "14-day free trial, then $39.99/year.",
    badge: "14-day free trial",
    highlighted: true
  }
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
        {PLANS.map((plan) => (
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
                  <p className="text-lg font-semibold">{plan.price}</p>
                  <p className="text-xs text-muted-foreground">{plan.period}</p>
                </div>
              </div>
              {plan.badge && (
                <span className="inline-flex items-center rounded-full bg-teal/15 px-2.5 py-1 text-xs font-medium text-teal">
                  {plan.badge}
                </span>
              )}
              <Button
                className="w-full"
                disabled={!bridgeAvailable || isBusy}
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
