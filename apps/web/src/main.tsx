import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerServiceWorker } from "./pwa";
import { ThemeProvider } from "./useTheme";
import "./styles.css";
import "./mobile-layout.css";
import "./app-polish.css";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
