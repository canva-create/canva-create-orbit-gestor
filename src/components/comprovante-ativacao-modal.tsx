import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileText,
  Copy,
  ClipboardCopy,
  MessageCircle,
  CheckCircle2,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  ComprovanteData,
  exportComprovantePNG,
  exportComprovantePDF,
  copyComprovanteImageToClipboard,
  comprovanteTextoFormatado,
  renderComprovanteCanvas,
} from "@/lib/comprovante-ativacao-generator";
import { whatsappLink } from "@/lib/iptv";

interface ComprovanteAtivacaoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ComprovanteData | null;
  clienteTelefone?: string | null;
}

export function ComprovanteAtivacaoModal({
  open,
  onOpenChange,
  data,
  clienteTelefone,
}: ComprovanteAtivacaoModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !data) {
      setPreviewUrl(null);
      return;
    }

    try {
      const canvas = renderComprovanteCanvas(data);
      setPreviewUrl(canvas.toDataURL("image/png"));
    } catch (err) {
      console.error("Erro ao renderizar preview do comprovante:", err);
      toast.error("Não foi possível gerar a pré-visualização do comprovante.");
    }
  }, [open, data]);

  if (!data) return null;

  const handleDownloadPNG = async () => {
    try {
      setDownloading(true);
      await exportComprovantePNG(data);
      toast.success("Comprovante PNG baixado com sucesso!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao baixar PNG");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setDownloading(true);
      await exportComprovantePDF(data);
      toast.success("Comprovante PDF baixado com sucesso!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao baixar PDF");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyImage = async () => {
    try {
      const ok = await copyComprovanteImageToClipboard(data);
      if (ok) {
        toast.success("Imagem copiada! Cole no WhatsApp com Ctrl + V.");
      } else {
        toast.error("Seu navegador não suporta cópia direta de imagem para a área de transferência. Use 'Baixar PNG'.");
      }
    } catch {
      toast.error("Erro ao copiar imagem.");
    }
  };

  const handleCopyText = async () => {
    try {
      const text = comprovanteTextoFormatado(data);
      await navigator.clipboard.writeText(text);
      toast.success("Texto do comprovante copiado!");
    } catch {
      toast.error("Erro ao copiar texto.");
    }
  };

  const handleSendWhatsApp = () => {
    if (!clienteTelefone) return;
    const text = comprovanteTextoFormatado(data);
    const link = `${whatsappLink(clienteTelefone)}?text=${encodeURIComponent(text)}`;
    window.open(link, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="pb-2 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Comprovante de Ativação — Rodolfo TV
          </DialogTitle>
        </DialogHeader>

        {/* Visualizador do Comprovante com Scroll */}
        <div className="flex-1 overflow-y-auto py-3 px-1 flex justify-center items-start min-h-[300px] max-h-[60vh] bg-muted/30 rounded-lg border border-border/40">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Comprovante de Ativação Rodolfo TV"
              className="w-full max-w-[420px] rounded-lg shadow-lg object-contain border border-border/50"
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              Carregando comprovante...
            </div>
          )}
        </div>

        {/* Ações de Download e Compartilhamento */}
        <DialogFooter className="pt-3 border-t border-border/60 flex-col sm:flex-row gap-2 sm:justify-between items-stretch sm:items-center">
          <div className="flex flex-wrap items-center gap-1.5 justify-center sm:justify-start">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleDownloadPNG}
              disabled={downloading}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              <ImageIcon className="h-4 w-4" /> Baixar PNG
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="gap-1.5 font-medium"
            >
              <FileText className="h-4 w-4 text-rose-500" /> Baixar PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyImage}
              title="Copiar imagem para colar no WhatsApp Web com Ctrl + V"
              className="gap-1.5"
            >
              <Copy className="h-4 w-4" /> Copiar Imagem
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyText}
              title="Copiar texto formatado"
              className="gap-1.5"
            >
              <ClipboardCopy className="h-4 w-4" /> Texto
            </Button>
            {clienteTelefone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendWhatsApp}
                className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
