// Throwaway prototype: procedural segmented cantilever bridge in three.js. Decides silhouette + route, not shippable.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const q = new URLSearchParams(location.search);
const cam = q.get('cam') || 'hero';
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const SPAN_HALF = 6, GAP = 0.16, DEPTH = 2.6, T0 = 0.26, SPRING = 1.7, JOINT = 0.022;
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

function halfBlocks(armU, courses, seed) {
  const r = mulberry(seed), u01 = (a, b) => a + (b - a) * r();
  const blocks = [], xin = xt(T0), zt0 = top(0), zti = top(T0);
  const xout = z => -SPAN_HALF - 0.6 * (1 - z / zt0);
  const zs = [0, ...courses];
  zs.forEach((zb, i) => {
    const z0 = zb + (i ? JOINT : 0), last = i === zs.length - 1, z1 = last ? null : zs[i + 1] - JOINT;
    const edges = [xout];
    if (i === 1) { const s = xout(z0) + (xin - xout(z0)) * u01(0.42, 0.58); edges.push(() => s); }
    edges.push(() => xin);
    for (let k = 0; k < edges.length - 1; k++) {
      const l = edges[k], rr = edges[k + 1], jl = k ? JOINT : 0, jr = k < edges.length - 2 ? JOINT : 0;
      let poly;
      if (last) {
        const tl = Math.max(0, (l(zt0) + jl - xt(0)) / (xt(T0) - xt(0))), tr = Math.min(T0, (rr(zti) - jr - xt(0)) / (xt(T0) - xt(0)));
        poly = [[l(z0) + jl, z0], [rr(z0) - jr, z0], [rr(z0) - jr, top(tr)], [l(zt0) + jl, top(tl)]];
      } else poly = [[l(z0) + jl, z0], [rr(z0) - jr, z0], [rr(z1) - jr, z1], [l(z1) + jl, z1]];
      blocks.push({ poly, depth: DEPTH + 0.5 + u01(-0.08, 0.08), zoff: u01(-0.04, 0.04), kind: 'pier' });
    }
  });
  const js = [0, ...armU.map(u => u + u01(-0.025, 0.025)), 1], dt = JOINT / (SPAN_HALF * (1 - T0));
  for (let i = 0; i < js.length - 1; i++) {
    const ua = js[i], ub = js[i + 1], la = 0.045 * Math.sin(Math.PI * ua), lb = 0.045 * Math.sin(Math.PI * ub);
    const T = u => T0 + u * (1 - T0), first = i === 0, lastB = i === js.length - 2;
    const taT = T(ua + la) + (first ? 0 : dt), tbT = T(ub + lb) - (lastB ? 0 : dt), taB = T(ua - la) + (first ? 0 : dt), tbB = T(ub - lb) - (lastB ? 0 : dt);
    const step = u01(-0.05, 0.07), N = 6, poly = [];
    for (let k = 0; k <= N; k++) { const t = taB + (tbB - taB) * k / N; poly.push([xt(t), bot(t)]); }
    for (let k = 0; k <= N; k++) { const t = tbT + (taT - tbT) * k / N; poly.push([xt(t), top(t) + step]); }
    const taper = 1 - 0.32 * (ua + ub) / 2;
    blocks.push({ poly, depth: (DEPTH + u01(-0.1, 0.1)) * taper, zoff: u01(-0.05, 0.05), kind: 'arm' });
  }
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
scene.background = new THREE.Color(FOG); scene.fog = new THREE.FogExp2(FOG, 0.021);

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
add(halfBlocks([0.2, 0.42, 0.63, 0.83], [1.3, 2.5], 11), false);
add(halfBlocks([0.27, 0.53, 0.79], [1.75], 23), true);
scene.add(bridge);

// seam of light: thin emissive slab between the two tips, plus a local light
const seamH = top(1) - bot(1), seam = new THREE.Mesh(new THREE.BoxGeometry(GAP * 0.55, seamH * 0.92, DEPTH * 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
seam.position.set(0, bot(1) + seamH / 2, 0); scene.add(seam);
const pl = new THREE.PointLight(0xe4eeff, 55, 9, 2); pl.position.set(0, bot(1) - 0.25, 0.4); scene.add(pl);

// terrain: calm platform, one foreground rock mass, ridgelines that fade into fog
const n = new ImprovedNoise(), tg = new THREE.PlaneGeometry(220, 220, 260, 260); tg.rotateX(-Math.PI / 2);
const ridged = (x, z, oct) => { let v = 0, a = 1, f = 1, s = 0; for (let o = 0; o < oct; o++) { const r = 1 - Math.abs(n.noise(x * f, 3.3, z * f)); v += a * r * r; s += a; a *= 0.5; f *= 2.05; } return v / s; };
const P = tg.attributes.position;
for (let i = 0; i < P.count; i++) {
  const x = P.getX(i), z = P.getZ(i), d = Math.hypot(x * 0.75, z);
  const far = Math.min(1, Math.max(0, (d - 11) / 46)) ** 1.35;
  const back = z < 0 ? 1 : 0.35;
  let h = -0.9 * (1 - Math.exp(-((d / 10) ** 2))) + far * back * (ridged(x * 0.021 + 2, z * 0.021 - 1, 6) * 26 - 7) + (0.18 + far) * n.noise(x * 0.11, 9.1, z * 0.11) * 1.4;
  const fx = x + 10.5, fz = z - 13.5, fd = Math.hypot(fx * 0.8, fz);
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

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 400);
const cams = { hero: [[-11.5, 3.1, 21.5], [0.6, 2.75, 0]], side: [[0, 2.6, 27], [0, 2.7, 0]], close: [[-3.2, 3.6, 7.2], [-0.4, 4.1, 0]], phone: [[-9, 3.4, 30], [0, 3.6, 0]] };
camera.position.set(...cams[cam][0]); camera.lookAt(...cams[cam][1]);
if (cam === 'phone') { camera.fov = 38; camera.updateProjectionMatrix(); }
renderer.render(scene, camera);
window.__spike = { tris, blocks: bridge.children.length, calls: renderer.info.render.calls, ready: true };
