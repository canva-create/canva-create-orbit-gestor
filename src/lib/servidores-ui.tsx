import { useState, useMemo } from "react";
import { SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { currencyBRL } from "@/lib/iptv";

/** Ordem fixa das categorias em todos os seletores do sistema. */
export const ORDEM_CATEGORIAS = ["TOP", "Premium", "P2P", "IPTV"] as const;

/** Agrupa servidores por categoria (TOP → Premium → P2P → IPTV) e ordena alfabeticamente dentro de cada uma. */
export function agruparServidores<T extends { categoria?: string | null; nome?: string | null }>(
  servidores: T[] = [],
): { categoria: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const s of servidores) {
    const cat = (s?.categoria as string) || "IPTV";
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat)!.push(s);
  }
  const extras = [...grupos.keys()].filter((c) => !(ORDEM_CATEGORIAS as readonly string[]).includes(c)).sort();
  return [...ORDEM_CATEGORIAS, ...extras]
    .filter((c) => (grupos.get(c) ?? []).length > 0)
    .map((c) => ({
      categoria: c,
      itens: (grupos.get(c) ?? []).sort((a, b) =>
        String(a?.nome ?? "").localeCompare(String(b?.nome ?? ""), "pt-BR", { sensitivity: 'base' }),
      ),
    }));
}

/** Componente de Combobox com busca (lupinha) para selecionar servidor. */
export function ServidorCombobox({
  servidores = [],
  value,
  onValueChange,
  placeholder = "Selecione o servidor",
  allowNone = true,
  noneLabel = "Nenhum servidor",
  className,
  disabled = false,
}: {
  servidores: any[];
  value?: string | null;
  onValueChange: (val: string | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedServidor = useMemo(() => {
    if (!value || value === "none") return null;
    return servidores.find((s) => String(s.id) === String(value)) || null;
  }, [servidores, value]);

  const filteredGrupos = useMemo(() => {
    const q = search.trim().toLowerCase();
    const grupos = agruparServidores(servidores);
    if (!q) return grupos;
    return grupos
      .map((g) => ({
        categoria: g.categoria,
        itens: g.itens.filter((s) => {
          const nome = String(s.nome ?? "").toLowerCase();
          const cat = String(s.categoria ?? "").toLowerCase();
          return nome.includes(q) || cat.includes(q);
        }),
      }))
      .filter((g) => g.itens.length > 0);
  }, [servidores, search]);

  const totalFiltrados = useMemo(() => {
    return filteredGrupos.reduce((acc, g) => acc + g.itens.length, 0);
  }, [filteredGrupos]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between text-xs font-normal px-2.5",
            !selectedServidor && "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selectedServidor
                ? `${selectedServidor.nome} — ${currencyBRL(Number(selectedServidor.custo_mensal || 0))}`
                : placeholder}
            </span>
          </div>
          <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] sm:w-[350px] p-0 shadow-lg border-border" align="start">
        <div className="flex items-center border-b px-2.5 py-1.5 gap-2 bg-muted/20">
          <Search className="h-3.5 w-3.5 shrink-0 text-primary" />
          <Input
            placeholder="Digitar nome do servidor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0 px-1 placeholder:text-muted-foreground"
            autoFocus
          />
          {search && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => setSearch("")}
              title="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="max-h-[260px] overflow-y-auto p-1 text-xs space-y-1">
          {allowNone && (
            <button
              type="button"
              onClick={() => {
                onValueChange(null);
                setOpen(false);
                setSearch("");
              }}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between text-muted-foreground hover:bg-muted transition-colors text-xs",
                (!value || value === "none") && "bg-primary/10 text-primary font-medium"
              )}
            >
              <span>{noneLabel}</span>
              {(!value || value === "none") && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          )}

          {filteredGrupos.map((g) => (
            <div key={g.categoria} className="pt-1 first:pt-0">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center justify-between bg-muted/30 rounded-sm mb-0.5">
                <span>{g.categoria}</span>
                <span className="text-[9px] font-normal">{g.itens.length}</span>
              </div>
              <div className="space-y-0.5">
                {g.itens.map((s) => {
                  const isSelected = String(s.id) === String(value);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onValueChange(s.id);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between gap-2 transition-colors hover:bg-primary/10 hover:text-primary text-xs",
                        isSelected && "bg-primary/15 font-semibold text-primary"
                      )}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{s.nome}</span>
                        {s.categoria && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-normal shrink-0">
                            {s.categoria}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                        <span className="text-emerald-400 font-medium">
                          {currencyBRL(Number(s.custo_mensal || 0))}
                        </span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {totalFiltrados === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhum servidor encontrado para "{search}"
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Itens de <Select> agrupados por categoria. */
export function ServidorSelectItems({
  servidores,
  label,
}: {
  servidores: any[];
  label?: (s: any) => React.ReactNode;
}) {
  return (
    <>
      {agruparServidores(servidores).map((g) => (
        <SelectGroup key={g.categoria}>
          <SelectLabel className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.categoria}
          </SelectLabel>
          {g.itens.map((s: any) => (
            <SelectItem key={s.id} value={s.id}>
              {label ? label(s) : s.nome}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}

/** Itens de <DropdownMenu> agrupados por categoria. */
export function ServidorDropdownItems({
  servidores,
  onSelect,
}: {
  servidores: any[];
  onSelect: (s: any) => void;
}) {
  return (
    <>
      {agruparServidores(servidores).map((g) => (
        <div key={g.categoria}>
          <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.categoria}
          </DropdownMenuLabel>
          {g.itens.map((s: any) => (
            <DropdownMenuItem key={s.id} onClick={() => onSelect(s)}>
              {s.nome}
            </DropdownMenuItem>
          ))}
        </div>
      ))}
    </>
  );
}
