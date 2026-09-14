import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Plus, Bookmark, X, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DEBOUNCE_MS = 400;
const MIN_QUERY = 2;

export default function FoodSearchCard({ onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState({});
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      setResults([]);
      setSearching(false);
      setError("");
      return;
    }
    setSearching(true);
    setError("");
    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      try {
        const res = await base44.functions.invoke("searchFoods", { query: trimmed });
        if (reqId !== requestIdRef.current) return;
        if (res.data.error) {
          setError(res.data.error);
          setResults([]);
        } else {
          setResults(res.data.foods || []);
        }
      } catch (e) {
        if (reqId !== requestIdRef.current) return;
        setError(e.message || "Search failed");
        setResults([]);
      } finally {
        if (reqId === requestIdRef.current) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleAdd = async (food, addToToday) => {
    if (added[food.source_id]) return;
    setAdded((prev) => ({ ...prev, [food.source_id]: addToToday ? "today" : "library" }));
    try {
      await onAdd?.(food, addToToday);
    } catch {
      setAdded((prev) => ({ ...prev, [food.source_id]: undefined }));
    }
  };

  const trimmed = query.trim();

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-teal" aria-hidden="true" />
          <h2 className="font-medium">Search foods</h2>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any food — e.g. chicken breast"
            aria-label="Search foods online"
            className="h-11 pl-9 pr-9"
            inputMode="search"
            autoCapitalize="off"
            autoCorrect="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {searching && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching…
          </div>
        )}

        {error && !searching && (
          <p className="text-sm text-red">{error}</p>
        )}

        {!searching && results.length > 0 && (
          <div className="space-y-2 max-h-[420px] overflow-y-auto -mx-1 px-1">
            {results.map((food) => {
              const state = added[food.source_id];
              return (
                <div key={food.source_id} className="rounded-lg border border-line bg-panel2 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{food.name}</div>
                      {food.brand_name && (
                        <div className="text-xs text-muted-foreground truncate">{food.brand_name}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground text-right shrink-0 font-mono tabular-nums">
                      {food.calories} kcal
                      <div>{food.protein_g ?? "—"}p / {food.carbs_g ?? "—"}c / {food.fat_g ?? "—"}f</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 min-h-9 flex-1"
                      onClick={() => handleAdd(food, false)}
                      disabled={!!state}
                    >
                      {state === "library" ? <><Check className="w-3.5 h-3.5 mr-1" /> Saved</> : <><Bookmark className="w-3.5 h-3.5 mr-1" /> Library</>}
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 min-h-9 flex-1 bg-teal text-buttonText hover:opacity-90"
                      onClick={() => handleAdd(food, true)}
                      disabled={state === "today"}
                    >
                      {state === "today" ? <><Check className="w-3.5 h-3.5 mr-1" /> Added</> : <><Plus className="w-3.5 h-3.5 mr-1" /> Today</>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!searching && trimmed.length >= MIN_QUERY && results.length === 0 && !error && (
          <p className="text-sm text-muted-foreground text-center py-2">No foods found. Try a different search.</p>
        )}

        {!searching && trimmed.length < MIN_QUERY && (
          <p className="text-xs text-muted-foreground">
            Search thousands of branded foods by name to pull nutrition facts and build your library.
          </p>
        )}
      </CardContent>
    </Card>
  );
}