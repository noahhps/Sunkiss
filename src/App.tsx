import { useEffect, useState, type ReactNode } from "react";
import NavBar, { type Screen } from "./Components/NavBar";
import Home from "./Components/Home";
import Settings from "./Components/Settings";
import Stream from "./Components/Stream";
import Upload from "./Components/Upload";
import "./App.css";

// The app's frame: the nav bar on top, and whichever screen is selected below it.
function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [dropped, setDropped] = useState<File[] | null>(null); // files dropped on Home, on their way to Upload

  // A file dropped anywhere but a drop zone would open in the window, in place of the app.
  useEffect(() => {
    const keep = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", keep);
    window.addEventListener("drop", keep);
    return () => {
      window.removeEventListener("dragover", keep);
      window.removeEventListener("drop", keep);
    };
  }, []);

  const screens: Record<Screen, ReactNode> = {
    home: (
      <Home
        onNavigate={setScreen}
        onDropFiles={(files) => {
          setDropped(files);
          setScreen("upload");
        }}
      />
    ),
    upload: <Upload initialFiles={dropped} onConsumed={() => setDropped(null)} />,
    stream: <Stream />,
    settings: <Settings />,
  };

  return (
    <div className="app">
      {/* The window has no visible title bar, so this invisible strip is what you drag it by. */}
      <div className="titlebar" data-tauri-drag-region />
      <NavBar current={screen} onNavigate={setScreen} />
      <div style={{ flex: 1, minWidth: 0 }}>{screens[screen]}</div>
    </div>
  );
}

export default App;
