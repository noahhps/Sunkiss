import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeCanvas, readPsd, type Layer as PsdLayer } from 'ag-psd';
import { unzipSync } from 'fflate';
import sharp from 'sharp';

// ag-psd draws on a canvas unless told how to make plain pixel buffers instead; there's no
// canvas here, and sharp takes the pixels as they are.
initializeCanvas(
  () => {
    throw new Error('no canvas on the server');
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
);

// Layered design files: what's inside them, as far as the server can read without the app
// that made them. Each kind carries a flattened picture of itself somewhere (Photoshop's
// composite, Sketch's preview, Illustrator's XMP thumbnail), which becomes the preview; and
// most say what their layers are called, which the app lists and compares across versions.

/** The kinds of design file the server can look inside, by extension. */
export const DESIGN_EXTENSIONS = new Set(['.psd', '.psb', '.ai', '.sketch', '.fig', '.xd', '.indd']);

/** One layer of a design file, as the app lists it. */
export type Layer = {
  name: string;
  kind: 'page' | 'artboard' | 'group' | 'layer' | 'text' | 'image' | 'smart' | 'shape';
  visible: boolean;
  opacity?: number; // 0 to 1, where the file says
  bounds?: [number, number, number, number]; // x, y, width, height, where the file says
  children?: Layer[];
};

/** What's inside a design file: its size (in `units`), its format, its layers, and how many. */
export type DesignInfo = {
  width?: number;
  height?: number;
  units?: 'px' | 'pt';
  format: string;
  hasAlpha?: boolean;
  layers?: Layer[];
  layerCount?: number;
};

const extensionOf = (name: string) => path.extname(name).toLowerCase();

// Reading a big PSD takes a moment, so a file's flattened picture is kept once it's been made,
// by its version (the ETag), up to CACHE_LIMIT bytes in all; the oldest go first.
const CACHE_LIMIT = 64 * 1024 * 1024;
const flattened = new Map<string, Buffer>();
let cached = 0;

/** A flattened picture of a design file (PNG or JPEG bytes), or null when it doesn't carry one. */
export async function previewOf(filePath: string, name: string, etag: string): Promise<Buffer | null> {
  const kept = flattened.get(etag);
  if (kept) return kept;
  const buffer = await readFile(filePath);
  let picture: Buffer | null = null;
  switch (extensionOf(name)) {
    case '.psd':
    case '.psb':
      picture = await psdPreview(buffer);
      break;
    case '.sketch':
      picture = zipEntry(buffer, ['previews/preview.png']);
      break;
    case '.fig':
      picture = zipEntry(buffer, ['thumbnail.png']);
      break;
    case '.xd':
      picture = zipEntry(buffer, ['thumbnail.png', 'preview.png']);
      break;
    case '.ai':
    case '.indd':
      picture = xmpThumbnail(buffer);
      break;
  }
  if (picture) {
    flattened.set(etag, picture);
    cached += picture.length;
    for (const [key, old] of flattened) {
      if (cached <= CACHE_LIMIT) break;
      flattened.delete(key);
      cached -= old.length;
    }
  }
  return picture;
}

/** What's inside a design file, or null for a kind the server can't read. */
export async function infoOf(filePath: string, name: string): Promise<DesignInfo | null> {
  const buffer = await readFile(filePath);
  switch (extensionOf(name)) {
    case '.psd':
    case '.psb':
      return psdInfo(buffer);
    case '.sketch':
      return sketchInfo(buffer);
    case '.xd':
      return xdInfo(buffer);
    case '.ai':
      return aiInfo(buffer);
    case '.fig':
      return { format: 'fig' };
    case '.indd':
      return { format: 'indd' };
    default:
      return null;
  }
}

// How many layers a tree holds, groups and pages included.
const count = (layers: Layer[]): number => layers.reduce((n, layer) => n + 1 + count(layer.children ?? []), 0);

const round = (n: number) => Math.round(n * 100) / 100;

/* Photoshop ------------------------------------------------------------------------------ */

// The composite Photoshop keeps when "Maximize compatibility" is on; otherwise the small
// thumbnail it always keeps. Either way, PNG bytes, by way of sharp.
async function psdPreview(buffer: Buffer): Promise<Buffer | null> {
  try {
    const psd = readPsd(buffer, { skipLayerImageData: true, skipThumbnail: true, useImageData: true });
    const image = psd.imageData;
    if (image && image.width > 0 && image.height > 0) {
      const raw = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
      return await sharp(raw, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer();
    }
  } catch {
    // fall through to the thumbnail
  }
  try {
    const psd = readPsd(buffer, { skipLayerImageData: true, skipCompositeImageData: true, useRawThumbnail: true });
    const thumbnail = psd.imageResources?.thumbnailRaw;
    return thumbnail?.data ? Buffer.from(thumbnail.data) : null;
  } catch {
    return null;
  }
}

function psdInfo(buffer: Buffer): DesignInfo | null {
  try {
    const psd = readPsd(buffer, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const layers = psdLayers(psd.children);
    return { width: psd.width, height: psd.height, units: 'px', format: 'psd', hasAlpha: (psd.channels ?? 3) > 3, layers, layerCount: count(layers) };
  } catch {
    return null;
  }
}

// Photoshop stores layers bottom first; the panel shows the top one first, so they're turned round.
function psdLayers(children: PsdLayer[] | undefined): Layer[] {
  return (children ?? [])
    .map((layer): Layer => {
      const left = layer.left ?? 0;
      const top = layer.top ?? 0;
      return {
        name: layer.name ?? '',
        kind: layer.children ? 'group' : layer.text ? 'text' : layer.placedLayer ? 'smart' : 'layer',
        visible: !layer.hidden,
        opacity: layer.opacity,
        bounds: [left, top, (layer.right ?? left) - left, (layer.bottom ?? top) - top],
        ...(layer.children ? { children: psdLayers(layer.children) } : {}),
      };
    })
    .reverse();
}

/* Zip-based files: Sketch, Adobe XD, Figma's .fig ----------------------------------------- */

// The first of `names` found in the zip, as bytes.
function zipEntry(buffer: Buffer, names: string[]): Buffer | null {
  try {
    const entries = unzipSync(buffer, { filter: (entry) => names.includes(entry.name) });
    for (const name of names) if (entries[name]) return Buffer.from(entries[name]);
  } catch {
    // not a zip after all
  }
  return null;
}

// A JSON file out of the zip, or null.
function zipJson(entries: Record<string, Uint8Array>, name: string): any {
  const bytes = entries[name];
  if (!bytes) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return null;
  }
}

const SKETCH_KINDS: Record<string, Layer['kind']> = {
  artboard: 'artboard',
  group: 'group',
  text: 'text',
  bitmap: 'image',
  symbolInstance: 'smart',
  symbolMaster: 'smart',
};

function sketchInfo(buffer: Buffer): DesignInfo | null {
  try {
    const entries = unzipSync(buffer, { filter: (entry) => entry.name === 'document.json' || entry.name.startsWith('pages/') });
    const document = zipJson(entries, 'document.json');
    if (!document) return null;
    const pages: Layer[] = (document.pages ?? [])
      .map((ref: { _ref?: string }) => zipJson(entries, `${ref._ref}.json`))
      .filter((page: any) => page)
      .map((page: any): Layer => ({ name: page.name ?? 'Page', kind: 'page', visible: true, children: sketchLayers(page.layers) }));
    return { format: 'sketch', layers: pages, layerCount: count(pages) };
  } catch {
    return null;
  }
}

// Sketch stores layers bottom first too.
function sketchLayers(layers: any[] | undefined): Layer[] {
  return (layers ?? [])
    .map((layer): Layer => ({
      name: layer.name ?? '',
      kind: SKETCH_KINDS[layer._class] ?? 'shape',
      visible: layer.isVisible !== false,
      bounds: layer.frame ? [round(layer.frame.x), round(layer.frame.y), round(layer.frame.width), round(layer.frame.height)] : undefined,
      ...(layer.layers?.length ? { children: sketchLayers(layer.layers) } : {}),
    }))
    .reverse();
}

// XD's manifest lists the artboards; what's on them is spread over many files, so only the
// artboards are listed.
function xdInfo(buffer: Buffer): DesignInfo | null {
  try {
    const entries = unzipSync(buffer, { filter: (entry) => entry.name === 'manifest.json' });
    const manifest = zipJson(entries, 'manifest.json');
    const artwork = (manifest?.children ?? []).find((child: any) => child.path === 'artwork');
    const artboards: Layer[] = (artwork?.children ?? [])
      .filter((child: any) => child.path !== 'pasteboard')
      .map((child: any): Layer => {
        const bounds = child['uxdesign#bounds'];
        return {
          name: child.name ?? 'Artboard',
          kind: 'artboard',
          visible: true,
          bounds: bounds ? [round(bounds.x ?? 0), round(bounds.y ?? 0), round(bounds.width ?? 0), round(bounds.height ?? 0)] : undefined,
        };
      });
    return { format: 'xd', layers: artboards, layerCount: artboards.length };
  } catch {
    return null;
  }
}

/* Illustrator and InDesign ---------------------------------------------------------------- */

// Adobe's apps keep a small JPEG of the file in its XMP metadata (xmpGImg:image, base64 with
// the line breaks written as &#xA;). It's only a few hundred pixels across, but it's a picture.
function xmpThumbnail(buffer: Buffer): Buffer | null {
  const text = buffer.toString('latin1');
  const match = text.match(/<(?:xmpGImg|xapGImg):image>([\s\S]*?)<\/(?:xmpGImg|xapGImg):image>/);
  if (!match) return null;
  const base64 = match[1].replace(/&#xA;|\s/g, '');
  const bytes = Buffer.from(base64, 'base64');
  return bytes.length > 0 ? bytes : null;
}

// An Illustrator file is a PDF with the artwork alongside: the page size is the PDF's MediaBox
// (in points), and the layers are the PDF's optional content groups, each named.
function aiInfo(buffer: Buffer): DesignInfo {
  const text = buffer.toString('latin1');
  const info: DesignInfo = { format: 'ai' };
  const box = text.match(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/) ?? text.match(/%%(?:HiRes)?BoundingBox:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
  if (box) {
    info.width = round(Math.abs(Number(box[3]) - Number(box[1])));
    info.height = round(Math.abs(Number(box[4]) - Number(box[2])));
    info.units = 'pt';
  }
  const names = new Set<string>();
  for (const match of text.matchAll(/\/Type\s*\/OCG\b[^>]*?\/Name\s*\(((?:\\.|[^\\)])*)\)|\/Name\s*\(((?:\\.|[^\\)])*)\)[^>]*?\/Type\s*\/OCG\b/g)) {
    const name = (match[1] ?? match[2] ?? '').replace(/\\([()\\])/g, '$1');
    if (name) names.add(name);
  }
  if (names.size > 0) {
    info.layers = [...names].map((name): Layer => ({ name, kind: 'layer', visible: true }));
    info.layerCount = names.size;
  }
  return info;
}
