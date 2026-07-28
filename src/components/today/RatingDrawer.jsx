import { useState } from "react";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

const OPTIONS = [1, 2, 3, 4, 5];

export default function RatingDrawer({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            {value ? String(value) : "—"}
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[60vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{label}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-1">
            {OPTIONS.map((n) => {
              const selected = value === n;
              return (
                <DrawerClose asChild key={n}>
                  <button
                    type="button"
                    onClick={() => onChange(n)}
                    className={`w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors ${
                      selected ? "bg-teal/10 text-teal" : "hover:bg-panel2"
                    }`}
                  >
                    <span className="text-base font-medium">{n}</span>
                    {selected && <Check className="w-4 h-4" />}
                  </button>
                </DrawerClose>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}