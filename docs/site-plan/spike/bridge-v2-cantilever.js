// Throwaway prototype: procedural segmented cantilever bridge in three.js. Decides silhouette + route, not shippable.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const q = new URLSearchParams(location.search);
const cam = q.get('cam') || 'hero';
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const SPAN_HALF = 6, GAP = 0.42, DEPTH = 2.6, T0 = 0.26, SPRING = 1.7, JOINT = 0.022;
const top = t => 3.45 + 1.35 * t ** 1.4;
const bot = t => { const u = Math.max(0, (t - T0) / (1 - T0)); return SPRING + (3.95 - SPRING) * Math.sin(Math.PI / 2 * u) ** 0.8; };
const xt = t => -(SPAN_HALF - t * (SPAN_HALF - GAP / 2));

function fillet(pts, r) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const P = pts[i], A = pts[(i - 1 + pts.length) % pts.length], B = pts[(i + 1) % pts.length];
    const a = A.clone().sub(P), b = B.clone().sub(P);
    const turn = Math.PI - a.angleTo(b);
    if (turn < 0.42) { out.push(P.clone()); continue; }
    const d = Math.min(r, a.length() * 0.4, b.length() * 0.4);
    const p1 = P.clone().add(a.normalize().multiplyScalar(d)), p2 = P.clone().add(b.normalize().multiplyScalar(d));
    for (let k = 0; k <= 3; k++) { const s = k / 3; out.push(p1.clone().multiplyScalar((1 - s) ** 2).add(P.clone().multiplyScalar(2 * s * (1 - s))).add(p2.clone().multiplyScalar(s * s))); }
  }
  return out;
}

// v2: balanced-cantilever halves. Each half is a battered pier, a hammerhead pier table, a short heavy
// back arm and a long haunched front arm built from segments; the two front tips stop short of each other.
const BACK = -8.4, PX0 = -5.75, PX1 = -3.45, HY = 2.7, TIP = -GAP / 2;
const deck = x => 4.55 + 0.4 * ((x - BACK) / -BACK) ** 2;
const yTip = deck(TIP) - 0.7, yBack = deck(BACK) - 1.3;
const soffitF = x => { const s = (x - PX1) / (TIP - PX1); return yTip - (yTip - HY) * (1 - s) ** 2.0; };
const soffitB = x => { const s = (PX0 - x) / (PX0 - BACK); return yBack - (yBack - HY) * (1 - s) ** 1.6; };
function halfBlocks(frontU, backU, courses, seed) {
  const r = mulberry(seed), u01 = (a, b) => a + (b - a) * r(), blocks = [];
  const pc = (PX0 + PX1) / 2, w = y => 1.55 - (1.55 - (PX1 - PX0) / 2) * (y / HY);
  const ys = [0, ...courses, HY];
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i] + (i ? JOINT : 0), y1 = ys[i + 1] - JOINT, split = i === 0 && courses.length < 2 ? [pc + u01(-0.25, 0.25)] : [];
    const xs = [null, ...split, null];
    for (let k = 0; k < xs.length - 1; k++) {
      const l0 = xs[k] === null ? pc - w(y0) : xs[k] + JOINT, l1 = xs[k] === null ? pc - w(y1) : xs[k] + JOINT;
      const r0 = xs[k + 1] === null ? pc + w(y0) : xs[k + 1] - JOINT, r1 = xs[k + 1] === null ? pc + w(y1) : xs[k + 1] - JOINT;
      blocks.push({ poly: [[l0, y0], [r0, y0], [r1, y1], [l1, y1]], depth: 3.2 + u01(-0.06, 0.06), zoff: u01(-0.03, 0.03) });
    }
  }
  blocks.push({ poly: [[PX0 + JOINT, HY], [PX1 - JOINT, HY], [PX1 - JOINT, deck(PX1)], [PX0 + JOINT, deck(PX0)]], depth: 3.0, zoff: 0 });
  const arm = (x0, x1, us, soffit, d0, d1) => {
    const js = [0, ...us.map(u => u + u01(-0.02, 0.02)), 1];
    for (let i = 0; i < js.length - 1; i++) {
      const xa = x0 + (x1 - x0) * js[i] + Math.sign(x1 - x0) * (i ? JOINT : 0), xb = x0 + (x1 - x0) * js[i + 1] - Math.sign(x1 - x0) * (i < js.length - 2 ? JOINT : 0);
      const lo = Math.min(xa, xb), hi = Math.max(xa, xb), step = u01(-0.04, 0.05), N = 5, poly = [];
      for (let k = 0; k <= N; k++) { const x = lo + (hi - lo) * k / N; poly.push([x, soffit(x)]); }
      for (let k = 0; k <= N; k++) { const x = hi + (lo - hi) * k / N; poly.push([x, deck(x) + step]); }
      const m = (js[i] + js[i + 1]) / 2;
      blocks.push({ poly, depth: d0 + (d1 - d0) * m + u01(-0.07, 0.07), zoff: u01(-0.04, 0.04) });
    }
  };
  arm(PX1, TIP, frontU, soffitF, 2.85, 1.9);
  arm(PX0, BACK, backU, soffitB, 2.85, 2.5);
  return blocks;
}

function noiseTexture(size, seed) {
  const r = mulberry(seed), c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), n = new ImprovedNoise();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, f = 6 / size;
    for (let o = 0; o < 5; o++) { v += amp * n.noise(x * f + 11, y * f + 7, o * 3.1); amp *= 0.55; f *= 2.1; }
    const pit = r() < 0.012 ? -0.5 : 0;
    const s = Math.max(0, Math.min(255, 128 + 150 * v + 255 * pit));
    img.data.set([s, s, s, 255], (y * size + x) * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.6, 0.6); t.anisotropy = 8; return t;
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); const FOG = 0xa6abb8;
scene.background = new THREE.Color(FOG); scene.fog = new THREE.FogExp2(FOG, 0.0125);

const bump = noiseTexture(512, 5);
const stone = new THREE.MeshStandardMaterial({ color: 0x8d929e, roughness: 0.94, metalness: 0, bumpMap: bump, bumpScale: 2.2, roughnessMap: bump });
const bridge = new THREE.Group(); let tris = 0;
const add = (blocks, mirror) => blocks.forEach(b => {
  const pts = fillet(b.poly.map(([x, y]) => new THREE.Vector2(mirror ? -x : x, y)), 0.11);
  const bevel = 0.06, geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: b.depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3 });
  geo.translate(0, 0, -b.depth / 2 + bevel + b.zoff);
  tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  const m = new THREE.Mesh(geo, stone); m.castShadow = m.receiveShadow = true; bridge.add(m);
});
add(halfBlocks([0.24, 0.45, 0.64, 0.82], [0.55], [1.35], 11), false);
add(halfBlocks([0.28, 0.54, 0.79], [0.5], [0.95, 1.85], 23), true);
scene.add(bridge);

// seam of light: thin emissive slab between the two tips, plus a local light
const seamH = deck(TIP) - yTip, glow = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const seam = new THREE.Mesh(new THREE.BoxGeometry(GAP * 0.5, seamH * 0.94, 1.7), glow); seam.position.set(0, yTip + seamH / 2, 0); scene.add(seam);
const pl = new THREE.PointLight(0xe4eeff, 70, 10, 2); pl.position.set(0, yTip - 0.3, 0.6); scene.add(pl);
const pl2 = new THREE.PointLight(0xe4eeff, 30, 7, 2); pl2.position.set(0, deck(TIP) + 0.5, 0.8); scene.add(pl2);

// terrain: calm platform, one foreground rock mass, ridgelines that fade into fog
const n = new ImprovedNoise(), tg = new THREE.PlaneGeometry(220, 220, 260, 260); tg.rotateX(-Math.PI / 2);
const ridged = (x, z, oct) => { let v = 0, a = 1, f = 1, s = 0; for (let o = 0; o < oct; o++) { const r = 1 - Math.abs(n.noise(x * f, 3.3, z * f)); v += a * r * r; s += a; a *= 0.5; f *= 2.05; } return v / s; };
const P = tg.attributes.position;
for (let i = 0; i < P.count; i++) {
  const x = P.getX(i), z = P.getZ(i), d = Math.hypot(x * 0.75, z);
  const far = Math.min(1, Math.max(0, (d - 11) / 46)) ** 1.35;
  const back = z < 0 ? 1 : 0.35;
  let h = -0.9 * (1 - Math.exp(-((d / 10) ** 2))) + far * back * (ridged(x * 0.021 + 2, z * 0.021 - 1, 6) * 44 - 11) + (0.18 + far) * n.noise(x * 0.11, 9.1, z * 0.11) * 1.4;
  const fx = x + 13.5, fz = z - 19, fd = Math.hypot(fx * 0.8, fz);
  h += 3.1 * Math.exp(-((fd / 4.2) ** 2)) * (0.55 + 0.9 * ridged(x * 0.16, z * 0.16, 4));
  P.setY(i, h);
}
tg.computeVertexNormals();
const ground = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x8f95a2, roughness: 1, bumpMap: bump, bumpScale: 1.4 }));
ground.material.bumpMap = bump; ground.receiveShadow = true; ground.castShadow = true; scene.add(ground);

scene.add(new THREE.HemisphereLight(0xe8eef7, 0x59606c, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-9, 15, 10); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; scene.add(key);
const rim = new THREE.DirectionalLight(0xc3d6ff, 0.9); rim.position.set(10, 6, -12); scene.add(rim);

const camera = new THREE.PerspectiveCamera(27, innerWidth / innerHeight, 0.1, 400);
const cams = { hero: [[-9.5, 2.0, 33], [0.4, 3.3, 0]], side: [[0, 2.6, 27], [0, 2.7, 0]], close: [[-4.2, 3.9, 8.5], [-0.3, 4.4, 0]], phone: [[-7, 2.4, 46], [0, 5.2, 0]] };
camera.position.set(...cams[cam][0]); camera.lookAt(...cams[cam][1]);
if (cam === 'phone') { camera.fov = 38; camera.updateProjectionMatrix(); }
renderer.render(scene, camera);
window.__spike = { tris, blocks: bridge.children.length, calls: renderer.info.render.calls, ready: true };
