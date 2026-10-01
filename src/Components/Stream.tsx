import { useState } from "react";
import { FILES } from "../api";
import { useStream } from "../hooks/useStream";
import SearchBox from "./SearchBox";

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

// Streaming test: fetch a file chunk by chunk, show progress, then show the image.
export default function Stream() {
  const [search, setSearch] = useState(""); // the name last submitted
  const [fullSize, setFullSize] = useState(false); // the whole file, or a resized preview

  const url = search ? `${FILES}/${encodeURIComponent(search)}${fullSize ? "" : "?w=800"}` : null;
  const stream = useStream(url);

  return (
    <main className="container">
      <h1>Streaming Test V1.0</h1>

      <SearchBox onSearch={setSearch} />
      <label className="option">
        <input type="checkbox" checked={fullSize} onChange={(e) => setFullSize(e.currentTarget.checked)} /> Full size
        (otherwise an 800px preview)
      </label>

      <section className="preview">
        {stream.status === "loading" && (
          <p className="waiting">
            Streaming… {kb(stream.received)}
            {stream.total && (
              <>
                {" "}of {kb(stream.total)} <progress value={stream.received} max={stream.total} />
              </>
            )}
          </p>
        )}
        {stream.status === "done" &&
          (stream.type.startsWith("image/") ? (
            <img className="fade-in" src={stream.src} alt={search} />
          ) : (
            <p className="note">
              Downloaded {kb(stream.received)} ({stream.type}); there's no preview for this type.
            </p>
          ))}
        {stream.status === "error" && (
          <p className="error">{stream.notFound ? `No file named “${search}”` : stream.message}</p>
        )}
      </section>
    </main>
  );
}
