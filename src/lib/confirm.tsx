import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Options = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type State = Options & { open: boolean; resolve?: (v: boolean) => void };

let externalSet: ((s: State) => void) | null = null;

export function confirmDialog(opts: Options | string): Promise<boolean> {
  const options: Options = typeof opts === "string" ? { description: opts } : opts;
  return new Promise((resolve) => {
    if (!externalSet) {
      // Fallback for SSR or when host not mounted yet
      try {
        resolve(typeof window !== "undefined" && window.confirm(options.description ?? options.title ?? "Confirmar?"));
      } catch {
        resolve(false);
      }
      return;
    }
    externalSet({ ...options, open: true, resolve });
  });
}

export function ConfirmDialogHost() {
  const [state, setState] = useState<State>({ open: false });
  useEffect(() => {
    externalSet = setState;
    return () => {
      externalSet = null;
    };
  }, []);

  function close(value: boolean) {
    state.resolve?.(value);
    setState({ open: false });
  }

  return (
    <AlertDialog open={state.open} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title ?? "Confirmar ação"}</AlertDialogTitle>
          {state.description && (
            <AlertDialogDescription className="whitespace-pre-line">
              {state.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {state.cancelText ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={state.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {state.confirmText ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}