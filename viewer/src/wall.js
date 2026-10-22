// Painted raised-panel wall: stiles and rails, bolection mouldings, fielded
// panels with bevelled edges, dado rail, skirting and cornice. The raised
// panel fields sit at z = 0; the frame hangs on the centre upper field.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { arc, buildMitredFrame, extrudeX } from './profile.js';

export const WALL = {
  floorY: -1.62,
  ceilY: 1.06,
  halfW: 4.2,
  ground: -0.016, // recessed panel ground
  stileZ: 0.006,  // face of stiles and rails
  bay: 1.2,
  stile: 0.11,
};

// twin socket on the skirting face below the centre stile; both lightboxes plug in here
export const SOCKET = {
  x: 0,
  y: WALL.floorY + 0.075,
  face: 0.03 + 0.009, // skirting face plus plate thickness
  plugDx: 0.034,
};

const MOULD_W = 0.022;
const BEVEL_W = 0.052;

// small bolection moulding: from the panel ground up over an ovolo to the stile face
const mouldProfile = [
  { pts: [[0, WALL.ground], [0, -0.012]] },
  { pts: arc(0.01, -0.012, 0.01, 180, 90, 10) },
  { pts: [[0.01, -0.002], [0.014, -0.002]] },
  { pts: arc(0.014, WALL.stileZ, 0.008, 270, 360, 10) },
];
const bevelProfile = [{ pts: [[0, 0], [BEVEL_W, WALL.ground]] }];

function box(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

function panel(cx, cy, ow, oh) {
  // ow x oh is the opening between stiles and rails
  const geos = [];
  const mw = ow - 2 * MOULD_W, mh = oh - 2 * MOULD_W;
  geos.push(buildMitredFrame(mouldProfile, mw, mh, { seed: Math.round(cx * 10 + cy * 100) }));
  const fw = mw - 2 * BEVEL_W, fh = mh - 2 * BEVEL_W;
  geos.push(buildMitredFrame(bevelProfile, fw, fh));
  const field = new THREE.PlaneGeometry(fw, fh);
  geos.push(field);
  const g = mergeGeometries(geos.map((x) => x.index ? x.toNonIndexed() : x));
  g.translate(cx, cy, 0);
  return g;
}

export function buildWall(paint, floorMat, ceilMat) {
  const group = new THREE.Group();
  const { floorY, ceilY, halfW, ground, stileZ, bay, stile } = WALL;

  const skirtTop = floorY + 0.19;
  const dadoY = -0.72;
  const upperTop = 0.82;
  const zones = [
    { y0: skirtTop, y1: dadoY - 0.03, railB: 0.08, railT: 0.07 }, // wainscot
    { y0: dadoY + 0.03, y1: upperTop, railB: 0.09, railT: 0.1 },  // upper panels
  ];

  const geos = [];
  // panel ground behind everything
  geos.push(box(-halfW, halfW, floorY, ceilY, ground - 0.01, ground).toNonIndexed());

  // a stile on the centre line, so the two frames each get a panel either side of it
  const n = Math.floor(halfW / bay);
  const edge = n * bay + stile / 2; // outside the last stile, flat boarding to the wall ends

  for (const z of zones) {
    const sy0 = z.y0 + z.railB, sy1 = z.y1 - z.railT;
    // rails
    geos.push(box(-halfW, halfW, z.y0, sy0, ground, stileZ).toNonIndexed());
    geos.push(box(-halfW, halfW, sy1, z.y1, ground, stileZ).toNonIndexed());
    for (let c = -n; c <= n; c++) {
      geos.push(box(c * bay - stile / 2, c * bay + stile / 2, sy0, sy1, ground, stileZ).toNonIndexed());
    }
    for (let c = -n; c < n; c++) {
      geos.push(panel((c + 0.5) * bay, (sy0 + sy1) / 2, bay - stile, sy1 - sy0));
    }
    geos.push(box(-halfW, -edge, sy0, sy1, ground, stileZ).toNonIndexed());
    geos.push(box(edge, halfW, sy0, sy1, ground, stileZ).toNonIndexed());
  }

  // frieze above the upper panels
  geos.push(box(-halfW, halfW, upperTop, ceilY, ground, stileZ - 0.002).toNonIndexed());

  // dado rail: torus-ish rounded rail
  const dado = extrudeX([
    { pts: [[-0.03, stileZ], [-0.03, 0.014]] },
    { pts: arc(-0.018, 0.014, 0.012, 180, 90, 8) },
    { pts: [[-0.018, 0.026], [0.012, 0.026]] },
    { pts: arc(0.012, 0.018, 0.008, 90, 0, 8) },
    { pts: arc(0.026, 0.018, 0.006, 180, 270, 6) },
    { pts: [[0.026, 0.012], [0.03, 0.012], [0.03, stileZ]] },
  ], -halfW, halfW);
  dado.translate(0, dadoY, 0);
  geos.push(dado.toNonIndexed());

  // skirting: plinth with an ogee top
  const skirt = extrudeX([
    { pts: [[0, stileZ], [0, 0.03]] },
    { pts: [[0, 0.03], [0.14, 0.03]] },
    { pts: arc(0.14, 0.02, 0.01, 90, 0, 8) },
    { pts: arc(0.16, 0.02, 0.01, 180, 270, 8) },
    { pts: [[0.16, 0.01], [0.19, 0.01], [0.19, stileZ]] },
  ], -halfW, halfW);
  skirt.translate(0, floorY, 0);
  geos.push(skirt.toNonIndexed());

  // cornice: stepped cove under the ceiling
  const cornice = extrudeX([
    { pts: [[-0.12, stileZ], [-0.12, 0.012]] },
    { pts: [[-0.12, 0.012], [-0.105, 0.012]] },
    { pts: arc(-0.105, 0.072, 0.06, 270, 360, 14) },
    { pts: [[-0.045, 0.072], [-0.045, 0.09]] },
    { pts: [[-0.045, 0.09], [0, 0.09]] },
  ], -halfW, halfW);
  cornice.translate(0, ceilY, 0);
  geos.push(cornice.toNonIndexed());

  const wall = new THREE.Mesh(mergeGeometries(geos.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  })), paint);
  group.add(wall);

  // antique bronze twin socket plate with two rocker switches
  const bronze = new THREE.MeshStandardMaterial({ color: '#5a4029', metalness: 0.75, roughness: 0.38 });
  const plate = mergeGeometries([
    box(-0.073, 0.073, SOCKET.y - 0.043, SOCKET.y + 0.043, SOCKET.face - 0.009, SOCKET.face).toNonIndexed(),
    box(-0.067, -0.055, SOCKET.y + 0.012, SOCKET.y + 0.03, SOCKET.face, SOCKET.face + 0.004).toNonIndexed(),
    box(0.055, 0.067, SOCKET.y + 0.012, SOCKET.y + 0.03, SOCKET.face, SOCKET.face + 0.004).toNonIndexed(),
  ]);
  group.add(new THREE.Mesh(plate, bronze));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfW, 6), floorMat);
  floor.geometry.rotateX(-Math.PI / 2);
  floor.geometry.translate(0, floorY, 3 + ground);
  scaleUv(floor.geometry, 2 * halfW / 0.9, 6 / 0.9);
  group.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfW, 6), ceilMat);
  ceil.geometry.rotateX(Math.PI / 2);
  ceil.geometry.translate(0, ceilY, 3 + ground);
  group.add(ceil);

  return group;
}

function scaleUv(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}
