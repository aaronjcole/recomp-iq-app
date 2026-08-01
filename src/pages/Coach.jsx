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
import { AlertTriangle, ArrowLeft, Bot, Flag, Loader2, RotateCcw, Send, User } from "lucide-react";

const QUICK_ACTIONS = [
  "I ate more than I planned today — how can I still hit my goal?",
  "I'm short on protein with calories left — what should I eat?",
  "Should I train today given my recent sessions?",
  "I had a rough day — help me reset for tomorrow."
];

export default function Coach() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedRequest, setFailedRequest] = useState(null);
  const [reportingMessage, setReportingMessage] = useState(null);
  const [reportedIds, setReportedIds] = useState(() => new Set());
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text, { appendUser = true, priorHistory = messages } = {}) => {
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
          clientId: crypto.randomUUID()
        }
      ]);
    } catch (error) {
      setFailedRequest({ text: request.message, priorHistory });
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
        <button onClick={() => navigate(-1)} className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold leading-none">Coach</h1>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <Card className="bg-panel border-line">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Tell me what you ate or how your day went. RecompIQ will use your saved plan and recent
              data to offer short educational guidance. It does not diagnose or treat medical conditions.
            </CardContent>
          </Card>
        )}
        {messages.map((message) => (
          <CoachMessage
            key={message.clientId}
            message={message}
            reported={message.messageId ? reportedIds.has(message.messageId) : false}
            onReport={() => setReportingMessage(message)}
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
        <div className="flex gap-2 overflow-x-auto pb-2 pt-3 -mx-1 px-1 no-scrollbar">
          {QUICK_ACTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => send(question)}
              disabled={loading}
              className="shrink-0 text-xs whitespace-nowrap rounded-full border border-line bg-panel px-3 py-2 min-h-11 text-muted-foreground hover:text-foreground hover:bg-panel2 disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>
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
    </div>
  );
}

function CoachMessage({ message, onReport, reported }) {
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
        {coach && message.messageId && (
          <button type="button" onClick={onReport} disabled={reported} className="min-h-10 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:no-underline disabled:opacity-70">
            <Flag className="w-3.5 h-3.5" aria-hidden="true" /> {reported ? "Reported" : "Report response"}
          </button>
        )}
      </div>
    </div>
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
