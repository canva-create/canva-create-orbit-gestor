import { createFileRoute } from "@tanstack/react-router";
import { COMPACT_TABLE_CLASS } from "@/components/density-toggle";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchServidores } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Trash2, Pencil, Server as ServerIcon, FileDown, Upload, Download, Copy, ExternalLink, Eye, Link2, RefreshCw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { currencyBRL } from "@/lib/iptv";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { logAudit, diffObjects } from "@/lib/audit";
import { exportConsolidado, type ExportFormat } from "@/lib/central-export";

const COLUNAS_SERV = [
  "Nome",
  "Categoria",
  "Valor do Crédito",
  "URL 1",
  "URL 2",
  "URL 3",
  "Login",
  "Senha",
  "Painel UniTV",
  "Email Cadastrado",
];

const FORMATOS: { key: ExportFormat; label: string }[] = [
  { key: "pdf", label: "PDF" },
  { key: "xlsx", label: "Excel" },
  { key: "docx", label: "Word" },
  { key: "txt", label: "TXT" },
  { key: "png", label: "PNG" },
];

async function copyText(text: string, label: string) {
  if (!text) return toast.error(`Sem ${label} para copiar`);
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  } catch {
    toast.error("Falha ao copiar");
  }
}

function emptyForm() {
  return {
    nome: "",
    custo_mensal: 0,
    categoria: "IPTV" as "TOP" | "Premium" | "P2P" | "IPTV",
    url: "",
    url2: "",
    url3: "",
    login: "",
    senha: "",
    painel_unitv: "",
    email_cadastrado: "",
  };
}

export const Route = createFileRoute("/_authenticated/servidores")({
  component: ServidoresPage,
});

export function ServidoresPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["servidores"], queryFn: fetchServidores });
  const { data: paineis = [] } = useQuery({
    queryKey: ["paineis_info"],
    queryFn: async () => {
      const { data, error } = await supabase.from("paineis_info").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const painelPorServidor = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of paineis as any[]) {
      const key = String(p?.servidor ?? "").trim().toLowerCase();
      if (key) map.set(key, p);
    }
    return map;
  }, [paineis]);

  const dados = useMemo(() => {
    return (data as any[]).map((s) => {
      const p = painelPorServidor.get(String(s?.nome ?? "").trim().toLowerCase());
      return {
        ...s,
        login: s.login || p?.login || "",
        senha: s.senha || p?.senha || "",
        painel_unitv: s.painel_unitv || p?.painel_unitv || "",
        email_cadastrado: s.email_cadastrado || p?.email_cadastrado || "",
        _urls: (() => {
          const list = [s?.url, s?.url2, s?.url3].map((u) => (u ? String(u).trim() : "")).filter(Boolean);
          if (list.length === 0 && p?.url) list.push(String(p.url));
          return list;
        })(),
      };
    });
  }, [data, painelPorServidor]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [viewing, setViewing] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const syncRef = useRef<HTMLInputElement>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const grupos = useMemo(() => {
    const ordem: Record<string, number> = { TOP: 0, Premium: 1, P2P: 2, IPTV: 3 };
    const arr = [...dados].sort((a, b) => {
      const ca = (ordem[a.categoria ?? "IPTV"] ?? 99) - (ordem[b.categoria ?? "IPTV"] ?? 99);
      if (ca !== 0) return ca;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
    return {
      TOP: arr.filter((s) => s.categoria === "TOP"),
      Premium: arr.filter((s) => s.categoria === "Premium"),
      P2P: arr.filter((s) => s.categoria === "P2P"),
      IPTV: arr.filter((s) => (s.categoria ?? "IPTV") === "IPTV"),
    };
  }, [dados]);

  function newOne() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }
  function edit(s: any) {
    setEditing(s);
    setForm({
      nome: s.nome,
      custo_mensal: Number(s.custo_mensal),
      categoria: (s.categoria ?? "IPTV") as "TOP" | "Premium" | "P2P" | "IPTV",
      url: s.url ?? "",
      url2: s.url2 ?? "",
      url3: s.url3 ?? "",
      login: s.login ?? "",
      senha: s.senha ?? "",
      painel_unitv: s.painel_unitv ?? "",
      email_cadastrado: s.email_cadastrado ?? "",
    });
    setOpen(true);
  }
  async function save() {
    if (!form.nome.trim()) return toast.error("Informe o nome");
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const payload = {
      nome: form.nome,
      custo_mensal: form.custo_mensal,
      categoria: form.categoria,
      url: form.url || null,
      url2: form.url2 || null,
      url3: form.url3 || null,
      url4: null,
      url5: null,
      login: form.login || null,
      senha: form.senha || null,
      painel_unitv: form.painel_unitv || null,
      email_cadastrado: form.email_cadastrado || null,
    };
    if (editing) {
      const { error } = await supabase.from("servidores").update(payload as any).eq("id", editing.id);
      if (error) return toast.error(error.message);
      const diff = diffObjects(editing, payload);
      await logAudit({ categoria: "servidor", acao: "editar", descricao: `Servidor "${payload.nome}" editado`, entidade: "servidores", entidade_id: editing.id, entidade_nome: payload.nome, dados_anteriores: diff.antes, dados_novos: diff.depois });
    } else {
      const { data: ins, error } = await supabase.from("servidores").insert({ user_id: user.id, ...payload } as any).select().maybeSingle();
      if (error) return toast.error(error.message);
      await logAudit({ categoria: "servidor", acao: "criar", descricao: `Servidor "${payload.nome}" cadastrado`, entidade: "servidores", entidade_id: (ins as any)?.id ?? null, entidade_nome: payload.nome, dados_novos: payload });
    }
    toast.success("Salvo!");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["servidores"] });
  }
  async function remove(id: string) {
    const { confirmDialog } = await import("@/lib/confirm");
    const ok = await confirmDialog({ title: "Excluir servidor?", description: "Esta ação não pode ser desfeita.", confirmText: "Excluir", destructive: true });
    if (!ok) return;
    const { error } = await supabase.from("servidores").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit({ categoria: "servidor", acao: "excluir", descricao: `Servidor excluído`, entidade: "servidores", entidade_id: id });
    qc.invalidateQueries({ queryKey: ["servidores"] });
  }

  function linhaExport(s: any) {
    return [
      s.nome,
      s.categoria ?? "IPTV",
      currencyBRL(s.custo_mensal),
      s._urls?.[0] ?? "",
      s._urls?.[1] ?? "",
      s._urls?.[2] ?? "",
      s.login ?? "",
      s.senha ?? "",
      s.painel_unitv ?? "",
      s.email_cadastrado ?? "",
    ];
  }

  async function baixarDetalhes(s: any, format: ExportFormat) {
    await exportConsolidado(format, `Servidor ${s.nome}`, [
      {
        title: `Servidor — ${s.nome}`,
        description: "Detalhes cadastrais do servidor e acesso ao painel.",
        columns: ["Campo", "Valor"],
        rows: [
          ["Nome do servidor", s.nome],
          ["Categoria", s.categoria ?? "IPTV"],
          ["Valor do crédito", currencyBRL(s.custo_mensal)],
          ["URL 1", s._urls?.[0] ?? "—"],
          ["URL 2", s._urls?.[1] ?? "—"],
          ["URL 3", s._urls?.[2] ?? "—"],
          ["Login", s.login || "—"],
          ["Senha", s.senha || "—"],
          ["Painel UniTV", s.painel_unitv || "—"],
          ["E-mail cadastrado", s.email_cadastrado || "—"],
        ],
      },
    ]);
    toast.success("Detalhes exportados!");
  }

  async function exportarTodos(format: ExportFormat) {
    await exportConsolidado(format, "Servidores", [
      {
        title: "Servidores",
        description: "Lista completa de servidores com custos e dados de acesso aos painéis.",
        columns: COLUNAS_SERV,
        rows: grupos.IPTV.concat(grupos.P2P).map(linhaExport),
      },
    ]);
    logAudit({ categoria: "exportacao", acao: "exportar", descricao: "Exportação de servidores", entidade: "servidores", metadata: { total: dados.length, format } });
  }

  async function sincronizar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSincronizando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      if (rows.length === 0) return toast.error("Planilha vazia.");
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const norm = (v: any) => String(v ?? "").replace(/\s+/g, " ").trim();
      const pick = (row: any, keys: string[]) => {
        const map = new Map<string, any>();
        Object.keys(row).forEach((k) => map.set(k.toLowerCase().trim(), row[k]));
        for (const k of keys) {
          const v = map.get(k.toLowerCase());
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
        return undefined;
      };

      const atuais = new Map<string, any>();
      for (const s of data as any[]) atuais.set(norm(s.nome).toUpperCase(), s);

      let atualizados = 0;
      let criados = 0;
      let iguais = 0;
      const erros: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const nome = norm(pick(r, ["nome", "nome do servidor", "servidor", "name"]));
        if (!nome) continue;
        const catRaw = norm(pick(r, ["categoria", "category", "tipo"])).toUpperCase();
        const custoRaw = pick(r, ["valor do crédito", "valor do credito", "credito", "crédito", "custo mensal", "custo", "custo_mensal", "valor"]);
        const campos: Record<string, any> = {
          categoria: catRaw === "P2P" ? "P2P" : catRaw === "IPTV" ? "IPTV" : catRaw === "PREMIUM" ? "Premium" : catRaw === "TOP" ? "TOP" : undefined,
          custo_mensal: custoRaw !== undefined ? Number(String(custoRaw).replace(",", ".")) || 0 : undefined,
          url: norm(pick(r, ["url 1", "url1", "url", "link", "painel"])) || undefined,
          url2: norm(pick(r, ["url 2", "url2"])) || undefined,
          url3: norm(pick(r, ["url 3", "url3"])) || undefined,
          login: norm(pick(r, ["login", "usuario", "usuário", "user"])) || undefined,
          senha: norm(pick(r, ["senha", "password", "pass"])) || undefined,
          painel_unitv: norm(pick(r, ["painel unitv", "painel_unitv", "unitv"])) || undefined,
          email_cadastrado: norm(pick(r, ["email cadastrado", "email_cadastrado", "email", "e-mail"])) || undefined,
        };

        const existente = atuais.get(nome.toUpperCase());
        if (existente) {
          const diff: Record<string, any> = {};
          for (const [k, v] of Object.entries(campos)) {
            if (v === undefined) continue; // campo ausente na planilha: preserva o atual
            const atual = k === "custo_mensal" ? Number(existente[k] ?? 0) : norm(existente[k]);
            const novo = k === "custo_mensal" ? Number(v) : norm(v);
            if (String(atual) !== String(novo)) diff[k] = v;
          }
          if (Object.keys(diff).length === 0) {
            iguais++;
            continue;
          }
          const { error } = await supabase.from("servidores").update(diff as any).eq("id", existente.id);
          if (error) { erros.push(`${nome}: ${error.message}`); continue; }
          await logAudit({
            categoria: "servidor",
            acao: "editar",
            descricao: `Servidor "${nome}" sincronizado por planilha (${Object.keys(diff).join(", ")})`,
            entidade: "servidores",
            entidade_id: existente.id,
            entidade_nome: nome,
            dados_anteriores: Object.fromEntries(Object.keys(diff).map((k) => [k, existente[k] ?? null])),
            dados_novos: diff,
          });
          atualizados++;
        } else {
          const { data: ins, error } = await supabase.from("servidores").insert({
            user_id: user.id,
            nome,
            categoria: (campos.categoria ?? "IPTV") as any,
            custo_mensal: campos.custo_mensal ?? 0,
            url: campos.url ?? null,
            url2: campos.url2 ?? null,
            url3: campos.url3 ?? null,
            url4: null,
            url5: null,
            login: campos.login ?? null,
            senha: campos.senha ?? null,
            painel_unitv: campos.painel_unitv ?? null,
            email_cadastrado: campos.email_cadastrado ?? null,
          } as any).select().maybeSingle();
          if (error) { erros.push(`${nome}: ${error.message}`); continue; }
          await logAudit({ categoria: "servidor", acao: "criar", descricao: `Servidor "${nome}" criado pela sincronização`, entidade: "servidores", entidade_id: (ins as any)?.id ?? null, entidade_nome: nome });
          criados++;
        }
      }

      qc.invalidateQueries({ queryKey: ["servidores"] });
      const partes: string[] = [];
      if (atualizados) partes.push(`${atualizados} atualizado(s)`);
      if (criados) partes.push(`${criados} novo(s)`);
      if (iguais) partes.push(`${iguais} sem divergência`);
      toast.success(partes.length ? partes.join(" · ") : "Nada para sincronizar");
      if (erros.length) toast.error(`${erros.length} falha(s). Ex: ${erros[0]}`);
      await logAudit({ categoria: "importacao", acao: "atualizar_planilha", descricao: "Sincronização de servidores por planilha", entidade: "servidores", metadata: { total: rows.length, atualizados, criados, iguais, erros: erros.length } });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao sincronizar planilha");
    } finally {
      setSincronizando(false);
    }
  }

  function baixarModelo() {
    const exemplo = [
      { Nome: "UNITV 01", Categoria: "IPTV", "Valor do Crédito": 9, "URL 1": "https://painel1.exemplo.com", "URL 2": "", "URL 3": "", Login: "usuario", Senha: "senha", "Painel UniTV": "https://unitv.exemplo.com", "Email Cadastrado": "email@exemplo.com" },
      { Nome: "P2P Sports", Categoria: "P2P", "Valor do Crédito": 5, "URL 1": "", "URL 2": "", "URL 3": "", Login: "", Senha: "", "Painel UniTV": "", "Email Cadastrado": "" },
    ];
    const ws = XLSX.utils.json_to_sheet(exemplo, { header: COLUNAS_SERV });
    ws["!cols"] = COLUNAS_SERV.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Servidores");
    XLSX.writeFile(wb, "modelo-importacao-servidores.xlsx");
    toast.success("Modelo baixado!");
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws);
    e.target.value = "";
    if (rows.length === 0) return toast.error("Planilha vazia.");
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const norm = (v: any) => String(v ?? "").trim();
    const pick = (row: any, keys: string[]) => {
      const map = new Map<string, any>();
      Object.keys(row).forEach((k) => map.set(k.toLowerCase().trim(), row[k]));
      for (const k of keys) {
        const v = map.get(k.toLowerCase());
        if (v !== undefined && v !== null && String(v).trim() !== "") return v;
      }
      return undefined;
    };

    let ok = 0;
    const failures: { nome: string; msg: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const nome = norm(pick(r, ["nome", "servidor", "name"]));
      if (!nome) {
        failures.push({ nome: `(linha ${i + 2})`, msg: "Nome vazio" });
        continue;
      }
      const catRaw = norm(pick(r, ["categoria", "category", "tipo"])).toUpperCase();
      const categoria = catRaw === "P2P" ? "P2P" : catRaw === "PREMIUM" ? "Premium" : catRaw === "TOP" ? "TOP" : "IPTV";
      const custoRaw = pick(r, ["valor do crédito", "valor do credito", "credito", "crédito", "custo mensal", "custo", "custo_mensal", "valor"]);
      const custo_mensal = Number(String(custoRaw ?? "0").replace(",", ".")) || 0;
      const url1 = norm(pick(r, ["url 1", "url1", "url", "link", "painel", "endereço", "endereco"]));
      const url2 = norm(pick(r, ["url 2", "url2"]));
      const url3 = norm(pick(r, ["url 3", "url3"]));
      const login = norm(pick(r, ["login", "usuario", "usuário", "user"]));
      const senha = norm(pick(r, ["senha", "password", "pass"]));
      const painel_unitv = norm(pick(r, ["painel unitv", "painel_unitv", "unitv"]));
      const email_cadastrado = norm(pick(r, ["email cadastrado", "email_cadastrado", "email", "e-mail"]));
      const { error } = await supabase.from("servidores").insert({
        user_id: user.id,
        nome,
        categoria: categoria as any,
        custo_mensal,
        url: url1 || null,
        url2: url2 || null,
        url3: url3 || null,
        url4: null,
        url5: null,
        login: login || null,
        senha: senha || null,
        painel_unitv: painel_unitv || null,
        email_cadastrado: email_cadastrado || null,
      } as any);
      if (error) failures.push({ nome, msg: error.message });
      else ok++;
    }
    if (ok > 0) toast.success(`${ok} servidor(es) importado(s)!`);
    await logAudit({ categoria: "importacao", acao: "importar", descricao: "Importação de servidores", entidade: "servidores", metadata: { total: rows.length, ok, falhas: failures.length } });
    if (failures.length > 0) {
      toast.error(`${failures.length} linha(s) com erro. Ex: ${failures[0].nome} — ${failures[0].msg}`);
      console.error("Falhas na importação:", failures);
    }
    qc.invalidateQueries({ queryKey: ["servidores"] });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ServerIcon className="h-6 w-6 text-primary"/> Servidores</h1>
          <p className="text-sm text-muted-foreground">Cadastro de servidores, custos e informações de acesso aos painéis</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={importar} />
          <Button variant="outline" size="sm" onClick={baixarModelo}><FileDown className="h-4 w-4 mr-1"/> Modelo</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1"/> Importar</Button>
          <input ref={syncRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={sincronizar} />
          <Button variant="outline" size="sm" disabled={sincronizando} onClick={() => syncRef.current?.click()}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sincronizando ? "animate-spin" : ""}`}/> Atualizar informações
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1"/> Exportar</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Exportar todos</DropdownMenuLabel>
              {FORMATOS.map((f) => (
                <DropdownMenuItem key={f.key} onClick={() => exportarTodos(f.key)}>{f.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={newOne}><Plus className="h-4 w-4 mr-1"/> Novo servidor</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} servidor</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v as "TOP" | "TOP" | "Premium" | "P2P" | "IPTV" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TOP">TOP (mais vendidos)</SelectItem>
                    <SelectItem value="Premium">Premium</SelectItem>
                    <SelectItem value="P2P">P2P</SelectItem>
                    <SelectItem value="IPTV">IPTV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Valor do crédito (R$)</Label><Input type="number" step="0.01" value={form.custo_mensal} onChange={(e) => setForm({ ...form, custo_mensal: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>URL 1</Label><Input type="url" placeholder="https://painel1.exemplo.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
              <div className="space-y-2"><Label>URL 2</Label><Input type="url" placeholder="https://painel2.exemplo.com" value={form.url2} onChange={(e) => setForm({ ...form, url2: e.target.value })} /></div>
              <div className="space-y-2"><Label>URL 3</Label><Input type="url" placeholder="https://painel3.exemplo.com" value={form.url3} onChange={(e) => setForm({ ...form, url3: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Login</Label><Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} /></div>
                <div className="space-y-2"><Label>Senha</Label><Input value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Painel UniTV</Label><Input value={form.painel_unitv} onChange={(e) => setForm({ ...form, painel_unitv: e.target.value })} /></div>
              <div className="space-y-2"><Label>E-mail cadastrado</Label><Input value={form.email_cadastrado} onChange={(e) => setForm({ ...form, email_cadastrado: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {(["TOP", "Premium", "P2P", "IPTV"] as const).map((cat) => (
        <Card key={cat} className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border-b">
            <Badge variant={cat === "TOP" || cat === "Premium" ? "default" : cat === "P2P" ? "secondary" : "outline"}>{cat}</Badge>
            <span className="text-sm text-muted-foreground">{grupos[cat].length} servidor(es)</span>
          </div>
          <div className="overflow-x-auto">
          <Table className={COMPACT_TABLE_CLASS}>
            <TableHeader className="bg-primary/10">
              <TableRow>
                <TableHead>Servidor</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Valor do crédito</TableHead>
                <TableHead>URLs do Servidor</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Senha</TableHead>
                <TableHead>Painel UniTV</TableHead>
                <TableHead>E-mail cadastrado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos[cat].map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nome}</TableCell>
                  <TableCell><Badge variant={["TOP", "Premium"].includes(s.categoria ?? "IPTV") ? "default" : (s.categoria ?? "IPTV") === "P2P" ? "secondary" : "outline"}>{s.categoria ?? "IPTV"}</Badge></TableCell>
                  <TableCell className="text-emerald-400 font-semibold">{currencyBRL(s.custo_mensal)}</TableCell>
                  <TableCell className="text-sm">
                    {s._urls.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s._urls.map((url: string, i: number) => (
                          <div key={i} className="inline-flex items-center gap-0.5 rounded border border-sky-500/30 bg-sky-500/10 pl-2 pr-1 py-0.5">
                            <a href={url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline inline-flex items-center gap-1 text-xs">
                              <ExternalLink className="h-3 w-3" /> URL {i + 1}
                            </a>
                            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyText(url, `URL ${i + 1}`)} title={`Copiar URL ${i + 1}`}>
                              <Copy className="h-3 w-3"/>
                            </Button>
                          </div>
                        ))}
                        {s._urls.length > 1 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-5 w-5" title="Escolher URL">
                                <Link2 className="h-3 w-3"/>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuLabel>Abrir</DropdownMenuLabel>
                              {s._urls.map((url: string, i: number) => (
                                <DropdownMenuItem key={`o${i}`} onClick={() => window.open(url, "_blank", "noreferrer")}>URL {i + 1}</DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>Copiar</DropdownMenuLabel>
                              {s._urls.map((url: string, i: number) => (
                                <DropdownMenuItem key={`c${i}`} onClick={() => copyText(url, `URL ${i + 1}`)}>URL {i + 1}</DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.login ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-xs">{s.login}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyText(s.login, "Login")} title="Copiar login"><Copy className="h-3 w-3"/></Button>
                      </span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    {s.senha ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-xs tracking-widest">••••••••</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyText(s.senha, "Senha")} title="Copiar senha"><Copy className="h-3 w-3"/></Button>
                      </span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.painel_unitv ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="max-w-[160px] truncate">{s.painel_unitv}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyText(s.painel_unitv, "Painel UniTV")} title="Copiar"><Copy className="h-3 w-3"/></Button>
                      </span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.email_cadastrado ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="max-w-[180px] truncate">{s.email_cadastrado}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyText(s.email_cadastrado, "E-mail")} title="Copiar"><Copy className="h-3 w-3"/></Button>
                      </span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setViewing(s)} title="Visualizar detalhes"><Eye className="h-4 w-4"/></Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" title="Baixar detalhes"><Download className="h-4 w-4"/></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Baixar detalhes</DropdownMenuLabel>
                        {FORMATOS.map((f) => (
                          <DropdownMenuItem key={f.key} onClick={() => baixarDetalhes(s, f.key)}>{f.label}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="icon" variant="ghost" onClick={() => edit(s)} title="Editar"><Pencil className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(s.id)} title="Excluir"><Trash2 className="h-4 w-4 text-red-400"/></Button>
                  </TableCell>
                </TableRow>
              ))}
              {grupos[cat].length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Nenhum servidor {cat}.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </Card>
      ))}

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes — {viewing?.nome}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              {[
                ["Categoria", viewing.categoria ?? "IPTV"],
                ["Valor do crédito", currencyBRL(viewing.custo_mensal)],
                ["URL 1", viewing._urls?.[0] ?? "—"],
                ["URL 2", viewing._urls?.[1] ?? "—"],
                ["URL 3", viewing._urls?.[2] ?? "—"],
                ["Login", viewing.login || "—"],
                ["Senha", viewing.senha || "—"],
                ["Painel UniTV", viewing.painel_unitv || "—"],
                ["E-mail cadastrado", viewing.email_cadastrado || "—"],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-right break-all inline-flex items-center gap-1">
                    {String(v)}
                    {String(v) !== "—" && (
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyText(String(v), String(k))}><Copy className="h-3 w-3"/></Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="h-4 w-4 mr-1"/> Baixar detalhes</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {FORMATOS.map((f) => (
                  <DropdownMenuItem key={f.key} onClick={() => viewing && baixarDetalhes(viewing, f.key)}>{f.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setViewing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
