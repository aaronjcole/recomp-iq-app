import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useRecomp } from "@/lib/RecompContext";
import { GOAL_LABELS } from "@/lib/fitness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Loader2, Bot, User, RotateCcw, ArrowLeft } from "lucide-react";

const pct = (v) => (v === null || v === undefined ? "n/a" : Math.round(v * 100) + "%");

function buildContext({ profile, strategy, trend, recompSignal, preferences, lastCheckIn }) {
  return `You are RecompIQ, an adaptive body-recomposition coach.

USER CONTEXT:
- Goal: ${GOAL_LABELS[profile.goal]?.label ?? profile.goal}
- Current weight: ${profile.current_weight_lbs} lb; goal weight: ${profile.goal_weight_lbs ?? "n/a"} lb
- Experience: ${profile.experience_level}; training ${profile.training_days_per_week} lift days/wk
- Targets: ${strategy.calorie_target} kcal, ${strategy.protein_target_g}g protein, ${strategy.step_target} steps
- 7-day avg weight: ${trend?.avg_weight_current_7_day ?? "n/a"} lb
- Weekly weight change: ${trend?.weight_change_lbs ?? "n/a"} lb
- Adherence: calories ${pct(trend?.calorie_adherence)}, protein ${pct(trend?.protein_adherence)}, steps ${pct(trend?.step_adherence)}, workouts ${pct(trend?.workout_adherence)}
- Recomp signal: ${recompSignal?.label ?? "n/a"}
- Last check-in recommendation: ${lastCheckIn?.recommendation_decision?.replace(/_/g, " ") ?? "none"}
- Coaching tone: ${preferences?.tone ?? "direct"}

RULES (critical):
- Only use numbers that appear in the USER CONTEXT above. Never invent weights, calories, macros, or dates.
- Never give medical or clinical advice; if asked, advise seeking a qualified professional.
- Keep replies short, specific, and actionable, in the user's selected tone.`;
}

export default function Coach() {
  const { profile, strategy, trend, recompSignal, preferences, checkIns } = useRecomp();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const scrollRef = useRef(null);
  const lastCheckIn = checkIns[0];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    if (!text.trim() || loading || !profile || !strategy) return;
    const userMsg = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);
    setError(false);
    const transcript = history.map((m) => `${m.role === "user" ? "User" : "Coach"}: ${m.content}`).join("\n");
    const prompt = `${buildContext({ profile, strategy, trend, recompSignal, preferences, lastCheckIn })}\n\nConversation so far:\n${transcript}\n\nCoach:`;
    try {
      const res = await base44.integrations.Core.InvokeLLM({ prompt });
      const reply = typeof res === "string" ? res : res?.output ?? JSON.stringify(res);
      setMessages((m) => [...m, { role: "coach", content: reply }]);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center gap-2 pb-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold leading-none">Coach</h1>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 && (
          <Card className="bg-panel border-line">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Ask about your plan, progress, or next steps — e.g. “Should I drop calories?” or “Why isn’t the scale moving?”
            </CardContent>
          </Card>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-panel2" : "bg-teal"}`}>
              {m.role === "user" ? <User className="w-4 h-4 text-muted-foreground" /> : <Bot className="w-4 h-4 text-buttonText" />}
            </div>
            <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-teal text-buttonText" : "bg-panel border border-line"}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-teal flex items-center justify-center">
              <Bot className="w-4 h-4 text-buttonText" />
            </div>
            <div className="bg-panel border border-line rounded-2xl px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-line" onClick={() => send(messages[messages.length - 1]?.content || "")}>
              <RotateCcw className="w-4 h-4 mr-1" /> Retry
            </Button>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-line">
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 pt-3">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your coach…" className="flex-1" />
          <Button type="submit" className="bg-teal text-buttonText hover:opacity-90" disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-2">Educational guidance, not medical advice.</p>
      </div>
    </div>
  );
}