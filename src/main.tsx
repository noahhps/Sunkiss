import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// In the desktop app the window itself is frosted glass (src-tauri/src/lib.rs), so the page
// stays transparent over it. Anywhere else App.css gives it a solid background instead.
if ("__TAURI_INTERNALS__" in window) document.documentElement.dataset.shell = "tauri";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
