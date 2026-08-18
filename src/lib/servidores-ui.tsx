import { SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";

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
