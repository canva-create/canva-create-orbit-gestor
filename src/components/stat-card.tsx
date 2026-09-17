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
  className,
  size = "default",
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  sub?: string;
  className?: string;
  size?: "default" | "sm" | "xs";
}) {
  const isSm = size === "sm" || size === "xs";
  return (
    <Card
      className={cn(
        "relative overflow-hidden bg-gradient-to-br border transition-all",
        isSm ? "px-2.5 py-2" : "px-3 py-2.5",
        toneMap[tone],
        className
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "uppercase tracking-wider text-muted-foreground font-semibold truncate",
              isSm ? "text-[10px] leading-tight" : "text-[11px] leading-tight"
            )}
            title={typeof label === "string" ? label : undefined}
          >
            {label}
          </div>
          <div
            className={cn(
              "font-bold text-foreground truncate leading-tight mt-0.5",
              isSm ? "text-base sm:text-lg" : "text-lg sm:text-xl"
            )}
          >
            {value}
          </div>
          {sub && (
            <div
              className={cn(
                "text-muted-foreground truncate leading-none mt-0.5",
                isSm ? "text-[9.5px]" : "text-[11px]"
              )}
            >
              {sub}
            </div>
          )}
        </div>
        <div
          className={cn(
            "rounded-md grid place-items-center bg-background/40 border shrink-0",
            isSm ? "h-7 w-7 sm:h-8 sm:w-8" : "h-9 w-9",
            toneMap[tone]
          )}
        >
          <Icon className={isSm ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4.5 w-4.5"} />
        </div>
      </div>
    </Card>
  );
}