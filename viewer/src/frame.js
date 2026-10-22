// Walnut frame styles. Both share the sight opening, so the backer stays put
// when the style changes; each sets its own map depth (userData.mapZ).
import * as THREE from 'three';
import { arc, buildMitredFrame, smoothstep } from './profile.js';

// Plain walnut: deep box section, flat face, square sight edge; the map sits
// 10 mm below the face.
function plainProfile() {
  const W = 0.058, D = 0.06, r = 0.0018;
  return {
    width: W,
    mapZ: D - 0.01,
    polylines: [
      { pts: [[0, 0], [0, D]] },                            // straight inner reveal down to the map
      { pts: [[0, D], [W - r, D]] },                        // face
      { pts: arc(W - r, D - r, r, 90, 0, 6) },              // eased outer arris
      { pts: [[W, D - r], [W, 0]] },                        // outer side
      { pts: [[W, 0], [0, 0]] },                            // back
    ],
  };
}

// Reed and ribbon astragal (molding.png, MLD-RA3, 2 3/4" x 1 3/16") on a
// stepped lip, with a cove and bead to the outside.
const AST = { c: 0.047, a: 0.035, zb: 0.051, H: 0.013, p: 2.4 };
const REEDS = 7, REED_SPAN = 0.8, REED_H = 0.0012;
const RIB = { half: 0.03, hw: 0.0047, h: 0.0024, spacing: 0.16, k: 1.9 };

function astragalSmooth(w) {
  const t = Math.abs((w - AST.c) / AST.a);
  return AST.zb + AST.H * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, t), AST.p)), 1 / AST.p);
}

function reeds(w) {
  const t = (w - AST.c) / AST.a;
  if (Math.abs(t) > REED_SPAN) return 0;
  const u = ((t + REED_SPAN) / (2 * REED_SPAN)) * REEDS;
  const f = u - Math.floor(u);
  const bead = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2));
  return REED_H * bead * smoothstep(REED_SPAN, REED_SPAN - 0.06, Math.abs(t));
}

// Height of the crossed ribbons at (w, s) for ribbon centres s0.
function ribbons(w, s, centres) {
  const t = (w - AST.c) / AST.a;
  const at = Math.abs(t);
  if (at > 0.95) return 0;
  const env = smoothstep(0.95, 0.72, at);
  const norm = Math.tanh(RIB.k * 0.9);
  const th = Math.tanh(RIB.k * t);
  const g = th / norm;
  const slope = (RIB.half * RIB.k * (1 - th * th)) / norm / AST.a;
  const cosf = 1 / Math.sqrt(1 + slope * slope);
  let best = 0;
  for (const s0 of centres) {
    if (Math.abs(s - s0) > RIB.half + 0.02) continue;
    const dA = Math.abs(s - (s0 + RIB.half * g)) * cosf;
    const dB = Math.abs(s - (s0 - RIB.half * g)) * cosf;
    // A passes over B: it stands 0.5 mm proud of B where they cross
    const hA = (RIB.h + 0.0005) * smoothstep(RIB.hw, RIB.hw * 0.5, dA) * env;
    const hB = RIB.h * smoothstep(RIB.hw, RIB.hw * 0.5, dB) * env;
    best = Math.max(best, hA, hB);
  }
  return best;
}

function moldingProfile() {
  const W = 0.096;
  const n = 220;
  const astPts = [];
  for (let i = 0; i <= n; i++) {
    // sine spacing packs samples toward the steep ends of the astragal
    const x = -1 + (2 * i) / n;
    const w = AST.c + AST.a * Math.sin((Math.PI / 2) * x);
    astPts.push([w, astragalSmooth(w)]);
  }
  return {
    width: W,
    mapZ: 0.035, // 11 mm below the lip fillet
    polylines: [
      { pts: [[0, 0], [0, 0.046]] },                          // inner reveal
      { pts: [[0, 0.046], [0.005, 0.046]] },                  // lip fillet
      { pts: arc(0.005, 0.051, 0.005, 270, 360, 8) },         // cove up to the astragal
      { pts: [[0.01, 0.051], [AST.c - AST.a, 0.051]] },       // fillet
      { pts: astPts, astragal: true },                        // reed and ribbon astragal
      { pts: [[AST.c + AST.a, 0.051], [0.085, 0.051]] },      // fillet
      { pts: arc(0.091, 0.051, 0.006, 180, 270, 8) },         // outer cove
      { pts: arc(0.091, 0.04, 0.005, 90, 0, 8) },             // outer bead
      { pts: [[W, 0.04], [W, 0]] },                           // outer side
      { pts: [[W, 0], [0, 0]] },                              // back
    ],
  };
}

// Ribbon centres along a member, symmetric about its middle, clear of the mitres.
function ribbonCentres(hAlong) {
  const limit = hAlong + (AST.c - AST.a) - RIB.half - 0.035;
  const out = [0];
  for (let k = 1; k * RIB.spacing <= limit; k++) out.push(k * RIB.spacing, -k * RIB.spacing);
  return out;
}

export function buildFrame(style, sightW, sightH, material) {
  const prof = style === 'molding' ? moldingProfile() : plainProfile();
  const geo = buildMitredFrame(prof.polylines, sightW, sightH, {
    seed: style === 'molding' ? 7 : 3,
    rowsPerM: style === 'molding' ? 900 : 0,
    zAtFor: style === 'molding'
      ? (pls, hAlong) => {
          const centres = ribbonCentres(hAlong);
          return pls.map((pl) => pl.astragal
            ? { ...pl, zAt: (w, s) => astragalSmooth(w) + Math.max(reeds(w), ribbons(w, s, centres)) }
            : pl);
        }
      : null,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.width = prof.width;
  mesh.userData.mapZ = prof.mapZ;
  return mesh;
}
