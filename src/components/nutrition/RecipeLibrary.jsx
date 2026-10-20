import { useId, useState } from "react";
import { ChefHat, Star } from "lucide-react";
import { useRecompActions, useRecompRef } from "@/lib/RecompContext";
import { useAuth } from "@/lib/AuthContext";
import { todayStr, isValidLocalDate } from "@/lib/loggingDateUtils";
import { createFoodDraft } from "@/lib/foodEntryDraft";
import { defaultMealForTime } from "@/lib/foodLogging";
import { RECIPE_NUTRIENTS, recipeFood, recipePerServing } from "@/lib/recipeNutrition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddRecipeCard from "./AddRecipeCard";
import FoodEntryComposer from "./FoodEntryComposer";

// Parent mounts this in Fuel's Library tab. Date/meal are snapshotted on Log.
export default function RecipeLibrary({ date = todayStr(), meal = defaultMealForTime() }) {
  const { user } = useAuth();
  return <AccountRecipeLibrary key={user?.id ?? "signed-out"} date={date} meal={meal} />;
}

function AccountRecipeLibrary({ date, meal }) {
  const { recipes } = useRecompRef();
  const { deleteRecipe, setRecipeFavorite } = useRecompActions();
  const id = useId();
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [review, setReview] = useState(null);
  const query = search.trim().toLowerCase();
  const matching = recipes.filter((recipe) => (!favoritesOnly || recipe.is_favorite) &&
    [recipe.title, recipe.description, ...(recipe.tags ?? []), ...(recipe.ingredients ?? []).map((item) => item.name)].join(" ").toLowerCase().includes(query));
  const mutate = async (recipeId, action) => {
    if (busy) return;
    setBusy(recipeId); setError("");
    try { await action(); setConfirmDelete(null); }
    catch (actionError) { setError(actionError?.message ?? "Recipe could not be updated. Try again."); }
    finally { setBusy(null); }
  };

  return (
    <section className="space-y-3" aria-labelledby={`${id}-heading`}>
      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5">
          <h2 id={`${id}-heading`} className="flex items-center gap-2 font-medium"><ChefHat className="h-4 w-4 text-teal" aria-hidden="true" /> Recipes</h2>
          <Label htmlFor={`${id}-search`}>Search recipes</Label>
          <Input id={`${id}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, ingredient, or tag" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}>Favorites only</Button>
            <Button variant="outline" className="min-h-11" onClick={() => setEditing("new")}>Create recipe</Button>
          </div>
          {matching.length === 0 && <p className="text-sm text-muted-foreground">{recipes.length ? "No recipes match your search." : "No saved recipes yet. Create your first recipe."}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!isValidLocalDate(date) && <p className="text-xs text-muted-foreground">Future dates are for planning only. Diary logging is available today or earlier.</p>}
        </CardContent>
      </Card>
      {matching.map((recipe) => {
        const nutrition = recipePerServing(recipe);
        const incomplete = RECIPE_NUTRIENTS.some(({ key }) => nutrition[key] == null);
        const open = expanded === recipe.id;
        return (
          <Card key={recipe.id} className="border-line bg-panel">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="min-w-0 break-words font-medium">{recipe.title}</h3>
                <Button variant="ghost" className="min-h-11 min-w-11 shrink-0" aria-label={`${recipe.is_favorite ? "Unfavorite" : "Favorite"} ${recipe.title}`} aria-pressed={recipe.is_favorite === true} disabled={busy !== null} onClick={() => mutate(recipe.id, () => setRecipeFavorite(recipe.id, !recipe.is_favorite))}>
                  <Star className={`h-4 w-4 ${recipe.is_favorite ? "fill-teal text-teal" : ""}`} aria-hidden="true" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Makes {recipe.servings} servings · Nutrition per serving</p>
              <p className="text-xs text-muted-foreground">{RECIPE_NUTRIENTS.map(({ key, label }) => `${label}: ${nutrition[key] == null ? "Unknown" : Number(nutrition[key].toFixed(2))}`).join(" · ")}</p>
              {incomplete && <p className="text-xs text-muted-foreground">Nutrition incomplete — review unknown values before logging.</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11" aria-expanded={open} aria-controls={`${id}-${recipe.id}-detail`} onClick={() => setExpanded(open ? null : recipe.id)}>View {recipe.title}</Button>
                <Button className="min-h-11 bg-teal text-buttonText" disabled={!isValidLocalDate(date)} onClick={() => {
                  if (!isValidLocalDate(date)) return;
                  setReview({ date, initialMeal: meal, initialFoods: [createFoodDraft(recipeFood(recipe), "recipe", recipe.id)] });
                }}>Log {recipe.title}</Button>
              </div>
              {open && <div id={`${id}-${recipe.id}-detail`} className="space-y-3 border-t border-line pt-3">
                {recipe.description && <p className="text-sm text-muted-foreground">{recipe.description}</p>}
                <h4 className="text-sm font-medium">Ingredients for the whole batch</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{(recipe.ingredients ?? []).map((item, index) => <li key={index}>{item.quantity ?? "Quantity unknown"} {item.unit} {item.name}</li>)}</ul>
                <h4 className="text-sm font-medium">Instructions</h4>
                {recipe.instructions?.length ? <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{recipe.instructions.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p className="text-sm text-muted-foreground">No instructions saved.</p>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={() => setEditing(recipe.id)}>Edit {recipe.title}</Button>
                  <Button variant="outline" className="min-h-11 text-destructive" disabled={busy !== null} onClick={() => setConfirmDelete(recipe.id)}>Delete {recipe.title}</Button>
                </div>
                {confirmDelete === recipe.id && <div className="space-y-2">
                  <p className="text-sm">Delete this saved recipe? Existing diary entries will stay.</p>
                  <div className="flex gap-2">
                    <Button variant="destructive" className="min-h-11" disabled={busy !== null} onClick={() => mutate(recipe.id, () => deleteRecipe(recipe.id))}>Confirm delete recipe</Button>
                    <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={() => setConfirmDelete(null)}>Keep recipe</Button>
                  </div>
                </div>}
              </div>}
            </CardContent>
          </Card>
        );
      })}
      {editing && (editing === "new" || recipes.some((recipe) => recipe.id === editing)) && <AddRecipeCard key={editing} recipe={recipes.find((recipe) => recipe.id === editing) ?? null} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
      {review && <FoodEntryComposer {...review} onClose={() => setReview(null)} />}
    </section>
  );
}
