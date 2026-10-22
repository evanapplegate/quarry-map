// Laser-engraved logo for the backer: the SVG is rasterised to a mask, which
// darkens and roughens the board inside the strokes and drives a normal map for
// the cut walls. Applied as a decal that shares the backer's UVs.
import * as THREE from 'three';

async function loadSvg(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export async function buildEngraving(url, aspect) {
  const img = await loadSvg(url);
  const W = 2048, H = Math.round(W / aspect);

  const mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  const m = mask.getContext('2d', { willReadFrequently: true });
  m.drawImage(img, 0, 0, W, H);
  const core = m.getImageData(0, 0, W, H).data; // logo is black on transparent: alpha is the mask

  // blurred copy gives the sloped walls of the cut and the dilated decal alpha
  const soft = document.createElement('canvas');
  soft.width = W; soft.height = H;
  const sc = soft.getContext('2d', { willReadFrequently: true });
  sc.filter = 'blur(5px)';
  sc.drawImage(img, 0, 0, W, H);
  const blur = sc.getImageData(0, 0, W, H).data;

  // R: burnt floor of the cut, G: decal alpha (slightly wider than the cut)
  const rg = new ImageData(W, H);
  const height = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const a = core[i * 4 + 3] / 255;
    const b = blur[i * 4 + 3] / 255;
    rg.data[i * 4] = a * 255;
    rg.data[i * 4 + 1] = Math.min(1, b * 5) * 255;
    rg.data[i * 4 + 2] = 0;
    rg.data[i * 4 + 3] = 255;
    height[i] = -b;
  }
  const rgCanvas = document.createElement('canvas');
  rgCanvas.width = W; rgCanvas.height = H;
  rgCanvas.getContext('2d').putImageData(rg, 0, 0);

  const nrm = new ImageData(W, H);
  const k = 16.0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = (height[y * W + Math.min(W - 1, x + 1)] - height[y * W + Math.max(0, x - 1)]) * 0.5;
      const dy = (height[Math.min(H - 1, y + 1) * W + x] - height[Math.max(0, y - 1) * W + x]) * 0.5;
      // canvas y runs down, texture v runs up: n = (-dh/du, -dh/dv, 1) with dv = -dy
      let nx = -dx * k, ny = dy * k, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nrm.data[i * 4] = (nx / l * 0.5 + 0.5) * 255;
      nrm.data[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
      nrm.data[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255;
      nrm.data[i * 4 + 3] = 255;
    }
  }
  const nCanvas = document.createElement('canvas');
  nCanvas.width = W; nCanvas.height = H;
  nCanvas.getContext('2d').putImageData(nrm, 0, 0);

  const rgTex = new THREE.CanvasTexture(rgCanvas);
  const nTex = new THREE.CanvasTexture(nCanvas);
  for (const t of [rgTex, nTex]) {
    t.channel = 1; // decal-local UVs; channel 0 carries the board UVs
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
  }
  return { rgTex, nTex, aspect };
}

// Decal material: board maps on uv, engraving maps on uv1.
export function engravingMaterial(boardMaterial, eng) {
  const mat = boardMaterial.clone();
  mat.alphaMap = eng.rgTex;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.normalMap = eng.nTex;
  mat.normalScale = new THREE.Vector2(1, 1);
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        float engraved = texture2D( alphaMap, vAlphaMapUv ).r;
        diffuseColor.rgb *= mix( 1.0, 0.16, engraved );`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.95, engraved );`
      );
  };
  mat.customProgramCacheKey = () => 'engraving';
  return mat;
}
