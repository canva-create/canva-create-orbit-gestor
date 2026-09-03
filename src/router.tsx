import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 10, // 10 minutos de cache reutilizável (elimina requisições em navegação)
        gcTime: 1000 * 60 * 30, // 30 minutos em memória
        refetchOnWindowFocus: false, // Evita requisições repetitivas ao alternar janelas/abas
        refetchOnMount: false, // Reutiliza cache ao entrar e sair de páginas
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
