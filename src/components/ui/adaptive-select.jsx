import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

/**
 * Uses a non-draggable bottom dialog on narrow screens and the existing
 * Radix menu on larger viewports.
 *
 * @param {{
 *   value?: string,
 *   onValueChange: (value: string) => void,
 *   options: Array<{value: string, label: React.ReactNode, disabled?: boolean}>,
 *   id?: string,
 *   placeholder?: string,
 *   drawerTitle?: React.ReactNode,
 *   drawerDescription?: React.ReactNode,
 *   disabled?: boolean,
 *   triggerClassName?: string
 * }} props
 */
export function AdaptiveSelect({
  value,
  onValueChange,
  options,
  id,
  placeholder = "Choose an option",
  drawerTitle = "Choose an option",
  drawerDescription,
  disabled = false,
  triggerClassName
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const contentRef = useRef(null);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const selectOption = (nextValue) => {
    onValueChange(nextValue);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-label={typeof drawerTitle === "string" ? drawerTitle : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2.5 text-left text-sm shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className="line-clamp-1">{selected?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent
        ref={contentRef}
        className="inset-x-0 bottom-0 top-auto flex max-h-[80svh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-lg p-0 pb-[env(safe-area-inset-bottom)]"
        style={{ animation: "none" }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader className="shrink-0 p-4 pr-14 text-left">
          <DialogTitle>{drawerTitle}</DialogTitle>
          <DialogDescription className={drawerDescription ? undefined : "sr-only"}>
            {drawerDescription ?? "Select one of the available options."}
          </DialogDescription>
        </DialogHeader>
        {/* No draggable-sheet pointer capture or moving option hit targets. */}
        <div data-selector-options="" className="min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 pb-6">
          <div className="space-y-1">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={option.disabled}
                  onClick={() => selectOption(option.value)}
                  className={cn(
                    "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-50",
                    isSelected ? "bg-teal/10 text-teal" : "hover:bg-panel2"
                  )}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check className="h-5 w-5 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
