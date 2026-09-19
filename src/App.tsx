import { useState } from "react";
import NavBar, { type Screen } from "./Components/NavBar";
import Home from "./Components/Home";
import Settings from "./Components/Settings";
import Stream from "./Components/Stream";
import "./App.css";

const SCREENS = { home: Home, stream: Stream, settings: Settings };

// The app's frame: the nav bar on top, and whichever screen is selected below it.
function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const Current = SCREENS[screen];

  return (
    <div style={{ display: "flex" }}>
      {/* The window has no visible title bar, so this invisible strip is what you drag it by. */}
      <div className="titlebar" data-tauri-drag-region />
      <NavBar current={screen} onNavigate={setScreen} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Current />
      </div>

    </div>
  );
}

export default App;
