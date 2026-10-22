import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { buildWall, WALL, SOCKET } from './wall.js';
import { fetchMap, buildMapTiles } from './maptex.js';
import { buildEngraving } from './engraving.js';
import { createLightbox, PAPER, LIGHT } from './lightbox.js';
import './style.css';

const params = new URLSearchParams(location.search);
const FRAME_CY = 0.06;      // frame centre height on the wall
const FRAME_Z0 = 0.002;     // frame back, 2 mm proud of the panel field
const BACK_RAKE = 0.5;      // low raking wall glow on the backers, so the engravings read
const ZOOM_OUT = 1.62;      // zoom-out cap as a multiple of the distance that frames both lightboxes
// each lightbox hangs centred on its own raised panel, either side of the centre stile
const HANGS = [
  { paper: PAPER.A1, label: 'A1', x: -WALL.bay / 2, logoW: 0.085 },
  { paper: PAPER.A2, label: 'A2', x: WALL.bay / 2, logoW: 0.07 },
];

const state = {
  style: params.get('style') === 'molding' ? 'molding' : 'plain',
  color: '#ffa63d',
  intensity: 1.0,
  bloom: 0.55,
};

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#060403');
scene.fog = new THREE.FogExp2('#060403', 0.09);

const camera = new THREE.PerspectiveCamera(38, Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight), 0.01, 40);
camera.position.set(0.3, FRAME_CY + 0.08, 2.0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, FRAME_CY, 0.04);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.28;
controls.maxDistance = 2.2; // reset by fitZoom() from the distance that frames both lightboxes
const POLAR = [THREE.MathUtils.degToRad(38), THREE.MathUtils.degToRad(112)];
controls.minPolarAngle = POLAR[0];
controls.maxPolarAngle = POLAR[1];
controls.screenSpacePanning = true;
controls.zoomSpeed = 0.8;
controls.update();

// ---------- materials ----------
const texLoader = new THREE.TextureLoader();
const aniso = renderer.capabilities.getMaxAnisotropy();
function woodTex(file, srgb) {
  const t = texLoader.load(`tex/${file}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}
const walnutMaps = {
  map: woodTex('walnut_albedo.jpg', true),
  normalMap: woodTex('walnut_normal.png', false),
  roughnessMap: woodTex('walnut_rough.jpg', false),
};
const walnut = new THREE.MeshStandardMaterial({
  ...walnutMaps,
  color: new THREE.Color(1, 1, 1),
  roughness: 1.0,            // scaled by the roughness map (~0.5, oiled satin)
  normalScale: new THREE.Vector2(0.35, 0.35),
});
// backers are plain MDF, flat brown and matte
const mdfMap = woodTex('mdf_albedo.jpg', true);
const mdf = new THREE.MeshStandardMaterial({ map: mdfMap, roughness: 0.88 });
const paint = new THREE.MeshStandardMaterial({ color: '#6a5444', roughness: 0.72 });
const floorMat = new THREE.MeshStandardMaterial({
  ...walnutMaps,
  color: new THREE.Color(0.42, 0.36, 0.32),
  roughness: 0.9,
  normalScale: new THREE.Vector2(0.4, 0.4),
});
const ceilMat = new THREE.MeshStandardMaterial({ color: '#4a3c32', roughness: 0.9 });

// ---------- room ----------
const room = buildWall(paint, floorMat, ceilMat);
scene.add(room);

RectAreaLightUniformsLib.init();
const lightColor = new THREE.Color(state.color);
const mapUniforms = { tint: { value: lightColor.clone() }, gain: { value: LIGHT.MAP_GAIN } };

// shared raking glow on the backers, only when seen from behind
const backRake = new THREE.DirectionalLight(lightColor, 0);
backRake.position.set(-0.6, FRAME_CY - 0.45, -0.24); // grazes the backers at about 18 degrees
backRake.target.position.set(0, FRAME_CY, 0);
scene.add(backRake, backRake.target);

let boxes = [];
const hangMin = new THREE.Vector2(), hangMax = new THREE.Vector2(); // extent of the artwork
const panMin = new THREE.Vector3(), panMax = new THREE.Vector3();

function hangLightboxes(landscape) {
  boxes = HANGS.map((hang, i) => {
    const paper = landscape ? [hang.paper[1], hang.paper[0]] : hang.paper;
    const box = createLightbox({
      paper, label: hang.label, x: hang.x, y: FRAME_CY, z0: FRAME_Z0, walnut, backerMat: mdf, room, lightColor, seed: i * 1.7,
    });
    box.logoW = hang.logoW;
    scene.add(box.group);
    return box;
  });
  hangMin.set(Infinity, Infinity);
  hangMax.set(-Infinity, -Infinity);
  for (const b of boxes) {
    const { x, y } = b.group.position, [w, h] = b.paper;
    hangMin.x = Math.min(hangMin.x, x - w / 2); hangMax.x = Math.max(hangMax.x, x + w / 2);
    hangMin.y = Math.min(hangMin.y, y - h / 2); hangMax.y = Math.max(hangMax.y, y + h / 2);
  }
  // panning stays on the artwork, and can drop down the cords to the socket
  panMin.set(hangMin.x, SOCKET.y, -0.03);
  panMax.set(hangMax.x, hangMax.y, 0.07);
  setStyle(state.style);
  homeView();
}

// open on a view that takes in both frames
let homed = false; // true once the view has been placed at a real window size
function homeView() {
  homed = viewW > 0 && viewH > 0;
  fitZoom();
  controls.target.set((hangMin.x + hangMax.x) / 2, FRAME_CY, 0.04);
  camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(0.16, 0.04, 1).normalize(), controls.maxDistance / ZOOM_OUT);
  controls.update();
}

// distance at which the whole hang (frames included) fills the view; zoom-out
// stops at ZOOM_OUT times that
function fitZoom() {
  if (!boxes.length) return;
  const rim = 0.1 + 0.08; // widest frame plus some wall
  const halfW = (hangMax.x - hangMin.x) / 2 + rim, halfH = (hangMax.y - hangMin.y) / 2 + rim;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  controls.maxDistance = ZOOM_OUT * Math.max(halfH / t, halfW / (t * camera.aspect));
}

function setStyle(style) {
  state.style = style;
  for (const b of boxes) b.setStyle(style);
  document.querySelectorAll('[data-style]').forEach((el) => el.classList.toggle('on', el.dataset.style === style));
}

// ---------- post ----------
const size = new THREE.Vector2(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
const rt = new THREE.WebGLRenderTarget(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio(), {
  type: THREE.HalfFloatType,
  samples: 4,
});
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(size, state.bloom, 0.42, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setSize(size.x, size.y); // sizes the MSAA target and passes at device pixels

// ---------- live parameters ----------
function applyLight() {
  lightColor.set(state.color);
  mapUniforms.tint.value.copy(lightColor);
  mapUniforms.gain.value = LIGHT.MAP_GAIN * state.intensity;
  for (const b of boxes) b.applyLight(state.intensity);
  backRake.color.copy(lightColor);
  bloom.strength = state.bloom;
}

document.getElementById('color').value = state.color;
document.getElementById('color').addEventListener('input', (e) => { state.color = e.target.value; applyLight(); });
document.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)));

// ---------- resize ----------
let viewW = window.innerWidth, viewH = window.innerHeight;
function fitView() {
  viewW = window.innerWidth; viewH = window.innerHeight;
  if (!viewW || !viewH) return;
  camera.aspect = viewW / viewH;
  camera.updateProjectionMatrix();
  renderer.setSize(viewW, viewH);
  composer.setSize(viewW, viewH);
  fitZoom();
  // a page opened in a background tab lays out at 0 x 0; place the camera once it has a real size
  if (boxes.length && (!homed || !Number.isFinite(camera.position.x))) homeView();
}
window.addEventListener('resize', fitView);

// ---------- loop ----------
const viewDir = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  // a page loaded in a hidden tab starts at 0 x 0; size up once it is visible
  if (window.innerWidth !== viewW || window.innerHeight !== viewH) fitView();
  if (!viewW || !viewH) return;

  controls.target.clamp(panMin, panMax);
  // when zoomed well out, tighten the tilt range so the camera stays between floor and ceiling
  const d = Math.max(1e-3, camera.position.distanceTo(controls.target));
  const up = (WALL.ceilY - 0.08 - controls.target.y) / d, down = (WALL.floorY + 0.1 - controls.target.y) / d;
  controls.minPolarAngle = Math.max(POLAR[0], Math.acos(Math.min(1, up)));
  controls.maxPolarAngle = Math.min(POLAR[1], Math.acos(Math.max(-1, down)));
  controls.update();

  // behind the wall plane the room is hidden so the backers can be seen
  room.visible = camera.position.z > FRAME_Z0 + 0.01;
  viewDir.subVectors(camera.position, controls.target).normalize();
  const k = THREE.MathUtils.smoothstep(-viewDir.z, 0.0, 0.3); // fades in as the view swings behind
  for (const b of boxes) b.setBehind(k, state.intensity);
  backRake.intensity = BACK_RAKE * state.intensity * k;
  composer.render();
}

// ---------- boot ----------
const status = document.getElementById('status');
async function boot() {
  status.textContent = 'Loading map...';
  const src = await fetchMap('map_sketch_v1.png');
  hangLightboxes(src.width > src.height);
  applyLight();
  requestAnimationFrame(frame);
  buildEngraving('radian_maps_logo.svg', 299.1 / 150.6)
    .then((eng) => { for (const b of boxes) b.addBacker(eng, b.logoW); })
    .catch((e) => console.error('backer', e));

  await new Promise((r) => setTimeout(r, 30));
  const tileLimit = params.get('tile') ? +params.get('tile') : 0;
  const { tiles, cols, rows, max } = await buildMapTiles(src, renderer, tileLimit);
  for (const b of boxes) b.setMap(tiles, mapUniforms);
  status.textContent = ''; // loading messages only; nothing shown once the map is up
  console.info(`map ${src.width} x ${src.height} px, ${cols * rows === 1 ? 'one texture' : `${cols} x ${rows} tiles`} (GPU max ${max}), ${renderer.capabilities.getMaxAnisotropy()}x aniso`);
}
boot().catch((e) => { status.textContent = `Error: ${e.message}`; console.error(e); });

window.viewer = { THREE, scene, camera, controls, renderer, state, setStyle, applyLight, composer, bloom, get boxes() { return boxes; } };
