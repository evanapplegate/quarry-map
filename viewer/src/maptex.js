// Loads the map PNG at full native resolution. If it is larger than the GPU's
// max texture size it is split into tiles rather than downscaled.
import * as THREE from 'three';

async function pngSize(blob) {
  const b = new DataView(await blob.slice(0, 24).arrayBuffer());
  if (b.getUint32(0) !== 0x89504e47) return null;
  return { width: b.getUint32(16), height: b.getUint32(20) };
}

export async function fetchMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const blob = await res.blob();
  let size = await pngSize(blob);
  if (!size) {
    const probe = await createImageBitmap(blob);
    size = { width: probe.width, height: probe.height };
    probe.close();
  }
  return { blob, ...size };
}

// Returns [{ texture, x0, y0, x1, y1 }] with tile extents as fractions of the
// image (y from the top). tileLimit can force tiling for testing (?tile=4096).
export async function buildMapTiles(src, renderer, tileLimit) {
  const max = renderer.capabilities.maxTextureSize;
  const limit = Math.min(max, tileLimit || max);
  const cols = Math.ceil(src.width / limit);
  const rows = Math.ceil(src.height / limit);
  const opts = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  const full = cols * rows > 1 ? await createImageBitmap(src.blob) : null;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = Math.round((c * src.width) / cols), ex = Math.round(((c + 1) * src.width) / cols);
      const sy = Math.round((r * src.height) / rows), ey = Math.round(((r + 1) * src.height) / rows);
      const bmp = full
        ? await createImageBitmap(full, sx, sy, ex - sx, ey - sy, opts)
        : await createImageBitmap(src.blob, opts);
      const tex = new THREE.Texture(bmp);
      tex.flipY = false; // flipped at decode; WebGL ignores UNPACK_FLIP_Y for ImageBitmap
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = aniso;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      renderer.initTexture(tex); // upload now, not on the first frame
      bmp.close(); // the GPU copy is all we need; frees ~280 MB of decoded pixels
      tiles.push({
        texture: tex,
        x0: sx / src.width, x1: ex / src.width,
        y0: sy / src.height, y1: ey / src.height,
        px: [ex - sx, ey - sy],
      });
    }
  }
  if (full) full.close();
  return { tiles, cols, rows, max };
}
