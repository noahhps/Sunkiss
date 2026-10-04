import React from "react";
import ReactDOM from "react-dom/client";
// Inter, bundled with the app rather than expected on the Mac (macOS doesn't come with it):
// the same everywhere, and no network needed. The variable font with optical sizes, so small
// labels get Inter's open text design and big headings its tighter display one.
import "@fontsource-variable/inter/opsz.css";
import App from "./App";

// In the desktop app the window itself is frosted glass (src-tauri/src/lib.rs), so the page
// stays transparent over it. Anywhere else App.css gives it a solid background instead.
if ("__TAURI_INTERNALS__" in window) document.documentElement.dataset.shell = "tauri";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
