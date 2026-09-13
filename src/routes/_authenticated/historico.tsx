import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/historico")({
  beforeLoad: () => {
    throw redirect({
      to: "/auditoria",
    });
  },
  component: () => null,
});