import { useState } from "react";
import type { FileEntry, Layer, Version } from "../api";
import { useFileInfo } from "../hooks/useFileInfo";
import Icon from "./Icon";

// A layer's path: where it sits in the tree, "Ground/Grass". Siblings with the same name are
// numbered, so two "Layer 1"s stay apart.
function flatten(layers: Layer[], prefix = "", into = new Map<string, Layer>()) {
  const seen = new Map<string, number>();
  for (const layer of layers) {
    const nth = (seen.get(layer.name) ?? 0) + 1;
    seen.set(layer.name, nth);
    const path = `${prefix}${layer.name}${nth > 1 ? ` (${nth})` : ""}`;
    into.set(path, layer);
    if (layer.children) flatten(layer.children, `${path}/`, into);
  }
  return into;
}

type Change = "changed" | "removed" | "added";

// What differs between the layers of an earlier version and the current one, by path: a layer
// that's gone since, one that's changed (shown or hidden, faded, moved or resized), and the
// ones that are new since.
function compare(earlier: Layer[], current: Layer[]) {
  const before = flatten(earlier);
  const after = flatten(current);
  const changes = new Map<string, Change>();
  for (const [path, was] of before) {
    const now = after.get(path);
    if (!now) changes.set(path, "removed");
    else if (was.visible !== now.visible || (was.opacity ?? 1) !== (now.opacity ?? 1) || String(was.bounds) !== String(now.bounds)) changes.set(path, "changed");
  }
  const added = [...after.keys()].filter((path) => !before.has(path));
  return { changes, added };
}

const countAll = (layers: Layer[]): number => layers.reduce((n, layer) => n + 1 + countAll(layer.children ?? []), 0);

// The layers inside a design file (Photoshop, Sketch, XD, Illustrator), as the server read them,
// under the stage. With an earlier version on the stage, its layers are marked by what's
// happened to them since: changed, or removed, with the layers added since listed at the end.
// That's the diff for a layered file: not pixels, but what the designer did.
export default function Layers({ file, version }: { file: FileEntry; version?: Version }) {
  const shown = useFileInfo(file, version?.id);
  const current = useFileInfo(file);
  const [folded, setFolded] = useState<Set<string>>(new Set()); // groups folded shut

  const layers = shown?.layers;
  if (!layers?.length) return null;
  const earlier = version && !version.current && current?.layers ? compare(layers, current.layers) : null;

  const toggle = (path: string) =>
    setFolded((set) => {
      const next = new Set(set);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const rows = (list: Layer[], prefix = "", depth = 0): React.ReactNode => {
    const seen = new Map<string, number>();
    return list.map((layer) => {
      const nth = (seen.get(layer.name) ?? 0) + 1;
      seen.set(layer.name, nth);
      const path = `${prefix}${layer.name}${nth > 1 ? ` (${nth})` : ""}`;
      const holds = Boolean(layer.children?.length);
      const shut = folded.has(path);
      const change = earlier?.changes.get(path);
      return (
        <li key={path}>
          <div className="layer" style={{ "--depth": depth } as React.CSSProperties} data-hidden={layer.visible ? undefined : ""} data-change={change}>
            {holds ? (
              <button type="button" className="layer-fold" aria-expanded={!shut} aria-label={shut ? `Open ${layer.name}` : `Close ${layer.name}`} onClick={() => toggle(path)}>
                <Icon name="chevron" />
              </button>
            ) : (
              <span className="layer-fold" aria-hidden="true" />
            )}
            <span className="layer-name" title={path}>
              {layer.name || "Untitled"}
            </span>
            {layer.kind !== "layer" && layer.kind !== "shape" && <span className="layer-kind">{layer.kind}</span>}
            {!layer.visible && <span className="layer-kind">hidden</span>}
            {layer.opacity !== undefined && layer.opacity < 1 && <span className="layer-kind">{Math.round(layer.opacity * 100)}%</span>}
            {layer.bounds && layer.bounds[2] > 0 && (
              <span className="layer-size">
                {Math.round(layer.bounds[2])} × {Math.round(layer.bounds[3])}
              </span>
            )}
            {change && <span className="layer-change">{change}</span>}
          </div>
          {holds && !shut && <ul>{rows(layer.children!, `${path}/`, depth + 1)}</ul>}
        </li>
      );
    });
  };

  const total = shown?.layerCount ?? countAll(layers);
  return (
    <section className="layers" aria-label="Layers">
      <header className="layers-head">
        <h2>Layers</h2>
        <span>
          {total} {total === 1 ? "layer" : "layers"}
          {earlier && ` · since this version: ${[...earlier.changes.values()].filter((c) => c === "changed").length} changed, ${[...earlier.changes.values()].filter((c) => c === "removed").length} removed, ${earlier.added.length} added`}
        </span>
      </header>
      <ul className="layer-tree">{rows(layers)}</ul>
      {earlier && earlier.added.length > 0 && (
        <p className="layers-added">
          Added since: {earlier.added.map((path) => path.split("/").pop()).join(", ")}
        </p>
      )}
    </section>
  );
}
