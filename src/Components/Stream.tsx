import { useState } from "react";
import { useStream } from "../hooks/useStream";

const SERVER = "http://localhost:8787";

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

// Streaming test: fetch a file chunk by chunk, show progress, then show the image.
export default function Stream() {
  const [name, setName] = useState(""); // what's typed in the box
  const [search, setSearch] = useState(""); // the name last submitted
  const [fullSize, setFullSize] = useState(false); // the whole file, or a resized preview

  const url = search ? `${SERVER}/files/${encodeURIComponent(search)}${fullSize ? "" : "?w=800"}` : null;
  const stream = useStream(url);

  return (
    <main className="container">
      <h1>Streaming Test V1.0</h1>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(name.trim());
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Search, Ask, Task"
        />
        <button type="submit">submitk</button>
      </form>
      <label>
        <input
          type="checkbox"
          checked={fullSize}
          onChange={(e) => setFullSize(e.currentTarget.checked)}
          style={{ boxShadow: "none" }}
        />{" "}
        Full size (otherwise an 800px preview)
      </label>

      {stream.status === "loading" && (
        <p>
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
          <p>
            <img src={stream.src} alt={search} style={{ maxWidth: "100%" }} />
          </p>
        ) : (
          <p>
            Downloaded {kb(stream.received)} ({stream.type}); there's no preview for this type.
          </p>
        ))}
      {stream.status === "error" && <p>{stream.notFound ? `No file named “${search}”` : stream.message}</p>}
    </main>
  );
}
