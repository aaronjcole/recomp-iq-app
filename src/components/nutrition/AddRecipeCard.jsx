import { useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, ChefHat } from "lucide-react";

const emptyRow = { name: "", quantity: "", unit: "" };

export default function AddRecipeCard() {
  const { addRecipe } = useRecomp();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState(1);
  const [rows, setRows] = useState([{ ...emptyRow }]);

  const setRow = (i, k, v) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((p) => [...p, { ...emptyRow }]);
  const removeRow = (i) => setRows((p) => p.filter((_, idx) => idx !== i));

  const canSave = title && rows.some((r) => r.name);

  const save = async () => {
    const ingredients = rows
      .filter((r) => r.name)
      .map((r) => ({ name: r.name, quantity: Number(r.quantity) || 0, unit: r.unit || "each" }));
    await addRecipe({
      title,
      servings: Number(servings) || 1,
      ingredients,
      instructions: [],
      tags: []
    });
    toast({ title: "Saved", description: "Recipe added." });
    setTitle("");
    setServings(1);
    setRows([{ ...emptyRow }]);
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <ChefHat className="w-4 h-4 text-teal" /> Add recipe
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chicken rice bowl" />
          </div>
          <div className="space-y-1.5">
            <Label>Servings</Label>
            <Input type="number" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Ingredients</Label>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r.name} onChange={(e) => setRow(i, "name", e.target.value)} placeholder="Ingredient" className="flex-1" />
              <Input type="number" inputMode="decimal" value={r.quantity} onChange={(e) => setRow(i, "quantity", e.target.value)} placeholder="Qty" className="w-20" />
              <Input value={r.unit} onChange={(e) => setRow(i, "unit", e.target.value)} placeholder="unit" className="w-20" />
              <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full border-line" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Add ingredient
          </Button>
        </div>
        <Button className="w-full bg-teal text-buttonText hover:opacity-90" onClick={save} disabled={!canSave}>
          Save recipe
        </Button>
      </CardContent>
    </Card>
  );
}