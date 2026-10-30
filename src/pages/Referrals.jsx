import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Users, Sparkles, LoaderCircle, Share2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export default function Referrals() {
  const [code, setCode] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [codeRes, statsRes] = await Promise.all([
          base44.functions.invoke("getOrCreateReferralCode", {}),
          base44.functions.invoke("getReferralStats", {})
        ]);
        if (!active) return;
        setCode(codeRes.data?.code || null);
        setStats(statsRes.data || null);
      } catch {
        // best-effort; the page still renders with a retry option
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const link = code ? `${window.location.origin}/register?ref=${code}` : "";

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Link copied", description: "Share it with friends who would like RecompOne." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: "Long-press the link to copy it manually." });
    }
  };

  const handleShare = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "RecompOne",
          text: "Join me on RecompOne — adaptive nutrition and training that adjusts to your progress.",
          url: link
        });
      } catch {
        // user cancelled; no action needed
      }
    } else {
      handleCopy();
    }
  };

  const signups = stats?.signups ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Refer friends</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your link with friends who'd like adaptive nutrition and training. Friends who sign
          up with it are counted below.
        </p>
      </div>

      <Card className="bg-panel border-line">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Share2 className="h-4 w-4 text-teal" aria-hidden="true" />
            Your referral link
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Generating your link…
            </div>
          ) : link ? (
            <>
              <div className="rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm font-mono break-all">
                {link}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={handleCopy} className="flex-1">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Copy link
                    </>
                  )}
                </Button>
                <Button onClick={handleShare} variant="outline" className="flex-1">
                  <Share2 className="h-4 w-4" /> Share
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Your link could not be loaded. Try refreshing.</p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-4 text-center">
          <Users className="mx-auto h-5 w-5 text-teal" aria-hidden="true" />
          <div className="mt-2 text-2xl font-bold tabular-nums">{signups}</div>
          <div className="text-xs text-muted-foreground">Signups</div>
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-teal" aria-hidden="true" />
            How it works
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1. Share your link.</span> Send it to
              friends who'd like adaptive nutrition and training.
            </li>
            <li>
              <span className="font-medium text-foreground">2. They sign up.</span> Friends who
              register with your link are credited to you and show up in your signups.
            </li>
          </ol>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Self-referrals aren't counted, and each friend can only be referred once. RecompOne may
        void referrals that show signs of abuse.
      </p>
    </div>
  );
}