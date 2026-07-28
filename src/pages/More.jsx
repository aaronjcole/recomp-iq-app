import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRecomp } from "@/lib/RecompContext";
import { useTheme } from "@/lib/useTheme";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Moon, Sun, LogOut, User, RefreshCw, ChevronRight, Shield, Database, Trash2, Loader2, Bot } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "@/components/ui/alert-dialog";
import { seedDemoData, clearDemoData } from "@/lib/demoData";

export default function More() {
  const { runCheckIn, checkIns, reload, logs, profile, strategy } = useRecomp();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const lastCheckIn = checkIns[0];

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDemoData({ profile, strategy });
      await reload();
    } finally {
      setSeeding(false);
      setConfirmOpen(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearDemoData();
      await reload();
    } finally {
      setClearing(false);
    }
  };

  const onLoadClick = () => {
    if (logs.length > 0) setConfirmOpen(true);
    else handleSeed();
  };

  const runCheck = async () => {
    setRunning(true);
    try {
      const r = await runCheckIn();
      setResult(r);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">More</h1>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-teal" />
            <div className="font-medium">Weekly check-in</div>
          </div>
          <p className="text-sm text-muted-foreground">
            Runs the adaptive engine over your last 7 days and updates your targets if the trend warrants it.
          </p>
          <Button className="w-full bg-teal text-buttonText hover:opacity-90" disabled={running} onClick={runCheck}>
            {running ? "Analyzing…" : "Run weekly check-in"}
          </Button>
          {result && (
            <div className="rounded-lg bg-panel2 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-teal" />
                <span className="font-medium text-sm capitalize">{result.adjustment.decision.replace(/_/g, " ")}</span>
              </div>
              <p className="text-xs text-muted-foreground">{result.adjustment.reason}</p>
              <p className="text-xs text-muted-foreground mt-1">{result.checkIn.ai_summary}</p>
            </div>
          )}
          {lastCheckIn && !result && (
            <div className="rounded-lg bg-panel2 p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Last check-in · {lastCheckIn.end_date}</div>
              <div className="text-sm font-medium capitalize">{lastCheckIn.recommendation_decision.replace(/_/g, " ")}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-2">
          <button onClick={() => navigate("/profile")} className="flex w-full items-center gap-3 p-3">
            <User className="w-4 h-4 text-teal" />
            <span className="flex-1 text-left text-sm font-medium">Profile & plan</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={() => navigate("/coach")} className="flex w-full items-center gap-3 p-3 border-t border-lineSoft">
            <Bot className="w-4 h-4 text-teal" />
            <span className="flex-1 text-left text-sm font-medium">AI coach</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3 p-3 border-t border-lineSoft">
            {theme === "dark" ? <Moon className="w-4 h-4 text-teal" /> : <Sun className="w-4 h-4 text-teal" />}
            <span className="flex-1 text-sm font-medium">Dark mode</span>
            <Switch checked={theme === "dark"} onCheckedChange={toggle} />
          </div>
          <button onClick={() => reload()} className="flex w-full items-center gap-3 p-3 border-t border-lineSoft">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 text-left text-sm font-medium">Refresh data</span>
          </button>
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-teal" />
            <div className="font-medium">Demo data</div>
          </div>
          <p className="text-sm text-muted-foreground">
            Preview populated charts with ~35 days of realistic logs, lifts, and sessions.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1 bg-teal text-buttonText hover:opacity-90" disabled={seeding} onClick={onLoadClick}>
              {seeding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Seeding…
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-1" /> Load demo data
                </>
              )}
            </Button>
            <Button variant="outline" className="flex-1 border-line" disabled={clearing} onClick={handleClear}>
              {clearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Clearing…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1" /> Clear
                </>
              )}
            </Button>
          </div>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Load demo data?</AlertDialogTitle>
                <AlertDialogDescription>
                  You already have logged data. Loading demo data will replace existing demo records and add ~35 days of demo history. Continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSeed}>Load demo data</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full border-line text-muted-foreground"
        onClick={() => base44.auth.logout(window.location.origin)}
      >
        <LogOut className="w-4 h-4 mr-2" /> Log out
      </Button>

      <p className="text-center text-xs text-muted-foreground pt-2">RecompIQ · adaptive recomposition</p>
    </div>
  );
}