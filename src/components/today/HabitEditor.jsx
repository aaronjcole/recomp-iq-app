import { useState, useEffect } from "react";
import { useRecompHabits, useRecompActions } from "@/lib/RecompContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { ICON_KEYS, iconFor } from "@/lib/habitIcons";

const blank = { id: null, name: "", kind: "check", target_value: "", unit: "", icon: "" };

export default function HabitEditor({ open, onOpenChange }) {
  const { habits } = useRecompHabits();
  const { addHabit, updateHabit, archiveHabit } = useRecompActions();
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) setForm(blank);
  }, [open]);

  const save = async () => {
    const data = {
      name: form.name.trim(),
      kind: form.kind,
      target_value: form.kind === "count" ? Number(form.target_value) || 0 : undefined,
      unit: form.kind === "count" ? form.unit.trim() : undefined,
      icon: form.icon || undefined
    };
    if (form.id) {
      await updateHabit(form.id, data);
    } else {
      const sort_order = habits.length ? Math.max(...habits.map((h) => h.sort_order ?? 0)) + 1 : 0;
      await addHabit({ ...data, sort_order });
    }
    setForm(blank);
  };

  const load = (h) =>
    setForm({ id: h.id, name: h.name, kind: h.kind, target_value: h.target_value ?? "", unit: h.unit ?? "", icon: h.icon ?? "" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit habit" : "Add habit"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Reading, water…" />
          </div>

          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="count">Count</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.kind === "count" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target</Label>
                <Input type="number" inputMode="decimal" value={form.target_value} onChange={(e) => set("target_value", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="oz, cups" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_KEYS.map((k) => {
                const Ico = iconFor(k);
                const sel = form.icon === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("icon", sel ? "" : k)}
                    className={`h-8 w-8 rounded-full flex items-center justify-center border transition-colors relative after:absolute after:content-[''] after:-inset-2 ${
                      sel ? "bg-teal border-teal text-buttonText" : "border-line"
                    }`}
                    aria-label={k}
                  >
                    <Ico className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={!form.name.trim()} className="bg-teal text-buttonText hover:opacity-90">
            <Plus className="w-4 h-4 mr-1" /> {form.id ? "Save" : "Add"}
          </Button>
        </DialogFooter>

        {habits.length > 0 && (
          <div className="pt-3 border-t border-lineSoft space-y-1">
            <div className="font-mono text-label uppercase tracking-wider text-muted-foreground pt-2">Your habits</div>
            {habits.map((h) => (
              <div key={h.id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-sm truncate">{h.name}{h.archived ? " (archived)" : ""}</span>
                <Button variant="ghost" size="sm" onClick={() => load(h)}>Edit</Button>
                {!h.archived && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 relative after:absolute after:content-[''] after:-inset-2" onClick={() => archiveHabit(h.id)} aria-label="Archive habit">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}