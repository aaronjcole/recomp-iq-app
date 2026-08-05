import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  makeCoachRequest,
  makeReportRequest,
  normalizeCoachReply,
  REPORT_CATEGORIES
} from "@/lib/coachContract";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ChevronRight,
  Flag,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  User
} from "lucide-react";

const QUICK_ACTIONS = [
  {
    label: "Recover from an off-plan meal",
    prompt: "I ate more than I planned today — how can I still hit my goal?",
    preparedAction: {
      title: "Reset with your next meal",
      summary: "Return to your usual plan at the next meal without compensatory restriction.",
      steps: ["Choose a normal protein-forward meal.", "Resume your usual targets tomorrow.", "Skip punishment cardio or meal skipping."],
      destination: "/nutrition",
      destinationLabel: "Continue to Fuel"
    }
  },
  {
    label: "Hit my protein target",
    prompt: "I'm short on protein with calories left — what should I eat?",
    preparedAction: {
      title: "Plan a protein catch-up",
      summary: "Use the Coach guidance to choose a protein-forward option that fits your remaining calories.",
      steps: ["Review the suggested serving and calories.", "Choose an option you can actually repeat.", "Log only what you decide to eat."],
      destination: "/nutrition",
      destinationLabel: "Continue to Fuel"
    }
  },
  {
    label: "Choose today's training",
    prompt: "Should I train today given my recent sessions?",
    preparedAction: {
      title: "Review today’s training choice",
      summary: "Carry the Coach recommendation into Training, then choose the session yourself.",
      steps: ["Check the recommended intensity.", "Adjust the session to today’s recovery.", "Save it only after you train."],
      destination: "/training",
      destinationLabel: "Continue to Training"
    }
  },
  {
    label: "Reset for tomorrow",
    prompt: "I had a rough day — help me reset for tomorrow.",
    preparedAction: {
      title: "Set up tomorrow’s reset",
      summary: "Turn the Coach guidance into one simple action for tomorrow without rewriting your plan.",
      steps: ["Pick one action from the response.", "Keep your current targets unchanged.", "Start again with the next decision."],
      destination: "/today",
      destinationLabel: "Continue to Today"
    }
  }
];

export default function Coach() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedRequest, setFailedRequest] = useState(null);
  const [reportingMessage, setReportingMessage] = useState(null);
  const [reviewingAction, setReviewingAction] = useState(null);
  const [reportedIds, setReportedIds] = useState(() => new Set());
  const scrollRef = useRef(null);

  const goBack = () => {
    const historyIndex = window.history.state?.idx ?? 0;
    if (historyIndex > 0) navigate(-1);
    else navigate("/more", { replace: true });
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text, { appendUser = true, preparedAction = null, priorHistory = messages } = {}) => {
    if (loading) return;

    let request;
    try {
      request = makeCoachRequest(text, priorHistory);
    } catch (error) {
      toast({ title: "Message not sent", description: error.message, variant: "destructive" });
      return;
    }

    if (appendUser) {
      setMessages((current) => [
        ...current,
        { role: "user", content: request.message, clientId: crypto.randomUUID() }
      ]);
      setInput("");
    }
    setLoading(true);
    setFailedRequest(null);

    try {
      const response = await base44.functions.invoke("coachReply", request);
      const reply = normalizeCoachReply(response.data);
      setMessages((current) => [
        ...current,
        {
          role: "coach",
          content: reply.summary,
          actions: reply.actions,
          safetyNote: reply.safetyNote,
          messageId: reply.messageId,
          preparedAction: reply.actionable ? preparedAction : null,
          clientId: crypto.randomUUID()
        }
      ]);
    } catch (error) {
      setFailedRequest({ text: request.message, preparedAction, priorHistory });
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
    send(failedRequest.text, {
      appendUser: false,
      preparedAction: failedRequest.preparedAction,
      priorHistory: failedRequest.priorHistory
    });
  };

  const markReported = (messageId) => {
    setReportedIds((current) => new Set([...current, messageId]));
    setReportingMessage(null);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center gap-2 pb-3">
        <button onClick={goBack} className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold leading-none">Coach</h1>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <Card className="bg-panel border-line">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold">Start with what happened today</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Choose a starting point or ask your own question. Your recent plan and logs stay in context.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2" aria-label="Suggested coach questions">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => send(action.prompt, { preparedAction: action.preparedAction })}
                  disabled={loading}
                  aria-label={action.prompt}
                  className="group flex min-h-[76px] items-start justify-between gap-2 rounded-xl border border-line bg-panel p-3 text-left text-sm font-medium transition-colors hover:border-teal/60 hover:bg-panel2 disabled:opacity-50"
                >
                  <span>{action.label}</span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-teal" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <CoachMessage
            key={message.clientId}
            message={message}
            reported={message.messageId ? reportedIds.has(message.messageId) : false}
            onReport={() => setReportingMessage(message)}
            onReviewAction={() => setReviewingAction(message.preparedAction)}
          />
        ))}
        {loading && (
          <div className="flex gap-2" role="status">
            <div className="w-7 h-7 rounded-full bg-teal flex items-center justify-center">
              <Bot className="w-4 h-4 text-buttonText" aria-hidden="true" />
            </div>
            <div className="bg-panel border border-line rounded-2xl px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Thinking…
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

      <div className="pt-2 border-t border-line">
        {messages.length > 0 && (
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-2 pt-3 -mx-1 px-1 no-scrollbar">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => send(action.prompt, { preparedAction: action.preparedAction })}
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
        <form onSubmit={(event) => { event.preventDefault(); send(input); }} className="flex gap-2">
          <Input value={input} onChange={(event) => setInput(event.target.value)} maxLength={1000} placeholder="Ask your coach…" className="flex-1 min-h-11" aria-label="Message your coach" />
          <Button type="submit" className="min-h-11 min-w-11 bg-teal text-buttonText hover:opacity-90" disabled={loading || !input.trim()} aria-label="Send message">
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-2">Educational guidance, not medical advice.</p>
      </div>

      <ReportDialog
        message={reportingMessage}
        open={!!reportingMessage}
        onOpenChange={(open) => { if (!open) setReportingMessage(null); }}
        onReported={markReported}
      />
      <ActionReviewDialog
        action={reviewingAction}
        open={!!reviewingAction}
        onOpenChange={(open) => { if (!open) setReviewingAction(null); }}
        onContinue={() => {
          const destination = reviewingAction?.destination;
          setReviewingAction(null);
          if (destination) navigate(destination);
        }}
      />
    </div>
  );
}

function CoachMessage({ message, onReport, onReviewAction, reported }) {
  const coach = message.role === "coach";
  return (
    <div className={`flex gap-2 ${coach ? "" : "flex-row-reverse"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${coach ? "bg-teal" : "bg-panel2"}`}>
        {coach ? <Bot className="w-4 h-4 text-buttonText" aria-hidden="true" /> : <User className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
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
        {coach && message.preparedAction && (
          <button type="button" onClick={onReviewAction} className="min-h-11 w-full rounded-lg border border-teal/40 bg-teal/10 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-teal/15">
            <span className="flex items-center justify-between gap-3 font-medium">
              Review prepared action
              <ChevronRight className="h-4 w-4 text-teal" aria-hidden="true" />
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Nothing changes until you continue.</span>
          </button>
        )}
        {coach && message.messageId && (
          <button type="button" onClick={onReport} disabled={reported} className="min-h-10 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:no-underline disabled:opacity-70">
            <Flag className="w-3.5 h-3.5" aria-hidden="true" /> {reported ? "Reported" : "Report response"}
          </button>
        )}
      </div>
    </div>
  );
}

function ActionReviewDialog({ action, open, onOpenChange, onContinue }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{action?.title ?? "Review prepared action"}</DialogTitle>
          <DialogDescription>{action?.summary}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-panel2 p-4">
            <div className="mb-2 font-mono text-label uppercase tracking-wider text-muted-foreground">Prepared steps</div>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {(action?.steps ?? []).map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-teal/10 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
            <span>No target, meal, or workout has been changed. Continuing only opens the relevant tool.</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Keep chatting</Button>
          <Button onClick={onContinue} className="min-h-11 bg-teal text-buttonText hover:opacity-90">
            {action?.destinationLabel ?? "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ message, open, onOpenChange, onReported }) {
  const { toast } = useToast();
  const [category, setCategory] = useState("unsafe_health_advice");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    let request;
    try {
      request = makeReportRequest({
        messageId: message?.messageId,
        category,
        reason,
        reportedContent: [message?.content, ...(message?.actions ?? []), message?.safetyNote]
          .filter(Boolean)
          .join("\n")
      });
    } catch (error) {
      toast({ title: "Report not sent", description: error.message, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await base44.functions.invoke("reportAiContent", request);
      if (!response.data?.ok) throw new Error("The report was not confirmed");
      toast({ title: "Response reported", description: "Thank you. The report was recorded for review." });
      setReason("");
      setCategory("unsafe_health_advice");
      onReported(request.messageId);
    } catch (error) {
      toast({
        title: "Could not send report",
        description: error?.response?.data?.error || error.message || "Try again.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report coach response</DialogTitle>
          <DialogDescription>
            Reports help us review unsafe, harmful, or misleading guidance. Do not add private health details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-category">Reason</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="report-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_CATEGORIES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-details">Optional details</Label>
            <Textarea id="report-details" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={4} placeholder="Briefly explain the concern without adding sensitive information." />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-teal text-buttonText hover:opacity-90">
            {submitting ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
