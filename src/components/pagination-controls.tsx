import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";

export type PageSize = 10 | 25 | 50 | 100;
export const PAGE_SIZES: PageSize[] = [10, 25, 50, 100];
export const INITIAL_LOAD = Number.MAX_SAFE_INTEGER;
export const LOAD_STEP = Number.MAX_SAFE_INTEGER;

type Props = {
  total: number;
  loaded: number;
  pageSize: PageSize;
  page: number;
  onPageSizeChange: (v: PageSize) => void;
  onPageChange: (p: number) => void;
  onLoadMore: () => void;
  label?: string;
};

export function PaginationControls({
  total, loaded, pageSize, page, onPageSizeChange, onPageChange, onLoadMore, label = "registros",
}: Props) {
  const totalPages = Math.max(1, Math.ceil(loaded / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, loaded);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-t bg-muted/20 text-xs">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">
          Exibindo <span className="text-foreground font-semibold">{start.toLocaleString("pt-BR")}–{end.toLocaleString("pt-BR")}</span>
          {" de "}
          <span className="text-foreground font-semibold">{total.toLocaleString("pt-BR")}</span> {label}
          {loaded < total && (
            <span className="ml-2 text-muted-foreground">
              (carregados: {loaded.toLocaleString("pt-BR")})
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Por página:</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}>
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onPageChange(1)} disabled={safePage === 1} title="Primeira página">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onPageChange(safePage - 1)} disabled={safePage === 1} title="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 whitespace-nowrap">
            Página <span className="font-semibold text-foreground">{safePage}</span> / {totalPages}
          </span>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onPageChange(safePage + 1)} disabled={safePage === totalPages} title="Próxima página">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onPageChange(totalPages)} disabled={safePage === totalPages} title="Última página">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}