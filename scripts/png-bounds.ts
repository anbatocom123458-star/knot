// Dev-only helper: prints the alpha bounding box of PNG files (used to align
// hitboxes with the real sprite pixels). Not part of the runtime bundle.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

interface Bounds {
  file: string;
  w: number;
  h: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bbox(file: string): Bounds {
  const b = readFileSync(file);
  let off = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  let bd = 0;
  let interlaced = 0;
  const idat: Buffer[] = [];
  let plate: Buffer | null = null;
  let trns: Buffer | null = null;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString("ascii", off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bd = data[8];
      ct = data[9];
      interlaced = data[12];
    }
    if (type === "IDAT") idat.push(data);
    if (type === "PLATE" || type === "PLTE") plate = data;
    if (type === "tRNS") trns = data;
    if (type === "IEND") break;
  }
  if (bd !== 8) throw new Error(`bitdepth ${bd}`);
  if (interlaced) throw new Error("interlaced");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct as 0 | 2 | 3 | 4 | 6];
  if (channels === undefined) throw new Error(`color type ${ct}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  let prev = Buffer.alloc(stride);
  let pos = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const bb = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + bb) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + bb) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + bb - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - bb);
        const pc = Math.abs(p - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      let visible = false;
      if (ct === 6) visible = line[x * 4 + 3] > 0;
      else if (ct === 4) visible = line[x * 2 + 1] > 0;
      else if (ct === 3) {
        const index = line[x];
        const alpha = trns && index < trns.length ? trns[index] : 255;
        visible = alpha > 0;
      } else if (ct === 2 || ct === 0) visible = true;
      if (visible) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    prev = line;
  }
  return { file: file.split("/").pop() ?? file, w, h, minX, minY, maxX, maxY };
}

const base = "assets/source/kenney/new-platformer-pack/Sprites/";
const files = [
  "Enemies/Default/slime_normal_walk_a.png",
  "Enemies/Default/slime_normal_walk_b.png",
  "Enemies/Default/slime_normal_flat.png",
  "Tiles/Default/coin_gold.png",
  "Tiles/Default/gem_yellow.png",
  "Tiles/Default/bomb.png",
  "Tiles/Default/bomb_active.png",
  "Characters/Default/character_beige_idle.png"
];
for (const f of files) {
  try {
    console.log(JSON.stringify(bbox(base + f)));
  } catch (error) {
    console.log(f, "ERR", (error as Error).message);
  }
}
