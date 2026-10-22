// One framed lightbox: map, walnut frame, backer with engraved logo, and the
// lights it throws. The glass (visible map) is exactly the paper size; the
// frame grows outward from it.
import * as THREE from 'three';
import { buildFrame } from './frame.js';
import { engravingMaterial } from './engraving.js';
import { TEX_M } from './profile.js';
import { buildCord } from './cord.js';
import { WALL, SOCKET } from './wall.js';

export const PAPER = { A1: [0.594, 0.841], A2: [0.42, 0.594] };
const A1_AREA = PAPER.A1[0] * PAPER.A1[1];

export const LIGHT = {
  MAP_GAIN: 3.4,    // map radiance per unit of the intensity control
  RECT_GAIN: 5.0,   // area light radiance per unit intensity
  BOUNCE_GAIN: 1.1, // room bounce back onto the wall for an A1, candela per unit
  BACK_FILL: 0.5,   // wall glow reflected onto the backer, seen from behind
};

const mapShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    uniform vec3 tint;
    uniform float gain;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(map, vUv).rgb;
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // backlit film: ink stays near black, linework passes the lamp colour
      vec3 col = tint * gain * (0.005 + 1.1 * pow(lum, 0.85));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

function contactShadow(outerW, outerH) {
  // soft occlusion where the frame meets the wall
  const pad = 0.06, px = 1000;
  const cw = outerW + 2 * pad, chh = outerH + 2 * pad;
  const cv = document.createElement('canvas');
  cv.width = Math.round(px * cw); cv.height = Math.round(px * chh);
  const g = cv.getContext('2d');
  g.filter = `blur(${Math.round(px * 0.018)}px)`;
  g.fillStyle = '#fff';
  g.fillRect(px * pad - 4, px * pad - 4, px * outerW + 8, px * outerH + 8);
  const tex = new THREE.CanvasTexture(cv);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(cw, chh),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: 0.35, depthWrite: false })
  );
}

// Small paper-size label painted on the wall above the frame, in the lamp colour
// at half opacity. Drawn once the UI font is available so it matches the panel.
async function wallLabel(text) {
  const font = '500 150px Optima, "EB Garamond", Georgia, serif';
  try { await document.fonts.load(font, text); } catch { /* draw with whatever is available */ }
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, cv.width / 2, cv.height / 2 + 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const h = 0.05; // text cap height comes out near 20 mm
  return new THREE.Mesh(
    new THREE.PlaneGeometry(h * 2, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false })
  );
}

function backerUv(geo, du, dv) {
  // world-scaled UVs for the board's texture; uv1 keeps the plane's own 0..1 UVs for the engraving
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    out[i * 2] = pos.getY(i) / TEX_M + du;
    out[i * 2 + 1] = pos.getX(i) / TEX_M + dv;
  }
  geo.setAttribute('uv1', geo.attributes.uv.clone());
  geo.setAttribute('uv', new THREE.BufferAttribute(out, 2));
}

export function createLightbox({ paper, x, y, z0, walnut, backerMat, room, lightColor, label, seed = 0 }) {
  const [w, h] = paper;
  const area = (w * h) / A1_AREA;
  const group = new THREE.Group();
  group.position.set(x, y, z0);

  const rect = new THREE.RectAreaLight(lightColor, 1, w, h);
  rect.position.set(0, 0, 0.035);
  rect.lookAt(0, 0, 10);
  group.add(rect);

  // light this lightbox throws into the room and back onto the wall around it
  const bounce = new THREE.PointLight(lightColor, 1, 0, 2);
  bounce.position.set(0, -0.05, 0.55 - z0);
  group.add(bounce);

  // seen from behind, the lit wall reflects onto the backer
  const backFill = new THREE.RectAreaLight(lightColor, 0, w * 1.8, h * 1.8);
  backFill.position.set(0, 0, -0.35);
  backFill.lookAt(0, 0, 0);
  group.add(backFill);

  const mapGroup = new THREE.Group();
  mapGroup.position.z = 0.035; // set per frame style in setStyle
  mapGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x0c0703 })));
  group.add(mapGroup);

  let frameMesh, ao, cord, labelMesh;
  const placeLabel = () => {
    // centred 35 mm above the frame's top edge, on the wall field
    if (labelMesh && frameMesh) labelMesh.position.set(0, h / 2 + frameMesh.userData.width + 0.035, -z0 + 0.0008);
  };
  if (label) {
    wallLabel(label).then((m) => {
      labelMesh = m;
      labelMesh.material.color.copy(lightColor);
      placeLabel();
      group.add(labelMesh);
    });
  }
  const plugH = 0.056;
  const plug = { x: SOCKET.x + Math.sign(x - SOCKET.x) * SOCKET.plugDx, y: SOCKET.y - 0.008, z: SOCKET.face + 0.013, h: plugH };

  const box = {
    group, paper,
    get frameWidth() { return frameMesh ? frameMesh.userData.width : 0; },

    setStyle(style) {
      if (frameMesh) { group.remove(frameMesh); frameMesh.geometry.dispose(); }
      frameMesh = buildFrame(style, w, h, walnut);
      group.add(frameMesh);
      const fw = frameMesh.userData.width;
      // the map (and the light it gives) sits at the depth this profile sets
      mapGroup.position.z = frameMesh.userData.mapZ;
      placeLabel();
      rect.position.z = frameMesh.userData.mapZ + 0.0005;
      if (ao) { room.remove(ao); ao.geometry.dispose(); ao.material.alphaMap.dispose(); }
      ao = contactShadow(w + 2 * fw, h + 2 * fw);
      ao.position.set(x, y, 0.0006);
      room.add(ao);
      // cord leaves the bottom centre of the frame's outer edge, which moves with the profile width
      if (cord) { room.remove(cord); cord.geometry.dispose(); }
      cord = buildCord({
        exit: { x, y: y - h / 2 - fw, z: z0 + 0.033 },
        plug, floorY: WALL.floorY, hangZ: 0.038,
      });
      room.add(cord);
    },

    // tiles: [{ texture, x0, x1, y0, y1 }] as image fractions, shared with other lightboxes
    setMap(tiles, uniforms) {
      mapGroup.clear();
      for (const t of tiles) {
        const mat = new THREE.ShaderMaterial({
          ...mapShader,
          uniforms: { map: { value: t.texture }, tint: uniforms.tint, gain: uniforms.gain },
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry((t.x1 - t.x0) * w, (t.y1 - t.y0) * h), mat);
        m.position.set(-w / 2 + ((t.x0 + t.x1) / 2) * w, h / 2 - ((t.y0 + t.y1) / 2) * h, 0);
        mapGroup.add(m);
      }
    },

    addBacker(eng, logoW) {
      const flip = new THREE.Matrix4().makeRotationY(Math.PI);
      const g = new THREE.PlaneGeometry(w + 0.02, h + 0.02).applyMatrix4(flip);
      backerUv(g, 0.37 + seed, 0.81 + seed);
      const backer = new THREE.Mesh(g, backerMat);
      backer.position.z = 0.002; // recessed 2 mm into the frame's rabbet
      group.add(backer);

      // bottom-left as seen from behind is +x, -y in frame space
      const logoH = logoW / eng.aspect, margin = 0.03;
      const dg = new THREE.PlaneGeometry(logoW, logoH).applyMatrix4(flip);
      dg.translate(w / 2 - margin - logoW / 2, -h / 2 + margin + logoH / 2, 0);
      backerUv(dg, 0.37 + seed, 0.81 + seed);
      const decal = new THREE.Mesh(dg, engravingMaterial(backerMat, eng));
      decal.position.z = 0.002 - 0.0002;
      decal.renderOrder = 1;
      group.add(decal);
    },

    applyLight(intensity) {
      if (labelMesh) labelMesh.material.color.copy(lightColor);
      rect.color.copy(lightColor);
      rect.intensity = LIGHT.RECT_GAIN * intensity;
      bounce.color.copy(lightColor);
      bounce.intensity = LIGHT.BOUNCE_GAIN * area * intensity;
      backFill.color.copy(lightColor);
    },

    // k: 0 when viewed from the front, 1 from behind
    setBehind(k, intensity) {
      backFill.intensity = LIGHT.BACK_FILL * intensity * k;
    },
  };
  return box;
}
