import { Component, type ReactNode } from "react";
import { es } from "../i18n/es";

interface Props {
  children: ReactNode;
  /** Por defecto recarga la página; inyectable para probar sin navegación real. */
  onReload?: () => void;
}

// R39: una excepción al renderizar muestra una pantalla de error con «Recargar», no una página en
// blanco. No registra nada en consola (R86).
export class AppErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="ph-main" role="alert">
        <h1>{es.crash.title}</h1>
        <p>{es.crash.message}</p>
        <button
          type="button"
          className="ph-button ph-button--primary"
          onClick={this.props.onReload ?? (() => window.location.reload())}
        >
          {es.crash.reload}
        </button>
      </main>
    );
  }
}
