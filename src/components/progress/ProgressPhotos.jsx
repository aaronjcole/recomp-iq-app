import { useEffect, useState, useRef, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { addPhoto, listPhotos, getPhotoBlob, deletePhoto, estimateUsage } from "@/lib/progressPhotos";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Trash2, Download } from "lucide-react";

const POSES = ["Front", "Side", "Back"];

function fmtDate(d) {
  try {
    return format(parseISO(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

function formatBytes(b) {
  if (!b) return "0 MB";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(0)} MB`;
}

export default function ProgressPhotos() {
  const { user } = useAuth();
  const { todayLog } = useRecomp();
  const { toast } = useToast();
  const userId = user?.id;

  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [pose, setPose] = useState("Front");
  const [note, setNote] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [usageBytes, setUsageBytes] = useState(0);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [list, bytes] = await Promise.all([listPhotos(userId), estimateUsage()]);
      setPhotos(list);
      setUsageBytes(bytes);
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !userId) return;
    setSaving(true);
    try {
      for (const file of files) {
        await addPhoto(userId, file, {
          weight_lbs: todayLog?.weight_lbs ?? null,
          pose,
          note,
          date: todayStr()
        });
      }
      await refresh();
      setNote("");
    } catch (err) {
      toast({ title: "Couldn't save photo", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await deletePhoto(selectedId);
    } catch {
      /* ignore */
    }
    setConfirmDelete(false);
    setSelectedId(null);
    await refresh();
  };

  const downloadSelected = async () => {
    if (!selected) return;
    const blob = await getPhotoBlob(selected.id, "full");
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `progress-${selected.date}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const selected = photos.find((p) => p.id === selectedId) || null;
  const photoA = photos.find((p) => p.id === compareA);
  const photoB = photos.find((p) => p.id === compareB);

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">Progress photos</div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">On-device</span>
        </div>
        <p className="text-xs text-muted-foreground">Stored only on this device — never uploaded.</p>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Select value={pose} onValueChange={setPose}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="flex-1 h-9" />
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPick} />
          <Button onClick={() => fileRef.current?.click()} disabled={saving} className="w-full bg-teal text-buttonText hover:opacity-90">
            <Camera /> {saving ? "Saving…" : "Add photos"}
          </Button>
        </div>

        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Add your first photo to start a private, on-device timeline.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <PhotoThumb
                key={p.id}
                id={p.id}
                date={p.date}
                weight_lbs={p.weight_lbs}
                onClick={() => {
                  setConfirmDelete(false);
                  setSelectedId(p.id);
                }}
              />
            ))}
          </div>
        )}

        {photos.length >= 2 && (
          <div className="space-y-2 pt-1">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Compare</div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={compareA} onValueChange={setCompareA}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="First" />
                </SelectTrigger>
                <SelectContent>
                  {photos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {fmtDate(p.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={compareB} onValueChange={setCompareB}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Second" />
                </SelectTrigger>
                <SelectContent>
                  {photos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {fmtDate(p.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {compareA && compareB && compareA !== compareB && (
              <div className="grid grid-cols-2 gap-2">
                <CompareImage photo={photoA} />
                <CompareImage photo={photoB} />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-lineSoft">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Device storage</span>
          <span className="font-mono text-[10px] uppercase tracking-wider tabular-nums">Using {formatBytes(usageBytes)}</span>
        </div>
      </CardContent>

      <Dialog
        open={!!selectedId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null);
            setConfirmDelete(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{fmtDate(selected.date)}</DialogTitle>
              </DialogHeader>
              <DetailImage id={selected.id} />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Weight</span>
                <span className="tabular-nums">{selected.weight_lbs != null ? `${selected.weight_lbs} lb` : "—"}</span>
                {selected.pose && (
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{selected.pose}</span>
                )}
              </div>
              {selected.note && <p className="text-sm text-muted-foreground">{selected.note}</p>}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="border-line" onClick={downloadSelected}>
                  <Download /> Download
                </Button>
                {!confirmDelete ? (
                  <Button variant="outline" className="border-destructive text-destructive ml-auto" onClick={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="border-line ml-auto" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleDelete}>
                      <Trash2 /> Confirm
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function useBlobUrl(id, kind) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let created = null;
    let active = true;
    if (id) {
      getPhotoBlob(id, kind)
        .then((blob) => {
          if (!active || !blob) return;
          created = URL.createObjectURL(blob);
          setUrl(created);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, kind]);
  return url;
}

function PhotoThumb({ id, date, weight_lbs, onClick }) {
  const url = useBlobUrl(id, "thumb");
  return (
    <button type="button" onClick={onClick} className="relative aspect-square rounded-lg overflow-hidden bg-panel2 border border-line">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
        <div className="font-mono text-[9px] uppercase tracking-wider text-white leading-none">{fmtDate(date)}</div>
        {weight_lbs != null && (
          <div className="font-mono text-[9px] tabular-nums text-white/80 leading-none mt-0.5">{weight_lbs} lb</div>
        )}
      </div>
    </button>
  );
}

function DetailImage({ id }) {
  const url = useBlobUrl(id, "full");
  return (
    <div className="rounded-lg overflow-hidden bg-panel2 border border-line flex items-center justify-center min-h-[200px]">
      {url ? (
        <img src={url} alt="" className="max-h-[60vh] w-auto object-contain" />
      ) : (
        <div className="text-xs text-muted-foreground py-16">Loading…</div>
      )}
    </div>
  );
}

function CompareImage({ photo }) {
  const url = useBlobUrl(photo?.id, "full");
  if (!photo) return null;
  return (
    <div className="space-y-1">
      <div className="rounded-lg overflow-hidden bg-panel2 border border-line aspect-[3/4]">
        {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider">{fmtDate(photo.date)}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {photo.weight_lbs != null ? `${photo.weight_lbs} lb` : "—"}
        </span>
      </div>
    </div>
  );
}