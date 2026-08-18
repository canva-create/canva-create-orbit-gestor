import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileImage, FileType, FileCode } from "lucide-react";
import { toast } from "sonner";
import { exportConsolidado, type ExportFormat, type ExportSection } from "@/lib/central-export";

const OPTS: { key: ExportFormat; label: string; icon: any }[] = [
  { key: "pdf", label: "PDF", icon: FileText },
  { key: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { key: "docx", label: "Word (.docx)", icon: FileType },
  { key: "txt", label: "TXT", icon: FileCode },
  { key: "png", label: "PNG", icon: FileImage },
];

export function ExportConsolidado({
  reportName,
  sections,
  label = "Exportar Consolidado",
  size = "sm",
}: {
  reportName: string;
  sections: () => ExportSection[];
  label?: string;
  size?: "sm" | "icon";
}) {
  const run = async (f: ExportFormat) => {
    try {
      await exportConsolidado(f, reportName, sections());
      toast.success(`${reportName} exportado em ${f.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao exportar");
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs">
          <Download className="h-3 w-3" />
          {size === "sm" && label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs">{reportName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTS.map((o) => (
          <DropdownMenuItem key={o.key} className="text-xs gap-2" onClick={() => run(o.key)}>
            <o.icon className="h-3.5 w-3.5" /> {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
