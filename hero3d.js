import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const host = document.getElementById('hero3d');
const fallback = document.getElementById('hero-fallback');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'A 3D factory floor: machine, Arduino board, dashboard, cash drawer and CCTV streaming data into one Xipher core');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 14, 30);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const camBase = new THREE.Vector3(7.2, 5.6, 8.6);
  camera.position.copy(camBase);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffe2a8, 1.6); key.position.set(6, 10, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc47a, 0.35); rim.position.set(-8, 4, -6); scene.add(rim);
  const coreLight = new THREE.PointLight(0xd29a3a, 30, 12); coreLight.position.set(0, 1.6, 0); scene.add(coreLight);

  const gold = new THREE.MeshStandardMaterial({ color: 0xd29a3a, metalness: 1, roughness: 0.28, emissive: 0x3a2508, emissiveIntensity: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.4 });
  const darker = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, metalness: 0.5, roughness: 0.6 });
  const board = new THREE.MeshStandardMaterial({ color: 0x0d3b3a, metalness: 0.3, roughness: 0.55 });
  const glow = (c) => new THREE.MeshBasicMaterial({ color: c });

  const world = new THREE.Group(); scene.add(world);

  // platform
  const base = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.4, 0.25, 6), darker); base.position.y = -0.13; world.add(base);
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(6.25, 0.04, 8, 6), gold); rimRing.rotation.x = Math.PI / 2; rimRing.rotation.z = Math.PI / 6; world.add(rimRing);
  const grid = new THREE.GridHelper(11, 22, 0xd29a3a, 0x3a2a10); grid.material.transparent = true; grid.material.opacity = 0.35; grid.position.y = 0.01; world.add(grid);

  // core
  const core = new THREE.Group(); core.position.y = 1.6; world.add(core);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf5c46a, wireframe: true, transparent: true, opacity: 0.9 })); core.add(shell);
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xd29a3a, emissiveIntensity: 2.2, metalness: 0.4, roughness: 0.2 })); core.add(heart);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.03, 8, 64), gold); halo.rotation.x = Math.PI / 2.3; core.add(halo);
  const halo2 = halo.clone(); halo2.rotation.set(Math.PI / 3, 0.4, 0); core.add(halo2);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 0.7, 6), dark); pedestal.position.y = 0.35; world.add(pedestal);

  function label(text) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(10,10,10,.85)'; g.strokeStyle = '#d29a3a'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(4, 4, 504, 88, 44); g.fill(); g.stroke();
    g.fillStyle = '#f5f5f5'; g.font = '600 40px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    s.scale.set(2.6, 0.49, 1); return s;
  }

  const R = 4;
  const spots = [0, 1, 2, 3, 4].map(i => { const a = i / 5 * Math.PI * 2 + 0.3; return new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R); });
  const devices = [];
  function place(group, i, name, h) { group.position.copy(spots[i]); group.lookAt(0, 0, 0); group.rotateY(Math.PI); world.add(group); const l = label(name); l.position.set(spots[i].x, h + 0.55, spots[i].z); world.add(l); devices.push(group); }

  // 1 machine with gear
  const machine = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.1), dark); body.position.y = 0.55; machine.add(body);
  const gear = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.1, 6, 12), gold); gear.position.set(0, 0.6, 0.6); machine.add(gear);
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), glow(0x3dd68c)); sensor.position.set(0.6, 1.15, 0.3); machine.add(sensor);
  place(machine, 0, 'Machine + sensor', 1.2);

  // 2 arduino board
  const ard = new THREE.Group();
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.0), board); pcb.position.y = 0.3; ard.add(pcb);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.26, 0.8), darker); stand.position.y = 0.13; ard.add(stand);
  for (let k = 0; k < 4; k++) { const chip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.2), darker); chip.position.set(-0.45 + k * 0.3, 0.37, -0.15); ard.add(chip); }
  const pins = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.06), gold); pins.position.set(0, 0.38, 0.4); ard.add(pins);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), glow(0xff4d4d)); led.position.set(0.55, 0.4, 0.15); ard.add(led);
  place(ard, 1, 'Arduino / PCB', 0.5);

  // 3 dashboard screen
  const dash = new THREE.Group();
  const dc = document.createElement('canvas'); dc.width = 256; dc.height = 160; const dg = dc.getContext('2d'); const dtex = new THREE.CanvasTexture(dc);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.06), new THREE.MeshBasicMaterial({ map: dtex })); screen.position.set(0, 1.25, 0.06); dash.add(screen);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.2, 0.1), dark); frame.position.y = 1.25; dash.add(frame);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7), dark); pole.position.y = 0.35; dash.add(pole);
  place(dash, 2, 'Live dashboard', 1.85);
  const bars = Array.from({ length: 8 }, () => Math.random());
  function drawDash(t) {
    dg.fillStyle = '#0b0b0b'; dg.fillRect(0, 0, 256, 160);
    dg.fillStyle = '#d29a3a'; dg.font = 'bold 16px Arial'; dg.fillText('PRODUCTION · LIVE', 12, 22);
    bars.forEach((b, i) => { const v = 0.35 + 0.6 * Math.abs(Math.sin(t * 1.3 + i * 0.7)) * (0.6 + b * 0.4); const h = v * 100; dg.fillStyle = i === 5 ? '#f5c46a' : '#7a5a22'; dg.fillRect(14 + i * 29, 148 - h, 20, h); });
    dtex.needsUpdate = true;
  }

  // 4 cash drawer
  const cash = new THREE.Group();
  const till = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.2), dark); till.position.y = 0.225; cash.add(till);
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.3, 1.1), new THREE.MeshStandardMaterial({ color: 0x2c2c2c, metalness: 0.8, roughness: 0.3 })); drawer.position.set(0, 0.2, 0.06); cash.add(drawer);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), gold); handle.position.set(0, 0.2, 0.63); cash.add(handle);
  place(cash, 3, 'Cash drawer', 0.6);

  // 5 cctv
  const cam = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3), dark); post.position.y = 0.65; cam.add(post);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 16), dark); head.rotation.x = Math.PI / 2; head.position.set(0, 1.35, 0.25); cam.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), glow(0x111111)); lens.position.set(0, 1.35, 0.66); cam.add(lens);
  const rec = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), glow(0xff3b3b)); rec.position.set(0.14, 1.52, 0.5); cam.add(rec);
  place(cam, 4, 'CCTV camera', 1.6);

  // data streams
  const streams = [];
  const pulseGeo = new THREE.SphereGeometry(0.07, 10, 10);
  spots.forEach((p, i) => {
    const from = new THREE.Vector3(p.x * 0.85, 0.9, p.z * 0.85);
    const mid = new THREE.Vector3(p.x * 0.45, 2.6, p.z * 0.45);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, new THREE.Vector3(0, 1.6, 0));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.015, 6), new THREE.MeshBasicMaterial({ color: 0xd29a3a, transparent: true, opacity: 0.45 }));
    world.add(tube);
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(pulseGeo, glow(0xffd27a)); world.add(m); streams.push({ curve, m, off: k / 4 + i * 0.13 }); }
  });

  // dust
  const N = 500, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 18; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - 0.5) * 18; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd29a3a, size: 0.05, transparent: true, opacity: 0.7 }));
  scene.add(dust);

  const mouse = { x: 0, y: 0 };
  addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; });

  function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(host); resize();

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);
  const clock = new THREE.Clock();

  function frameFn() {
    const t = clock.getElapsedTime();
    world.rotation.y = t * 0.12;
    core.rotation.y = t * 0.8; shell.rotation.x = t * 0.4; heart.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    coreLight.intensity = 26 + Math.sin(t * 3) * 6;
    gear.rotation.z = t * 2.5;
    sensor.material.color.setHex(Math.sin(t * 5) > 0 ? 0x3dd68c : 0x0f4a30);
    led.material.color.setHex(Math.sin(t * 7) > 0 ? 0xff4d4d : 0x3a0f0f);
    const open = Math.max(0, Math.sin(t * 0.9));
    drawer.position.z = 0.06 + open * 0.55; handle.position.z = 0.63 + open * 0.55;
    rec.material.color.setHex(open > 0.5 ? 0xff3b3b : 0x3a0f0f);
    drawDash(t);
    devices.forEach((d, i) => { d.position.y = Math.sin(t * 1.4 + i) * 0.06; });
    streams.forEach(s => { s.m.position.copy(s.curve.getPoint((t * 0.35 + s.off) % 1)); });
    dust.rotation.y = t * 0.02;
    camera.position.set(camBase.x + mouse.x * 2.5, camBase.y - mouse.y * 1.5, camBase.z);
    camera.lookAt(0, 0.9, 0);
    renderer.render(scene, camera);
  }

  if (fallback) fallback.style.display = 'none';
  if (reduce) { frameFn(); return; }
  renderer.setAnimationLoop(() => { if (visible) frameFn(); });
}

try {
  const test = document.createElement('canvas');
  if (host && (test.getContext('webgl2') || test.getContext('webgl'))) start();
} catch (e) {
  if (fallback) fallback.style.display = '';
}
