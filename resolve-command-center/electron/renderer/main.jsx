import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { LocalizationProvider } from "./LocalizationContext.jsx";
import { api } from "./api.mjs";
import "./styles.css";

const isDetachedInteractionPanel = new URLSearchParams(window.location.search).get("view") === "interaction-panel";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isDetachedInteractionPanel ? <App /> : <LocalizationProvider api={api}><App /></LocalizationProvider>}
  </React.StrictMode>
);
