import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchClientes, fetchClientesExcluidos } from "@/lib/queries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Search,
  Users,
  Clock,
  Trash2,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { diasParaVencer, currencyBRL } from "@/lib/iptv";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Função simples para calcular similaridade de strings (Levenshtein simplificado ou apenas normalização)
function normalizeString(str: string) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, ""); // remove caracteres especiais
}

interface AnaliseResultado {
  tipo: "duplicado" | "desatualizado" | "longo_vencimento";
  confianca: number;
  descricao: string;
  clienteA: any;
  clienteB?: any; // Para duplicados
}

export function AnaliseBaseDialog() {
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: fetchClientes });
  const { data: excluidos = [] } = useQuery({ queryKey: ["clientes_excluidos"], queryFn: fetchClientesExcluidos });
  const [isOpen, setIsOpen] = useState(false);

  const analise = useMemo(() => {
    if (!isOpen) return [];
    
    const resultados: AnaliseResultado[] = [];
    const todosClientes = [...clientes];
    const normalizados = todosClientes.map(c => ({
      ...c,
      nomeNorm: normalizeString(c.nome || ""),
      telNorm: (c.telefone || "").replace(/\D/g, "")
    }));

    // 1. Identificar Duplicados
    const processed = new Set();
    for (let i = 0; i < normalizados.length; i++) {
      if (processed.has(normalizados[i].id)) continue;
      
      for (let j = i + 1; j < normalizados.length; j++) {
        const c1 = normalizados[i];
        const c2 = normalizados[j];

        // Mesma "chave" (nome normalizado longo ou telefone idêntico)
        const nomesSimilares = c1.nomeNorm.length > 5 && c1.nomeNorm === c2.nomeNorm;
        const telsIdenticos = c1.telNorm.length > 8 && c1.telNorm === c2.telNorm;
        const macsIdenticos = c1.mac && c2.mac && c1.mac.toLowerCase() === c2.mac.toLowerCase();

        if (nomesSimilares || telsIdenticos || macsIdenticos) {
          resultados.push({
            tipo: "duplicado",
            confianca: telsIdenticos || macsIdenticos ? 95 : 80,
            descricao: nomesSimilares ? "Nomes idênticos ou muito similares" : 
                       telsIdenticos ? "Mesmo número de telefone" : "Mesmo endereço MAC",
            clienteA: c1,
            clienteB: c2
          });
          processed.add(c2.id);
        }
      }
    }

    // 2. Identificar Cadastros Desatualizados (vencidos há muito tempo)
    const HOJE = new Date();
    const LIMITE_VENCIDO_DIAS = -180; // 6 meses
    
    clientes.forEach(c => {
      const dias = diasParaVencer(c.data_vencimento);
      if (dias !== null && dias < LIMITE_VENCIDO_DIAS) {
        resultados.push({
          tipo: "desatualizado",
          confianca: 90,
          descricao: `Vencido há mais de ${Math.abs(dias)} dias`,
          clienteA: c
        });
      }
    });

    // 3. Datas de vencimento muito distantes (possível erro de digitação)
    const LIMITE_FUTURO_DIAS = 1095; // 3 anos
    clientes.forEach(c => {
      const dias = diasParaVencer(c.data_vencimento);
      if (dias !== null && dias > LIMITE_FUTURO_DIAS) {
        resultados.push({
          tipo: "longo_vencimento",
          confianca: 85,
          descricao: `Vencimento muito distante (${Math.round(dias/30)} meses)`,
          clienteA: c
        });
      }
    });

    return resultados.sort((a, b) => b.confianca - a.confianca);
  }, [clientes, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/10">
          <Search className="h-4 w-4" />
          Análise de Limpeza
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            Análise da Base de Clientes
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Identificação de duplicados, cadastros antigos e possíveis erros de data para auxiliar na organização da base.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-4 pr-2">
          {analise.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma inconsistência ou duplicidade óbvia encontrada na base atual.
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                  <TableHead>Inconsistência</TableHead>
                  <TableHead>Cliente(s)</TableHead>
                  <TableHead className="text-right">Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analise.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {item.tipo === "duplicado" && (
                        <Badge variant="outline" className="border-blue-500/50 text-blue-400">Duplicado</Badge>
                      )}
                      {item.tipo === "desatualizado" && (
                        <Badge variant="outline" className="border-red-500/50 text-red-400">Antigo</Badge>
                      )}
                      {item.tipo === "longo_vencimento" && (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-400">Revisar</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{item.descricao}</div>
                      <div className="text-xs text-muted-foreground">Confiança: {item.confianca}%</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-semibold">{item.clienteA.nome}</span>
                          {item.clienteA.telefone && <span className="text-xs text-muted-foreground">({item.clienteA.telefone})</span>}
                        </div>
                        {item.clienteB && (
                          <div className="flex items-center gap-2 pl-5 border-l-2 border-blue-500/20">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-semibold">{item.clienteB.nome}</span>
                            {item.clienteB.telefone && <span className="text-xs text-muted-foreground">({item.clienteB.telefone})</span>}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-xs flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {item.clienteA.data_vencimento ? new Date(item.clienteA.data_vencimento).toLocaleDateString("pt-BR") : "N/D"}
                        </div>
                        {item.clienteB && (
                           <div className="text-xs flex items-center gap-1 opacity-70">
                           <Calendar className="h-3 w-3" />
                           {item.clienteB.data_vencimento ? new Date(item.clienteB.data_vencimento).toLocaleDateString("pt-BR") : "N/D"}
                         </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="mt-4 pt-4 border-t flex justify-between items-center text-xs text-muted-foreground">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><Badge className="h-2 w-2 p-0 rounded-full bg-blue-500" /> Duplicados: {analise.filter(a => a.tipo === "duplicado").length}</span>
            <span className="flex items-center gap-1"><Badge className="h-2 w-2 p-0 rounded-full bg-red-500" /> Antigos: {analise.filter(a => a.tipo === "desatualizado").length}</span>
            <span className="flex items-center gap-1"><Badge className="h-2 w-2 p-0 rounded-full bg-amber-500" /> Erros de Data: {analise.filter(a => a.tipo === "longo_vencimento").length}</span>
          </div>
          <div>Total de {analise.length} registros para análise</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
