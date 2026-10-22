// 5 mm power cord: leaves the frame's bottom centre through a short strain
// relief, hangs plumb down the wall clear of the dado rail and skirting, lies
// along the floor and rises into a plug in the skirting socket.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CORD_R = 0.0025;

export const cordMaterial = new THREE.MeshStandardMaterial({ color: '#141110', roughness: 0.62 });

// exit: frame bottom centre { x, y, z }; plug: plug centre { x, y, z, h };
// floorY: floor height; hangZ: distance off the wall for the plumb drop
export function buildCord({ exit, plug, floorY, hangZ }) {
  const dir = Math.sign(plug.x - exit.x) || 1;
  const r = CORD_R;
  const floorZ = hangZ + 0.014;
  const plugBottom = plug.y - plug.h / 2;
  const pts = [
    [exit.x, exit.y + 0.012, exit.z],          // inside the frame
    [exit.x, exit.y - 0.03, exit.z + 0.001],
    [exit.x, exit.y - 0.12, hangZ],
    [exit.x, floorY + 0.3, hangZ],
    [exit.x, floorY + 0.09, hangZ + 0.001],
    [exit.x + dir * 0.008, floorY + 0.03, hangZ + 0.006],   // eases onto the floor
    [exit.x + dir * 0.04, floorY + r, floorZ],
    [exit.x + dir * 0.12, floorY + r, floorZ + 0.002],
    [plug.x - dir * 0.18, floorY + r, floorZ + 0.003],
    [plug.x - dir * 0.06, floorY + r, floorZ],
    [plug.x - dir * 0.012, floorY + 0.014, plug.z + 0.004], // rises into the plug
    [plug.x, plugBottom - 0.02, plug.z],
    [plug.x, plugBottom + 0.004, plug.z],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = new THREE.TubeGeometry(curve, 900, r, 12, false);

  // strain relief where the cord leaves the frame
  const relief = new THREE.CylinderGeometry(0.0042, 0.0034, 0.016, 20, 1, false);
  relief.translate(exit.x, exit.y - 0.006, exit.z);

  // UK plug body with a rounded cord boot
  const body = new THREE.BoxGeometry(0.046, plug.h, 0.026);
  body.translate(plug.x, plug.y, plug.z);
  const boot = new THREE.CylinderGeometry(0.0045, 0.0065, 0.012, 20, 1, false);
  boot.translate(plug.x, plugBottom - 0.004, plug.z);

  const geo = mergeGeometries([tube, relief, body, boot].map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  }));
  return new THREE.Mesh(geo, cordMaterial);
}
