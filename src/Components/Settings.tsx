import { useEffect, useState, type ReactNode } from "react";
import { IN_DESKTOP_APP } from "../api";
import { appsForKind, type App } from "../drive";
import { setFigmaToken, useFigmaToken } from "../figma";
import { chooseApp, useChosenApp, type Kind } from "../preferences";

// Settings, laid out the way macOS does them: each setting is a row, its name on the left and
// its control on the right (App.css, .settings). "Open files in" and the Figma token are real
// and apply right away; the rest is still filler: every control responds, but nothing is
// saved yet.
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
        className="settings"
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      >
        <Group title="Open files in">
          <OpenWith kind="image" label="Images" />
          <OpenWith kind="video" label="Videos" />
          <p className="settings-note">
            {IN_DESKTOP_APP
              ? "What “Open in” on a file uses. Changes apply right away."
              : "Only in the desktop app, which can see the apps on this Mac."}
          </p>
        </Group>

        <Group title="Figma">
          <FigmaToken />
        </Group>

        <Group title="General">
          <label className="setting">
            <span className="setting-label">Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} placeholder="Your name" />
          </label>
          <label className="setting">
            <span className="setting-label">Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.currentTarget.value)}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </Group>

        <Group title="Server">
          <label className="setting">
            <span className="setting-label">Server URL</span>
            <input value={serverUrl} onChange={(e) => setServerUrl(e.currentTarget.value)} />
          </label>
        </Group>

        <Group title="Files">
          <label className="setting-check">
            <input type="checkbox" checked={showPreviews} onChange={(e) => setShowPreviews(e.currentTarget.checked)} />
            Show image previews
          </label>
          <label className="setting">
            <span className="setting-label">Keep deleted files for</span>
            <select value={keepDeletedDays} onChange={(e) => setKeepDeletedDays(e.currentTarget.value)}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
        </Group>

        <Group title="Notifications">
          <label className="setting-check">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.currentTarget.checked)} />
            Notify me when someone updates a file
          </label>
        </Group>

        <Group title="About">
          <div className="setting">
            <span className="setting-label">Version</span>
            <span className="setting-value">Sunkiss 0.1.0</span>
          </div>
          <div className="setting">
            <span className="setting-label">Connected to</span>
            <span className="setting-value">{serverUrl}</span>
          </div>
        </Group>

        <div className="settings-rows">
          <div className="settings-footer">
            <button type="submit" className="primary">
              Save
            </button>
            {saved && <span className="note fade-in">Saved (not really yet: this screen is filler).</span>}
          </div>
        </div>
      </form>
    </main>
  );
}

// A group of settings under a small title. Nothing is drawn around it, as in QuickView: the
// title says where it starts. Inside, the rows line up in two columns (.settings-rows).
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="settings-group">
      <legend>{title}</legend>
      <div className="settings-rows">{children}</div>
    </fieldset>
  );
}

// The personal access token Sunkiss uses to ask Figma for files (figma.ts). Kept on this
// device only, and sent to the Sunkiss server with each Figma request, never stored there.
function FigmaToken() {
  const token = useFigmaToken();
  const [draft, setDraft] = useState(token);
  const changed = draft.trim() !== token;
  return (
    <>
      <label className="setting">
        <span className="setting-label">Personal access token</span>
        <span className="setting-row">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            placeholder="figd_…"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="primary" disabled={!changed} onClick={() => setFigmaToken(draft)}>
            {token && !draft.trim() ? "Forget" : "Save"}
          </button>
        </span>
      </label>
      <p className="settings-note">
        {token ? "Set. " : ""}Make one in Figma under Settings › Security › Personal access tokens; read access to files is enough. It
        stays on this device and lets the Upload screen snapshot frames from Figma.
      </p>
    </>
  );
}

// One kind of file's app: its default, or any app on this Mac that can open that kind.
function OpenWith({ kind, label }: { kind: Kind; label: string }) {
  const chosen = useChosenApp(kind);
  const [apps, setApps] = useState<App[]>([]);

  useEffect(() => {
    if (IN_DESKTOP_APP) appsForKind(kind).then(setApps, () => setApps([]));
  }, [kind]);

  const defaultApp = apps.find((app) => app.default);
  // A chosen app that's since been uninstalled still shows, so it's clear what's set.
  const choices = chosen && !apps.some((app) => app.path === chosen.path) ? [...apps, chosen] : apps;

  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      <select
        value={chosen?.path ?? ""}
        disabled={!IN_DESKTOP_APP}
        onChange={(e) => chooseApp(kind, choices.find((app) => app.path === e.currentTarget.value) ?? null)}
      >
        <option value="">{defaultApp ? `Default app (${defaultApp.name})` : "Default app"}</option>
        {choices
          .filter((app) => !app.default)
          .map((app) => (
            <option key={app.path} value={app.path}>
              {app.name}
            </option>
          ))}
      </select>
    </label>
  );
}
