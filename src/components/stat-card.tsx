import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "red" | "green" | "purple" | "orange" | "yellow";

const toneMap: Record<Tone, string> = {
  blue: "from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400",
  red: "from-red-500/20 to-red-500/5 border-red-500/30 text-red-400",
  green: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400",
  purple: "from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-400",
  orange: "from-orange-500/20 to-orange-500/5 border-orange-500/30 text-orange-400",
  yellow: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30 text-yellow-400",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  sub,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  sub?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden px-3 py-2.5 bg-gradient-to-br border", toneMap[tone])}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">{label}</div>
          <div className="text-2xl font-bold text-foreground truncate leading-tight">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className={cn("h-10 w-10 rounded-md grid place-items-center bg-background/40 border shrink-0", toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}