import { useId, useRef, useState } from "react";
import { useRecompRef } from "@/lib/RecompContext";
import { appendMealTranscript, MEAL_DESCRIPTION_LIMITS, parseMealDescription } from "@/lib/mealDescription";
import MealSpeechInput from "@/components/nutrition/MealSpeechInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Parent owns mounting and review. This component emits only unsaved drafts.
export default function DescribeMealCard({ onDrafts, active = true }) {
  const { foods } = useRecompRef();
  const id = useId();
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const reviewingRef = useRef(false);
  const descriptionRef = useRef("");

  const onTranscript = (transcript) => {
    const result = appendMealTranscript(descriptionRef.current, transcript);
    descriptionRef.current = result.text;
    setDescription(result.text);
    setError(result.error);
    setStatus(result.error ? "" : "Dictation added to the description. Edit it, then choose Review described foods.");
  };
  const review = () => {
    if (!active || voiceActive || reviewingRef.current) return;
    const result = parseMealDescription(descriptionRef.current, foods);
    setError(result.errors.join(" "));
    setStatus("");
    if (result.drafts.length && !result.errors.length) {
      reviewingRef.current = true;
      setReviewing(true);
      try { onDrafts(result.drafts); }
      catch {
        reviewingRef.current = false;
        setReviewing(false);
        setError("Could not open food review. Your description is still here; try again.");
      }
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-3 rounded-xl border border-line bg-panel2 p-3">
      <h3 id={`${id}-title`} className="text-sm font-semibold">Describe a meal</h3>
      <p id={`${id}-privacy`} className="text-xs text-muted-foreground">
        Local parsing, no paid AI call. Typed descriptions are not uploaded by this tool.
        Optional dictation uses your device or browser speech service. Nothing is logged until you confirm in review.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-description`}>Meal description</Label>
        <Textarea
          id={`${id}-description`}
          className="min-h-28 text-base"
          rows={4}
          maxLength={MEAL_DESCRIPTION_LIMITS.characters}
          value={description}
          disabled={reviewing}
          aria-describedby={`${id}-help ${id}-privacy${error ? ` ${id}-error` : ""}`}
          aria-invalid={Boolean(error)}
          placeholder="1 medium banana; 100 g roasted chicken breast; 1/2 cup cooked white rice"
          onChange={(event) => { descriptionRef.current = event.target.value; setDescription(event.target.value); setError(""); setStatus(""); }}
        />
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          Separate foods with semicolons, new lines, commas, or “and”. Up to 12 foods and 2,000 characters.
          Use exact saved-food names with portions (for example, “2 servings My shake”).
          A small USDA starter catalog supplies generic estimates only for known portions.
          Unknown foods, missing amounts, and unclear portions stay blank for manual or search review.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MealSpeechInput onTranscript={onTranscript} onActiveChange={setVoiceActive} disabled={!active || reviewing || description.length >= MEAL_DESCRIPTION_LIMITS.characters} />
        <Button type="button" variant="outline" className="h-auto min-h-11 min-w-0 whitespace-normal" disabled={!active || voiceActive || reviewing || !description.trim()} onClick={review}>
          Review described foods
        </Button>
      </div>
      {voiceActive && <p className="text-xs text-muted-foreground">Stop or cancel voice input before reviewing your description.</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
      <p role="status" className="text-xs text-muted-foreground">{status}</p>
    </section>
  );
}
