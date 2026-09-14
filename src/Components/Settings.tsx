import { useState, type CSSProperties } from "react";

// Filler settings screen: every control responds, but nothing is saved yet.
export default function Settings() {
  const [displayName, setDisplayName] = useState("");
  const [theme, setTheme] = useState("system");
  const [serverUrl, setServerUrl] = useState("http://localhost:8787");
  const [showPreviews, setShowPreviews] = useState(true);
  const [keepDeletedDays, setKeepDeletedDays] = useState("30");
  const [notify, setNotify] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <main className="container">
      <h1>Settings</h1>

      <form
        style={styles.form}
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      >
        <fieldset style={styles.section}>
          <legend style={styles.legend}>General</legend>
          <label style={styles.field}>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} placeholder="Your name" />
          </label>
          <label style={styles.field}>
            Theme
            <select value={theme} onChange={(e) => setTheme(e.currentTarget.value)}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </fieldset>

        <fieldset style={styles.section}>
          <legend style={styles.legend}>Server</legend>
          <label style={styles.field}>
            Server URL
            <input value={serverUrl} onChange={(e) => setServerUrl(e.currentTarget.value)} />
          </label>
        </fieldset>

        <fieldset style={styles.section}>
          <legend style={styles.legend}>Files</legend>
          <label style={styles.checkRow}>
            <input type="checkbox" checked={showPreviews} onChange={(e) => setShowPreviews(e.currentTarget.checked)} />
            Show image previews
          </label>
          <label style={styles.field}>
            Keep deleted files for
            <select value={keepDeletedDays} onChange={(e) => setKeepDeletedDays(e.currentTarget.value)}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
        </fieldset>

        <fieldset style={styles.section}>
          <legend style={styles.legend}>Notifications</legend>
          <label style={styles.checkRow}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.currentTarget.checked)} />
            Notify me when someone updates a file
          </label>
        </fieldset>

        <fieldset style={styles.section}>
          <legend style={styles.legend}>About</legend>
          <p style={styles.muted}>Sunkiss 0.1.0</p>
          <p style={styles.muted}>Connected to {serverUrl}</p>
        </fieldset>

        <button type="submit" className="primary" style={styles.save}>
          Save
        </button>
        {saved && (
          <p className="note fade-in" style={styles.muted}>
            Saved (not really yet: this screen is filler).
          </p>
        )}
      </form>
    </main>
  );
}

const styles = {
  form: { maxWidth: 480, width: "100%", margin: "0 auto", textAlign: "left", display: "flex", flexDirection: "column", gap: 28 },
  // Nothing is drawn around a group, as in QuickView: its label says where it starts.
  section: { margin: 0, padding: 0, border: "none", display: "flex", flexDirection: "column", gap: 12 },
  legend: { padding: 0, marginBottom: 10, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dim)" },
  field: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 },
  muted: { margin: 0, fontSize: 13.5, color: "var(--dim)" },
  save: { alignSelf: "flex-start" },
} satisfies Record<string, CSSProperties>;
