import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { usePremiumAccess } from "@/lib/PremiumAccessContext";
import { featureFlags } from "@/lib/featureFlags";
import LifestyleCoachComingSoon from "@/components/coach/LifestyleCoachComingSoon";
import VoiceInput, { isSpeechSupported } from "@/components/VoiceInput";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  Crown,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  User,
  Zap
} from "lucide-react";

const LIFESTYLE_HISTORY_MAX = 20;
const LIFESTYLE_CONTENT_MAX = 2400;
const LIFESTYLE_HISTORY_TOTAL_MAX = 18000;
const MESSAGE_MAX = 2000;

const QUICK_ACTIONS = [
  {
    icon: Sparkles,
    label: "Tell me about your week",
    prompt: "Let me tell you about my typical week — what my days look like and how I'm eating.",
    hint: "Describe your schedule and diet so I can tailor your plan"
  },
  {
    icon: TrendingUp,
    label: "How am I trending?",
    prompt: "Based on my recent data, how am I trending? What's working and what should I adjust?",
    hint: "I'll analyze your logs and give you specific feedback"
  },
  {
    icon: SlidersHorizontal,
    label: "Adjust my plan",
    prompt: "I want to recalibrate my plan. My lifestyle has changed — can you adjust my targets?",
    hint: "Tell me what's changed and I'll update your targets"
  },
  {
    icon: Zap,
    label: "Pre-workout check",
    prompt: "How am I looking for today's workout based on my recent sleep and energy?",
    hint: "Recovery-aware session guidance for today"
  }
];

function toHistory(messages) {
  const history = messages
    .filter((m) => m.role === "user" || m.role === "coach")
    .slice(-LIFESTYLE_HISTORY_MAX)
    .map((m) => {
      const parts = m.role === "coach"
        ? [m.content, ...(m.actions ?? []), m.safetyNote].filter(Boolean)
        : [m.content];
      return { role: m.role, content: parts.join(" ").slice(0, LIFESTYLE_CONTENT_MAX) };
    })
    .filter((m) => m.content);

  while (history.length > 0 && history.reduce((t, m) => t + m.content.length, 0) > LIFESTYLE_HISTORY_TOTAL_MAX) {
    history.shift();
  }
  return history;
}

function PremiumGate({ onNavigate }) {
  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center gap-2 pb-3">
        <button onClick={() => onNavigate(-1)} className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold leading-none">Lifestyle Coach</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal/15 text-teal">
          <BrainCircuit className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="text-center space-y-2 max-w-xs">
          <h2 className="text-xl font-bold">Lifestyle Coach</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A deeply personalized coach that learns your schedule, diet, and lifestyle — and adjusts your plan accordingly. Uses voice input so you can just talk.
          </p>
        </div>
        <div className="w-full max-w-xs space-y-2.5">
          {[
            "Voice-to-text conversation",
            "Persistent memory across sessions",
            "Data-grounded, citation-specific feedback",
            "Plan adjustments from natural conversation",
            "Recovery-aware daily guidance"
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-teal shrink-0" aria-hidden="true" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
        <Button onClick={() => onNavigate("/more/premium")} className="min-h-11 w-full max-w-xs bg-teal text-buttonText hover:opacity-90">
          <Crown className="w-4 h-4 mr-2" />
          Upgrade to Premium
        </Button>
      </div>
    </div>
  );
}

export default function LifestyleCoach() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canAccess } = usePremiumAccess();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedRequest, setFailedRequest] = useState(null);
  const [planAdjustmentPending, setPlanAdjustmentPending] = useState(null);
  const scrollRef = useRef(null);

  const goBack = () => {
    const historyIndex = window.history.state?.idx ?? 0;
    if (historyIndex > 0) navigate(-1);
    else navigate("/more", { replace: true });
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text, { appendUser = true, priorHistory = messages } = {}) => {
    if (loading) return;
    const trimmed = text.trim().slice(0, MESSAGE_MAX);
    if (!trimmed) return;

    const history = toHistory(priorHistory);

    if (appendUser) {
      setMessages((current) => [...current, { role: "user", content: trimmed, clientId: crypto.randomUUID() }]);
      setInput("");
    }
    setLoading(true);
    setFailedRequest(null);

    try {
      const response = await base44.functions.invoke("lifestyleCoachReply", {
        message: trimmed,
        history
      });
      const data = response?.data ?? response ?? {};
      const reply = data.reply ?? data;
      setMessages((current) => [
        ...current,
        {
          role: "coach",
          content: reply.summary ?? "",
          actions: reply.actions ?? [],
          safetyNote: reply.safetyNote ?? null,
          planAdjustments: reply.planAdjustments ?? null,
          lifestyleUpdates: reply.lifestyleUpdates ?? null,
          messageId: data.messageId ?? null,
          clientId: crypto.randomUUID()
        }
      ]);
      if (reply.planAdjustments && Object.keys(reply.planAdjustments).length > 1) {
        setPlanAdjustmentPending(reply.planAdjustments);
      }
    } catch (error) {
      setFailedRequest({ text: trimmed, priorHistory });
      toast({
        title: "Coach is unavailable",
        description: error?.response?.data?.error || "Your message was not processed. Try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    if (!failedRequest) return;
    send(failedRequest.text, { appendUser: false, priorHistory: failedRequest.priorHistory });
  };

  const applyPlanAdjustments = async (adjustments) => {
    try {
      const { adjustment_reason, ...targets } = adjustments;
      await base44.functions.invoke("applyTargetAdjustments", { targets, reason: adjustment_reason });
      toast({ title: "Plan updated", description: "Your targets have been adjusted based on the coach recommendation." });
    } catch {
      toast({
        title: "Could not apply adjustments",
        description: "Update your targets manually in Custom Targets.",
        variant: "destructive"
      });
    } finally {
      setPlanAdjustmentPending(null);
    }
  };

  if (!featureFlags.lifestyleCoach) {
    return <LifestyleCoachComingSoon onBack={goBack} />;
  }

  if (!canAccess("ai_lifestyle_coach")) {
    return <PremiumGate onNavigate={(path) => typeof path === "string" ? navigate(path) : navigate(path)} />;
  }

  const speechAvailable = isSpeechSupported();

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center gap-2 pb-3">
        <button onClick={goBack} className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold leading-none">Lifestyle Coach</h1>
        <Badge variant="outline" className="ml-auto border-teal/40 text-teal text-label font-mono uppercase tracking-wide">
          Premium
        </Badge>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <Card className="bg-panel border-line">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
                  <BrainCircuit className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold">Your personalized coach is ready</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {speechAvailable
                      ? "Talk or type — tell me about your week, your diet, what's been hard. I'll use your real data and what you share to tailor your plan."
                      : "Tell me about your week, your diet, what's been hard. I'll use your real data and what you share to tailor your plan."}
                  </p>
                  {speechAvailable && (
                    <p className="text-xs text-teal mt-1">Tap the mic to speak directly.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2" aria-label="Suggested conversation starters">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => send(action.prompt)}
                    disabled={loading}
                    aria-label={action.prompt}
                    className="group flex min-h-[88px] flex-col items-start gap-1 rounded-xl border border-line bg-panel p-3 text-left transition-colors hover:border-teal/60 hover:bg-panel2 disabled:opacity-50"
                  >
                    <Icon className="h-4 w-4 text-teal shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium leading-snug">{action.label}</span>
                    <span className="text-xs text-muted-foreground leading-tight">{action.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <LifestyleMessage key={message.clientId} message={message} />
        ))}

        {loading && (
          <div className="flex gap-2" role="status">
            <div className="w-7 h-7 rounded-full bg-teal flex items-center justify-center shrink-0">
              <BrainCircuit className="w-4 h-4 text-buttonText" aria-hidden="true" />
            </div>
            <div className="bg-panel border border-line rounded-2xl px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Analyzing…
            </div>
          </div>
        )}

        {failedRequest && (
          <div className="flex items-center gap-2" role="alert">
            <span className="text-xs text-destructive">The last request failed.</span>
            <Button variant="outline" className="min-h-11 border-line" onClick={retry} disabled={loading}>
              <RotateCcw className="w-4 h-4" /> Retry
            </Button>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-line space-y-2">
        {messages.length > 0 && (
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 -mx-1 px-1 no-scrollbar">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => send(action.prompt)}
                  disabled={loading}
                  aria-label={action.prompt}
                  className="shrink-0 text-xs whitespace-nowrap rounded-full border border-line bg-panel px-3 py-2 min-h-11 text-muted-foreground hover:text-foreground hover:bg-panel2 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg to-transparent" />
          </div>
        )}
        <form
          onSubmit={(event) => { event.preventDefault(); send(input); }}
          className="flex gap-2 items-end"
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            maxLength={MESSAGE_MAX}
            placeholder={speechAvailable ? "Speak or type…" : "Tell your coach…"}
            className="flex-1 min-h-11 max-h-32 resize-none"
            rows={1}
            aria-label="Message your lifestyle coach"
          />
          {speechAvailable && (
            <VoiceInput
              onTranscript={(text) => setInput((prev) => (prev ? prev + " " + text : text))}
              disabled={loading}
            />
          )}
          <Button
            type="submit"
            className="min-h-11 min-w-11 bg-teal text-buttonText hover:opacity-90 shrink-0"
            disabled={loading || !input.trim()}
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center">Educational guidance, not medical advice.</p>
      </div>

      <PlanAdjustmentDialog
        adjustments={planAdjustmentPending}
        open={!!planAdjustmentPending}
        onOpenChange={(open) => { if (!open) setPlanAdjustmentPending(null); }}
        onApply={() => applyPlanAdjustments(planAdjustmentPending)}
        onNavigate={() => { setPlanAdjustmentPending(null); navigate("/nutrition?panel=targets"); }}
      />
    </div>
  );
}

function LifestyleMessage({ message }) {
  const coach = message.role === "coach";
  return (
    <div className={`flex gap-2 ${coach ? "" : "flex-row-reverse"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${coach ? "bg-teal" : "bg-panel2"}`}>
        {coach
          ? <BrainCircuit className="w-4 h-4 text-buttonText" aria-hidden="true" />
          : <User className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
      </div>
      <div className={`max-w-[82%] space-y-2 rounded-2xl px-3 py-2 text-sm ${coach ? "bg-panel border border-line" : "bg-teal text-buttonText"}`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {coach && message.actions?.length > 0 && (
          <ol className="list-decimal pl-5 space-y-1">
            {message.actions.map((action, index) => <li key={`${message.clientId}-${index}`}>{action}</li>)}
          </ol>
        )}
        {coach && message.safetyNote && (
          <div className="rounded-lg bg-questComplete text-gold p-2 flex items-start gap-2 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{message.safetyNote}</span>
          </div>
        )}
        {coach && message.lifestyleUpdates && (
          <div className="rounded-lg bg-teal/10 border border-teal/20 p-2 flex items-start gap-2 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-teal" aria-hidden="true" />
            <span className="text-muted-foreground">Lifestyle profile updated based on what you shared.</span>
          </div>
        )}
        {coach && message.planAdjustments && (
          <div className="rounded-lg border border-teal/40 bg-teal/10 p-2 text-xs">
            <div className="font-medium text-foreground mb-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal" aria-hidden="true" />
              Plan adjustment suggested
            </div>
            <PlanAdjustmentSummary adjustments={message.planAdjustments} />
          </div>
        )}
      </div>
    </div>
  );
}

function PlanAdjustmentSummary({ adjustments }) {
  const { adjustment_reason, ...targets } = adjustments;
  const lines = Object.entries(targets).map(([key, value]) => {
    const labels = {
      calorie_target: "Calories",
      protein_target_g: "Protein (g)",
      carb_target_g: "Carbs (g)",
      fat_target_g: "Fat (g)",
      step_target: "Daily steps",
      lifting_days_target: "Lifting days/wk",
      cardio_days_target: "Cardio days/wk"
    };
    return `${labels[key] ?? key}: ${value}`;
  });
  return (
    <ul className="space-y-0.5 text-muted-foreground">
      {lines.map((line) => <li key={line}>{line}</li>)}
      {adjustment_reason && <li className="mt-1 italic">{adjustment_reason}</li>}
    </ul>
  );
}

function PlanAdjustmentDialog({ adjustments, open, onOpenChange, onApply, onNavigate }) {
  if (!adjustments) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suggested plan adjustment</DialogTitle>
          <DialogDescription>
            {adjustments.adjustment_reason ?? "Your coach recommends updating these targets based on your conversation."}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-line bg-panel2 p-4 text-sm">
          <PlanAdjustmentSummary adjustments={adjustments} />
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-teal/10 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
          <span>Nothing changes until you confirm. You can also adjust manually in Custom Targets.</span>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="min-h-11" onClick={onNavigate}>
            Edit manually
          </Button>
          <Button onClick={onApply} className="min-h-11 bg-teal text-buttonText hover:opacity-90">
            Apply adjustments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}