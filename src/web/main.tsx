import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app";

registerSW({ immediate: true });

const container = document.getElementById("root");
if (!container) throw new Error("Falta el contenedor #root");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
