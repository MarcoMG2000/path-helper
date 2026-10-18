import type { ReactNode } from "react";

export type AlertKind = "error" | "success" | "info";

// Errores con role="alert" (se anuncian al instante); el resto con role="status".
export function Alert({ kind, children }: { kind: AlertKind; children: ReactNode }) {
  return (
    <div className={`ph-alert ph-alert--${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
