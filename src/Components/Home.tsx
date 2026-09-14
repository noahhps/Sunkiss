import { useState, type CSSProperties } from "react";
import { fileUrl, type FileEntry } from "../api";
import { useFiles } from "../hooks/useFiles";
import { useStream } from "../hooks/useStream";

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

// Home: a thumbnail of every image in the server's folder (sent at most 400×400).
// Clicking one streams an 800px preview.
export default function Home() {
  const { files, error, loading } = useFiles();
  const [name, setName] = useState(""); // what's typed in the box
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [missing, setMissing] = useState(false); // no image has the searched name

  const images = files.filter((file) => file.type.startsWith("image/"));
  const preview = useStream(selected ? fileUrl(selected, 800) : null);

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const match = images.find((file) => file.name.toLowerCase() === name.trim().toLowerCase());
          setMissing(!match);
          if (match) setSelected(match);
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Search, Ask, Task"
        />
        <button type="submit">submitk</button>
      </form>
      {missing && <p>No image named “{name.trim()}”</p>}

      {selected && (
        <section style={styles.preview}>
          {preview.status === "loading" && (
            <p>
              Streaming {selected.name}… {kb(preview.received)}
            </p>
          )}
          {preview.status === "done" && <img src={preview.src} alt={selected.name} style={styles.previewImage} />}
          {preview.status === "error" && <p>{preview.message}</p>}
        </section>
      )}

      {loading && <p>Loading files…</p>}
      {error && <p>{error}</p>}
      <div style={styles.grid}>
        {images.map((file) => (
          <button
            key={file.name}
            type="button"
            title={file.name}
            onClick={() => {
              setSelected(file);
              setMissing(false);
            }}
            style={{ ...styles.tile, ...(file.name === selected?.name ? styles.selectedTile : {}) }}
          >
            <img src={fileUrl(file, 400, 400)} alt={file.name} loading="lazy" style={styles.thumbnail} />
          </button>
        ))}
      </div>
    </main>
  );
}

const styles = {
  preview: { display: "flex", justifyContent: "center", padding: "0 16px" },
  previewImage: { maxWidth: "min(100%, 800px)", borderRadius: 8 },
  grid: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, padding: 16 },
  // 200px tiles showing 400px images, so thumbnails stay sharp on Retina screens.
  tile: {
    width: 200,
    height: 200,
    padding: 4,
    display: "grid",
    placeItems: "center",
    background: "transparent",
    boxShadow: "none",
    border: "2px solid transparent",
    borderRadius: 10,
  },
  selectedTile: { borderColor: "#396cd8" },
  thumbnail: { maxWidth: "100%", maxHeight: "100%", borderRadius: 6 },
} satisfies Record<string, CSSProperties>;
