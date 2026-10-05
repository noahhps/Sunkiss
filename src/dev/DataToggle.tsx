import { dataMode, MODES } from "./worstCase";

// Dev only: switches the data the app is given between the server's and the fixtures in
// worstCase.ts. Plain on purpose: it's tooling, not part of the design. It sits at the top
// centre rather than the bottom, where the search bar already is. The choice lives in the URL
// (?data=…), so a reload keeps it; switching reloads, since the data is read once, on load.
export default function DataToggle() {
  const current = dataMode();
  return (
    <div role="radiogroup" aria-label="Test data" style={styles.track}>
      {MODES.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={mode === current}
          style={{ ...styles.segment, ...(mode === current ? styles.active : null) }}
          onClick={() => {
            const url = new URL(location.href);
            if (mode === "demo") url.searchParams.delete("data");
            else url.searchParams.set("data", mode);
            location.href = url.toString();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const styles = {
  track: {
    position: "fixed",
    zIndex: 1000,
    top: 6,
    left: "50%",
    translate: "-50% 0",
    display: "flex",
    gap: 2,
    padding: 2,
    borderRadius: 8,
    background: "#d4d4d8",
    font: "12px/1 system-ui, sans-serif",
  },
  segment: {
    padding: "5px 10px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "#3f3f46",
    font: "inherit",
    transition: "none",
    scale: 1,
  },
  active: { background: "#fff", color: "#000", boxShadow: "0 1px 2px rgba(0,0,0,.15)" },
} satisfies Record<string, React.CSSProperties>;
