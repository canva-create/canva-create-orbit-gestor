import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Check, Rows3, StretchHorizontal, AlignJustify } from "lucide-react";

export type Density = "compact" | "medium" | "expanded";

const OPTIONS: { value: Density; label: string; icon: typeof Rows3 }[] = [
  { value: "compact", label: "Compacto", icon: Rows3 },
  { value: "medium", label: "Médio", icon: AlignJustify },
  { value: "expanded", label: "Expandido", icon: StretchHorizontal },
];

export function DensityToggle({
  value,
  onChange,
}: {
  value: Density;
  onChange: (v: Density) => void;
}) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9" title="Tamanho das linhas">
          <Icon className="h-4 w-4 mr-1" /> {current.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
            <o.icon className="h-4 w-4 mr-2" />
            {o.label}
            {o.value === value && <Check className="h-4 w-4 ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const COMPACT_TABLE_CLASS =
  "[&_td]:!py-1 [&_td]:!text-[11px] [&_th]:!h-8 [&_th]:!py-1 [&_th]:!text-[11px]";

export const MEDIUM_TABLE_CLASS =
  "[&_td]:!py-2 [&_td]:!text-xs [&_th]:!h-10 [&_th]:!py-2 [&_th]:!text-xs";

export const EXPANDED_TABLE_CLASS =
  "[&_td]:!py-3.5 [&_td]:!text-sm [&_th]:!h-12 [&_th]:!py-3 [&_th]:!text-sm";

export function densityClass(density: Density) {
  if (density === "medium") return MEDIUM_TABLE_CLASS;
  if (density === "expanded") return EXPANDED_TABLE_CLASS;
  return COMPACT_TABLE_CLASS;
}