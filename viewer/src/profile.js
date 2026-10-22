// Profile extrusion helpers. A profile is a list of smooth polylines in (w, z):
// w runs outward from the inner edge, z is height off the back. Hard edges sit
// between polylines, so each polyline gets its own vertices and normals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TEX_M = 0.42; // metres of wood covered by one walnut texture tile

export function arc(cx, cz, r, a0, a1, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return pts;
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function arcLengths(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) {
    out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return out;
}

// Builds one mitred frame member lying along x with its outward side facing -y.
// The inner edge sits at y = -hPerp; at offset w the member runs s in +-(hAlong + w),
// which gives the 45 degree mitre. Polylines with zAt(w, s) are subdivided along
// their length (rowsPerM rows per metre) so carved detail can vary with s.
export function buildMember(polylines, hAlong, hPerp, { rowsPerM = 0, uOffset = 0, vOffset = 0 } = {}) {
  const geos = [];
  let v0 = 0;
  for (const pl of polylines) {
    const pts = pl.pts;
    const n = pts.length;
    const arcs = arcLengths(pts);
    const rows = pl.zAt && rowsPerM ? Math.ceil(2 * (hAlong + 0.12) * rowsPerM) : 1;
    const pos = new Float32Array((rows + 1) * n * 3);
    const uv = new Float32Array((rows + 1) * n * 2);
    let p = 0, q = 0;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i < n; i++) {
        const [w, z0] = pts[i];
        const half = hAlong + w;
        const s = -half + (2 * half * j) / rows;
        pos[p++] = s;
        pos[p++] = -(hPerp + w);
        pos[p++] = pl.zAt ? pl.zAt(w, s) : z0;
        uv[q++] = s / TEX_M + uOffset;
        uv[q++] = (v0 + arcs[i]) / TEX_M + vOffset;
      }
    }
    const idx = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
    v0 += arcs[n - 1];
  }
  return mergeGeometries(geos);
}

// Four mitred members around a sight opening of sightW x sightH, centred on the origin.
export function buildMitredFrame(polylines, sightW, sightH, opts = {}) {
  const { rowsPerM = 0, seed = 1, zAtFor } = opts;
  const rand = mulberry32(seed);
  const sides = [
    { hAlong: sightW / 2, hPerp: sightH / 2, rot: 0 },            // bottom
    { hAlong: sightH / 2, hPerp: sightW / 2, rot: Math.PI / 2 },  // right
    { hAlong: sightW / 2, hPerp: sightH / 2, rot: Math.PI },      // top
    { hAlong: sightH / 2, hPerp: sightW / 2, rot: -Math.PI / 2 }, // left
  ];
  const geos = sides.map((side) => {
    const pls = zAtFor ? zAtFor(polylines, side.hAlong) : polylines;
    const g = buildMember(pls, side.hAlong, side.hPerp, {
      rowsPerM,
      uOffset: rand() * 4,
      vOffset: rand() * 4,
    });
    g.rotateZ(side.rot);
    return g;
  });
  return mergeGeometries(geos);
}

// Straight run of a profile along x, from x0 to x1. Profile w maps to +y.
export function extrudeX(polylines, x0, x1) {
  const geos = [];
  let v0 = 0;
  for (const pl of polylines) {
    const pts = pl.pts;
    const n = pts.length;
    const arcs = arcLengths(pts);
    const pos = [], uv = [], idx = [];
    for (const x of [x0, x1]) {
      for (let i = 0; i < n; i++) {
        pos.push(x, pts[i][0], pts[i][1]);
        uv.push(x / TEX_M, (v0 + arcs[i]) / TEX_M);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i, b = i + 1, c = i + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
    v0 += arcs[n - 1];
  }
  return mergeGeometries(geos);
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
