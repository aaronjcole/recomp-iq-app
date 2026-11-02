import { useEffect, useRef, useState } from "react";
import { Search, LoaderCircle, Plus, Bookmark, X, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const DEBOUNCE_MS = 400;
const MIN_QUERY = 2;

export default function FoodSearchCard({ onAdd = undefined, onSelect = undefined, addLabel = "Add to today", initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState({});
  const [pending, setPending] = useState({});
  const [selecting, setSelecting] = useState(false);
  const [retry, setRetry] = useState(0);
  const inputRef = useRef(null);
  const selectionRef = useRef(false);
  const { toast } = useToast();
  // source_id -> FoodItem id already created, so retries reuse it.
  const savedIdsRef = useRef({});
  const inFlightRef = useRef(new Set());
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Invalidate an already-running request as soon as the query changes,
    // including when it becomes too short to start another request.
    requestIdRef.current += 1;
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
      requestIdRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, retry]);

  const handleSelect = async (food) => {
    if (selectionRef.current) return;
    selectionRef.current = true;
    setSelecting(true);
    try {
      await onSelect(food);
    } catch {
      toast({ title: "Couldn't open food review", variant: "destructive" });
    } finally {
      selectionRef.current = false;
      setSelecting(false);
    }
  };

  const handleAdd = async (food, addToToday) => {
    const key = food.source_id;
    const current = added[key];
    if (inFlightRef.current.has(key) || current === "today") return;
    if (!addToToday && current === "library") return;
    inFlightRef.current.add(key);
    setPending((prev) => ({ ...prev, [key]: addToToday ? "review" : "library" }));
    try {
      await onAdd?.(food, addToToday, {
        savedFoodId: savedIdsRef.current[key],
        onSaved: (id) => { savedIdsRef.current[key] = id; }
      });
      // Opening a review is not a committed log. Cancel must allow another try.
      setAdded((prev) => ({ ...prev, [key]: !addToToday || savedIdsRef.current[key] ? "library" : undefined }));
    } catch {
      // If the FoodItem was saved but the diary write failed, show it as saved.
      setAdded((prev) => ({ ...prev, [key]: savedIdsRef.current[key] ? "library" : undefined }));
      toast({
        title: addToToday ? "Couldn't open food review" : "Couldn't save food",
        variant: "destructive"
      });
    } finally {
      inFlightRef.current.delete(key);
      setPending((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const trimmed = query.trim();

  return (
    <Card className="min-w-0 max-w-full bg-panel border-line">
      <CardContent className="p-3 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-teal" aria-hidden="true" />
          <h2 className="font-medium">Search foods</h2>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any food — e.g. chicken breast"
            aria-label="Search foods online"
            className="h-11 pl-9 pr-14"
            inputMode="search"
            autoCapitalize="off"
            autoCorrect="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground min-h-11 min-w-11 flex items-center justify-center"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {searching && (
          <div role="status" className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <LoaderCircle className="w-4 h-4 mr-2 animate-spin" /> Searching…
          </div>
        )}

        {error && !searching && (
          <div className="space-y-2"><p role="alert" className="break-words text-sm text-red">{error}</p><Button variant="outline" className="min-h-11" onClick={() => setRetry((value) => value + 1)}>Search again</Button></div>
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
                  {onSelect ? <Button disabled={selecting} className="h-auto min-h-11 min-w-0 w-full whitespace-normal bg-teal text-buttonText" onClick={() => handleSelect(food)}><span className="min-w-0 [overflow-wrap:anywhere]">Review {food.name}</span></Button> : <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 flex-1"
                      onClick={() => handleAdd(food, false)}
                      disabled={!!state || !!pending[food.source_id]}
                    >
                      {pending[food.source_id] === "library" ? "Saving…" : state === "library" ? <><Check className="w-3.5 h-3.5 mr-1" /> Saved</> : <><Bookmark className="w-3.5 h-3.5 mr-1" /> Library</>}
                    </Button>
                    <Button
                      size="sm"
                      className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal bg-teal text-buttonText hover:opacity-90"
                      onClick={() => handleAdd(food, true)}
                      disabled={state === "today" || !!pending[food.source_id]}
                    >
                      {pending[food.source_id] === "review" ? "Opening…" : state === "today" ? <><Check className="w-3.5 h-3.5 mr-1" /> Reviewed</> : <><Plus className="w-3.5 h-3.5 mr-1" /> {addLabel}</>}
                    </Button>
                  </div>}
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
