import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, CheckCircle2, Images, ScanLine, ShieldCheck } from "lucide-react";
import ChildTopBar from "@/components/ChildTopBar";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { useAuth } from "@/lib/AuthContext";
import { usePremiumAccess } from "@/lib/PremiumAccessContext";
import { buildVisualComparison, VisualComparisonError } from "@/lib/fitness/visualProgress";
import { getPhotoBlob, listPhotos } from "@/lib/progressPhotos";
import { PREMIUM_FEATURES } from "../../base44/shared/premiumDomain";

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function photoLabel(photo) {
  const pose = photo.pose ? ` · ${photo.pose}` : "";
  return `${formatDate(photo.date)}${pose}`;
}

function useBlobUrl(id) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    let createdUrl = null;
    setUrl(null);

    if (id) {
      getPhotoBlob(id, "full")
        .then((blob) => {
          if (!active || !blob) return;
          createdUrl = URL.createObjectURL(blob);
          setUrl(createdUrl);
        })
        .catch(() => {});
    }

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [id]);

  return url;
}

function ComparisonCanvas({ earlierId, laterId, reveal }) {
  const earlierUrl = useBlobUrl(earlierId);
  const laterUrl = useBlobUrl(laterId);

  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-panel2">
      {earlierUrl && (
        <img
          src={earlierUrl}
          alt="Earlier progress photo"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {laterUrl && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
        >
          <img
            src={laterUrl}
            alt="Later progress photo"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
      {(!earlierUrl || !laterUrl) && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading photos…
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow"
        style={{ left: `calc(${reveal}% - 1px)` }}
        aria-hidden="true"
      />
      <span className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-xs text-white">Earlier</span>
      <span className="absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-xs text-white">Later</span>
    </div>
  );
}

export default function VisualProgressCheck() {
  const { user } = useAuth();
  const { canAccess, isLoading: accessLoading } = usePremiumAccess();
  const allowed = canAccess(PREMIUM_FEATURES.VISUAL_PROGRESS);
  const [photos, setPhotos] = useState([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true);
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [reveal, setReveal] = useState(50);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    if (!user?.id || !allowed) {
      setPhotos([]);
      setIsLoadingPhotos(false);
      return () => { active = false; };
    }

    setIsLoadingPhotos(true);
    listPhotos(user.id)
      .then((items) => {
        if (!active) return;
        setPhotos(items);
        setLoadError("");
        if (items.length >= 2) {
          setFirstId((current) => current || items[1].id);
          setSecondId((current) => current || items[0].id);
        }
      })
      .catch(() => {
        if (active) setLoadError("Your on-device photo library could not be opened.");
      })
      .finally(() => {
        if (active) setIsLoadingPhotos(false);
      });

    return () => { active = false; };
  }, [allowed, user?.id]);

  const options = useMemo(
    () => photos.map((photo) => ({ value: photo.id, label: photoLabel(photo) })),
    [photos]
  );
  const comparison = useMemo(() => {
    const first = photos.find((photo) => photo.id === firstId);
    const second = photos.find((photo) => photo.id === secondId);
    if (!first || !second || first.id === second.id) return null;
    try {
      return buildVisualComparison(first, second);
    } catch (error) {
      if (error instanceof VisualComparisonError) return null;
      throw error;
    }
  }, [firstId, photos, secondId]);

  return (
    <div className="space-y-5">
      <ChildTopBar title="Visual Progress Check" fallbackTo="/progress" />

      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/15 text-teal">
              <ScanLine className="h-5 w-5" aria-hidden="true" />
            </div>
            <PremiumBadge />
            <Badge variant="outline" className="border-teal/30 text-teal">On-device only</Badge>
          </div>
          <div>
            <h2 className="font-semibold">See change without a risky body-fat claim</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Align two private progress photos, reveal the change, and keep every image on this device.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-lineSoft bg-panel2 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
            <p>No uploads, no AI analysis, and no body-fat or medical estimate.</p>
          </div>

          {!accessLoading && !allowed && (
            <div className="space-y-3 rounded-lg border border-lineSoft bg-panel2 p-4">
              <p className="text-sm text-muted-foreground">
                This feature is visible during testing and requires verified Premium access.
              </p>
              <Button asChild variant="outline" className="w-full border-line">
                <Link to="/more/premium">Review Premium access</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {allowed && !isLoadingPhotos && photos.length < 2 && (
        <Card className="border-line bg-panel">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-teal/15 text-teal">
              <Camera className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="font-semibold">Add two progress photos</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Save at least two photos in Progress to unlock an on-device comparison.
            </p>
            <Button asChild className="mt-4 bg-teal text-buttonText hover:opacity-90">
              <Link to="/progress">Open progress photos</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {allowed && loadError && <p className="text-sm text-destructive" role="alert">{loadError}</p>}

      {allowed && comparison && (
        <>
          <Card className="border-line bg-panel">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Images className="h-4 w-4 text-teal" aria-hidden="true" />
                <h2 className="font-semibold">Choose your comparison</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <AdaptiveSelect
                  value={firstId}
                  onValueChange={setFirstId}
                  options={options.map((option) => ({ ...option, disabled: option.value === secondId }))}
                  drawerTitle="Earlier progress photo"
                />
                <AdaptiveSelect
                  value={secondId}
                  onValueChange={setSecondId}
                  options={options.map((option) => ({ ...option, disabled: option.value === firstId }))}
                  drawerTitle="Later progress photo"
                />
              </div>

              <ComparisonCanvas
                earlierId={comparison.earlierId}
                laterId={comparison.laterId}
                reveal={reveal}
              />
              <div>
                <label htmlFor="visual-reveal" className="mb-2 flex justify-between text-sm">
                  <span>Reveal later photo</span>
                  <span className="tabular-nums text-muted-foreground">{reveal}%</span>
                </label>
                <input
                  id="visual-reveal"
                  type="range"
                  min="0"
                  max="100"
                  value={reveal}
                  onChange={(event) => setReveal(Number(event.target.value))}
                  className="h-11 w-full accent-teal"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-line bg-panel">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{comparison.daysApart} days apart</Badge>
                <Badge variant="outline" className={comparison.poseMatch ? "border-teal/30 text-teal" : "border-gold/30 text-gold"}>
                  {comparison.poseMatch ? "Pose aligned" : "Pose differs"}
                </Badge>
                {comparison.weightDeltaLbs !== null && (
                  <Badge variant="outline">
                    {comparison.weightDeltaLbs > 0 ? "+" : ""}{comparison.weightDeltaLbs} lb
                  </Badge>
                )}
              </div>
              <h2 className="font-semibold">Read the comparison consistently</h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {comparison.guidance.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
