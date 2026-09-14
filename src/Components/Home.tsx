import { useState } from "react";
import { fileUrl, type FileEntry } from "../api";
import { useFiles } from "../hooks/useFiles";
import { useStream } from "../hooks/useStream";
import SearchBox from "./SearchBox";

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

// Home: a thumbnail of every image in the server's folder (shown within 200×200).
// Clicking one streams an 800px preview.
export default function Home() {
  const { files, error, loading } = useFiles();
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [missing, setMissing] = useState<string | null>(null); // a searched name with no image

  const images = files.filter((file) => file.type.startsWith("image/"));
  const preview = useStream(selected ? fileUrl(selected, 800) : null);

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <SearchBox
        onSearch={(query) => {
          const match = images.find((file) => file.name.toLowerCase() === query.toLowerCase());
          setMissing(match ? null : query);
          if (match) setSelected(match);
        }}
      />
      {missing && <p className="note">No image named “{missing}”</p>}

      {selected && (
        <section className="preview">
          {preview.status === "loading" && (
            <p className="waiting">
              Streaming {selected.name}… {kb(preview.received)}
            </p>
          )}
          {preview.status === "done" && <img className="fade-in" src={preview.src} alt={selected.name} />}
          {preview.status === "error" && <p className="error">{preview.message}</p>}
        </section>
      )}

      {loading && <p className="waiting">Loading files…</p>}
      {error && <p className="error">{error}</p>}
      <div className="prints">
        {images.map((file) => (
          <button
            key={file.name}
            type="button"
            className="print"
            title={file.name}
            aria-pressed={file.name === selected?.name}
            onClick={() => {
              setSelected(file);
              setMissing(null);
            }}
          >
            {/* 400px copies in a 200px box, so they stay sharp on Retina screens. */}
            <img src={fileUrl(file, 400, 400)} alt={file.name} loading="lazy" />
            <span className="caption">{file.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
