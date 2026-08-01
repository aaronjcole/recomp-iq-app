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

const QUICK_ACTIONS = [
  "I ate more than I planned today — how can I still hit my goal?",
  "I'm short on protein with calories left — what should I eat?",
  "Should I train today given my recent sessions?",
  "I had a rough day — help me reset for tomorrow."
];

function buildContext({ profile, strategy, trend, recompSignal, preferences, lastCheckIn, todayLog, recentSessions }) {
  const consumed = {
    calories: Math.round(todayLog?.calories ?? 0),
    protein: Math.round(todayLog?.protein_g ?? 0),
    carbs: Math.round(todayLog?.carbs_g ?? 0),
    fat: Math.round(todayLog?.fat_g ?? 0)
  };
  const remaining = {
    calories: Math.round((strategy.calorie_target ?? 0) - consumed.calories),
    protein: Math.round((strategy.protein_target_g ?? 0) - consumed.protein)
  };
  const sessions = (recentSessions || [])
    .slice(0, 5)
    .map((s) => `${s.date} ${s.type} "${s.title}"${s.duration_minutes ? ` ${s.duration_minutes}min` : ""}${s.perceived_exertion ? ` RPE${s.perceived_exertion}` : ""}`)
    .join("; ");

  return `You are RecompIQ, an adaptive body-recomposition coach.

TODAY'S STATUS:
- Consumed so far: ${consumed.calories} kcal, ${consumed.protein}g protein, ${consumed.carbs}g carbs, ${consumed.fat}g fat
- Targets: ${strategy.calorie_target} kcal, ${strategy.protein_target_g}g protein, ${strategy.carb_target_g}g carbs, ${strategy.fat_target_g}g fat
- Remaining today: ~${remaining.calories} kcal, ~${remaining.protein}g protein
- Steps today: ${todayLog?.steps ?? "n/a"} / target ${strategy.step_target}
- Workout done today: ${todayLog?.workout_completed ? "yes" : "no"}

RECENT TRAINING (most recent first):
${sessions || "none logged"}

USER CONTEXT:
- Goal: ${GOAL_LABELS[profile.goal]?.label ?? profile.goal}
- Current weight: ${profile.current_weight_lbs} lb; goal weight: ${profile.goal_weight_lbs ?? "n/a"} lb
- Experience: ${profile.experience_level}; training ${profile.training_days_per_week} lift days/wk, ${profile.cardio_days_per_week} cardio days/wk
- 7-day avg weight: ${trend?.avg_weight_current_7_day ?? "n/a"} lb
- Weekly weight change: ${trend?.weight_change_lbs ?? "n/a"} lb
- Adherence: calories ${pct(trend?.calorie_adherence)}, protein ${pct(trend?.protein_adherence)}, steps ${pct(trend?.step_adherence)}, workouts ${pct(trend?.workout_adherence)}
- Recomp signal: ${recompSignal?.label ?? "n/a"}
- Last check-in recommendation: ${lastCheckIn?.recommendation_decision?.replace(/_/g, " ") ?? "none"}
- Coaching tone: ${preferences?.tone ?? "direct"}

COACHING PHILOSOPHY (critical):
- Holistic: treat nutrition, training, sleep, stress, and mindset as connected. Weigh recovery and sleep before adding training load.
- Adherence-based, non-shaming psychology: one rough day doesn't undo progress. Never moralize food (no "good/bad", "cheat", "guilt"). Normalize off days; frame resets as a normal part of the process, not failure. Reinforce consistency over perfection.
- Flexible resets: when the user overeats or misses a target, offer a kind, practical reset — adjust the rest of the day, move a little more, or start fresh tomorrow. Never suggest extreme restriction or punishment to "make up" for it.
- NASM-aligned training: apply current NASM OPT principles — progressive overload, balanced movement (push/pull/quad-dominant/hinge-dominant), proper warm-up and cool-down, recovery between sessions, and volume scaled to their experience level and goal. Don't prescribe unsafe volumes.

RULES (critical):
- Only use numbers that appear in the context above. Never invent weights, calories, macros, or dates.
- When the user describes what they ate or asks how to still hit their goal, respond with concrete, ranked options drawn from: (a) redistribute remaining macros across the rest of the day, (b) move more (steps or an extra session) if recovery allows, or (c) accept the day and reset tomorrow. Choose and rank them based on the actual remaining numbers and recent training load.
- Keep replies short, specific, actionable, and in the user's selected tone.
- Never give medical or clinical advice; advise seeking a qualified professional when relevant.`;
}

export default function Coach() {
  const { profile, strategy, trend, recompSignal, preferences, checkIns, todayLog, sessions } = useRecomp();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedMessage, setFailedMessage] = useState("");
  const scrollRef = useRef(null);
  const lastCheckIn = checkIns[0];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text, appendUserMessage = true) => {
    if (!text.trim() || loading || !profile || !strategy) return;
    const userMsg = { role: "user", content: text };
    const history = appendUserMessage ? [...messages, userMsg] : messages;
    if (appendUserMessage) {
      setMessages(history);
      setInput("");
    }
    setLoading(true);
    setFailedMessage("");
    const transcript = history.map((m) => `${m.role === "user" ? "User" : "Coach"}: ${m.content}`).join("\n");
    const prompt = `${buildContext({ profile, strategy, trend, recompSignal, preferences, lastCheckIn, todayLog, recentSessions: sessions })}\n\nConversation so far:\n${transcript}\n\nCoach:`;
    try {
      const res = await base44.integrations.Core.InvokeLLM({ prompt });
      const reply = typeof res === "string"
        ? res
        : res && typeof res === "object" && "output" in res
          ? String(res.output)
          : JSON.stringify(res) ?? "";
      setMessages((m) => [...m, { role: "coach", content: reply }]);
    } catch (e) {
      setFailedMessage(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center gap-2 pb-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold leading-none">Coach</h1>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 && (
          <Card className="bg-panel border-line">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Tell me what you ate or how your day went — I’ll suggest how to still hit your goal: redistribute macros, move more, or reset and start fresh. Or tap a quick action below.
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
        {failedMessage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-line" onClick={() => send(failedMessage, false)}>
              <RotateCcw className="w-4 h-4 mr-1" /> Retry
            </Button>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-line">
        <div className="flex gap-2 overflow-x-auto pb-2 pt-3 -mx-1 px-1 no-scrollbar">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              disabled={loading}
              className="shrink-0 text-xs whitespace-nowrap rounded-full border border-line bg-panel px-3 py-1.5 min-h-[36px] text-muted-foreground hover:text-foreground hover:bg-panel2 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your coach…" className="flex-1" aria-label="Message your coach" />
          <Button type="submit" className="bg-teal text-buttonText hover:opacity-90" disabled={loading || !input.trim()} aria-label="Send message">
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-2">Educational guidance, not medical advice.</p>
      </div>
    </div>
  );
}
