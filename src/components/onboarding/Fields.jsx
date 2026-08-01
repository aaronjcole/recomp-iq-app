import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";

/**
 * @param {{
 *   label: React.ReactNode,
 *   value?: string | number | readonly string[],
 *   onChange: (value: string) => void,
 *   hint?: React.ReactNode,
 *   unit?: React.ReactNode,
 *   id?: string,
 *   min?: string | number,
 *   max?: string | number,
 *   step?: string | number,
 * }} props
 */
export function NumField({ label, value, onChange, hint, unit, id, min, max, step = "any" }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
            {unit}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * @param {{label: React.ReactNode, value?: string | number | readonly string[], onChange: (value: string) => void, hint?: React.ReactNode, id?: string}} props
 */
export function TextField({ label, value, onChange, hint, id }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * @param {{label: React.ReactNode, value?: string, onChange: (value: string) => void, options: Array<{value: string, label: React.ReactNode}>, id?: string}} props
 */
export function SelectField({ label, value, onChange, options, id }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** @param {{children: React.ReactNode}} props */
export function Why({ children }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/** @param {{title: React.ReactNode, why?: React.ReactNode}} props */
export function StepHeader({ title, why }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold">{title}</h1>
      {why && <p className="text-sm text-muted-foreground">{why}</p>}
    </div>
  );
}

/** @param {{options: string[], selected: string[], onToggle: (option: string) => void, name: string}} props */
export function ChipGroup({ options, selected, onToggle, name }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{name}</legend>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <label
            key={o}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm cursor-pointer transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-teal ${
              on ? "border-teal bg-teal/10 text-foreground" : "border-line bg-panel text-muted-foreground"
            }`}
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={on}
              onChange={() => onToggle(o)}
            />
            {o}
          </label>
        );
      })}
    </fieldset>
  );
}
