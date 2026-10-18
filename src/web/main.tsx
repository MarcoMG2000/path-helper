import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { registerSW } from "virtual:pwa-register";
import { createServices } from "./api/services";
import { App } from "./app";
import { createBroadcastSessionChannel } from "./session/session-channel";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";

registerSW({ immediate: true });

// Único punto de composición de la UI: servicios reales y canal entre pestañas.
const services = createServices();
const channel = createBroadcastSessionChannel();

const container = document.getElementById("root");
if (!container) throw new Error("Falta el contenedor #root");
createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App services={services} channel={channel} />
    </BrowserRouter>
  </StrictMode>,
);
