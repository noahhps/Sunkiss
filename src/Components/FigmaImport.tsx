import { useState, type FormEvent } from "react";
import type { FileEntry } from "../api";
import { formatWhen } from "../format";
import { inspectFigma, looksLikeFigma, snapshotFigma, useFigmaToken, type FigmaFile } from "../figma";

const MOST = 20; // frames picked at once, at most: each is a render Figma has to make

type State =
  | { status: "idle" }
  | { status: "looking" }
  | { status: "found"; file: FigmaFile; picked: Set<string> }
  | { status: "snapshotting"; file: FigmaFile; count: number }
  | { status: "done"; saved: FileEntry[]; failed: { node: string; reason: string }[] }
  | { status: "failed"; message: string };

// Bringing a Figma file into Sunkiss: paste a link to a file (or to a frame in one), see its
// pages and frames, pick what to keep, and each picked frame is rendered by Figma and saved
// here as a PNG. Done again later, the same frames become new versions, so a Figma file's
// history builds up here alongside everything else. Needs a Figma token (Settings).
export default function FigmaImport({ onSaved }: { onSaved: (files: FileEntry[]) => void }) {
  const token = useFigmaToken();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function look(event: FormEvent) {
    event.preventDefault();
    const link = url.trim();
    if (!looksLikeFigma(link)) return setState({ status: "failed", message: "That doesn't look like a link to a Figma file." });
    setState({ status: "looking" });
    try {
      const file = await inspectFigma(link);
      // The frame the link pointed at; otherwise every frame on the first page, up to MOST.
      const linked = file.nodeId ? file.pages.flatMap((page) => page.frames).find((frame) => frame.id === file.nodeId) : undefined;
      const picked = new Set(linked ? [linked.id] : (file.pages[0]?.frames ?? []).slice(0, MOST).map((frame) => frame.id));
      setState({ status: "found", file, picked });
    } catch (err) {
      setState({ status: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function snapshot() {
    if (state.status !== "found") return;
    const nodes = state.file.pages.flatMap((page) => page.frames).filter((frame) => state.picked.has(frame.id));
    setState({ status: "snapshotting", file: state.file, count: nodes.length });
    try {
      const answer = await snapshotFigma(url.trim(), nodes.map(({ id, name }) => ({ id, name })));
      setState({ status: "done", ...answer });
      if (answer.saved.length) onSaved(answer.saved);
    } catch (err) {
      setState({ status: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const pick = (id: string, on: boolean) =>
    setState((at) => {
      if (at.status !== "found") return at;
      const picked = new Set(at.picked);
      if (on && picked.size < MOST) picked.add(id);
      if (!on) picked.delete(id);
      return { ...at, picked };
    });

  return (
    <section className="figma-import" aria-label="From Figma">
      <h2 className="section-title">From Figma</h2>
      <form className="figma-link" onSubmit={look}>
        <input
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder="Paste a link to a Figma file, or to a frame in one"
          aria-label="Figma link"
          spellCheck={false}
        />
        <button type="submit" className="primary" disabled={!url.trim() || !token || state.status === "looking" || state.status === "snapshotting"}>
          {state.status === "looking" ? "Looking…" : "Look"}
        </button>
      </form>
      {!token && <p className="note">Add a Figma personal access token in Settings first. Sunkiss uses it to ask Figma for the file.</p>}
      {state.status === "failed" && <p className="error">{state.message}</p>}

      {(state.status === "found" || state.status === "snapshotting") && (
        <div className="figma-file fade-in">
          <p className="figma-name">
            <strong>{state.file.name}</strong>
            <span className="note"> · changed {formatWhen(state.file.lastModified)}</span>
          </p>
          {state.file.pages.every((page) => page.frames.length === 0) ? (
            <p className="note">No frames on its pages to snapshot.</p>
          ) : (
            state.file.pages.map((page) =>
              page.frames.length === 0 ? null : (
                <div key={page.id} className="figma-page">
                  <h3>{page.name}</h3>
                  <ul className="frame-list">
                    {page.frames.map((frame) => (
                      <li key={frame.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={state.status === "found" && state.picked.has(frame.id)}
                            disabled={state.status !== "found"}
                            onChange={(e) => pick(frame.id, e.currentTarget.checked)}
                          />
                          {frame.name}
                          <span className="frame-type">{frame.type.toLowerCase().replace("_", " ")}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )
          )}
          <div className="upload-footer">
            <span className="note">
              {state.status === "snapshotting"
                ? `Figma is rendering ${state.count} ${state.count === 1 ? "frame" : "frames"}…`
                : `${state.picked.size} of ${Math.min(MOST, state.file.pages.reduce((n, page) => n + page.frames.length, 0))} picked`}
            </span>
            <button type="button" className="primary kiss" disabled={state.status !== "found" || state.picked.size === 0} onClick={() => void snapshot()}>
              Snapshot into Sunkiss
            </button>
          </div>
        </div>
      )}

      {state.status === "done" && (
        <div className="figma-done fade-in">
          {state.saved.length > 0 && (
            <p className="note">
              Saved {state.saved.map((file) => file.name).join(", ")}. Snapshot the same frames again later and they become new versions.
            </p>
          )}
          {state.failed.map((failure) => (
            <p key={failure.node} className="error">
              {failure.node}: {failure.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
