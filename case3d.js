// Xipher Ace Solutions — case study 3D scenes (one shared WebGL renderer, visible-only rendering)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GOLD = 0xD29A3A, GOLDL = 0xF5B94A, GREEN = 0x2ECC71, RED = 0xE5484D, AMBER = 0xF5A524;
const FONT = '"Space Grotesk", Inter, system-ui, sans-serif';
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const sm = x => x * x * (3 - 2 * x);
const eo = x => 1 - Math.pow(1 - x, 3);
const bk = x => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, p) => a + (b - a) * p;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const arc = (o, a, b, p, lift) => { o.lerpVectors(a, b, p); o.y += Math.sin(Math.PI * p) * lift; return o; };
let ENV = null;

/* ---------- materials ---------- */
const std = (color, metalness = .2, roughness = .5, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = {
  gold: std(GOLD, 1, .26), goldD: std(0xA26C14, 1, .38),
  goldE: std(GOLD, .9, .3, { emissive: 0x7a4a0c, emissiveIntensity: .7 }),
  body: std(0x1b1b1e, .25, .42), body2: std(0x2a2a2f, .3, .5), black: std(0x0c0c0e, .3, .22),
  grey: std(0x4a4b50, .6, .45), steel: std(0xa6abb2, 1, .28), white: std(0xe9e7e2, 0, .55),
  paper: std(0xf4f1ea, 0, .85, { side: THREE.DoubleSide }), stone: std(0x1d1d21, .1, .32),
  rubber: std(0x111111, 0, .8), skin: std(0xc58b68, 0, .6), pcb: std(0x0d3b8a, .2, .45),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x15171a, metalness: 0, roughness: .06, transparent: true, opacity: .5, clearcoat: 1 }),
  floor: std(0x0f0f11, .3, .62),
};
const emis = (c, i = 2.2) => std(c, 0, .4, { emissive: c, emissiveIntensity: i });
const rbox = (w, h, d, r = .05, m = M.body) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001)), m);
const cyl = (rt, rb, h, m, s = 32) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
const at = (o, x, y, z) => (o.position.set(x, y, z), o);
const shadow = g => g.traverse(o => { if (o.isMesh && !(o.material.isMeshBasicMaterial)) { o.castShadow = true; o.receiveShadow = true; } });

/* ---------- canvas textures ---------- */
function rr(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function T(x, s, X, Y, size = 24, color = '#F5F5F5', weight = 600, align = 'left') { x.font = `${weight} ${size}px ${FONT}`; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'middle'; x.fillText(s, X, Y); }
function cTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const o = { c, x, t, key: null, draw(...a) { const k = JSON.stringify(a); if (k === o.key) return; o.key = k; x.clearRect(0, 0, w, h); draw(x, w, h, ...a); t.needsUpdate = true; } };
  o.draw(); return o;
}
const ALL_TEX = [];
const tex = (w, h, draw) => { const o = cTex(w, h, draw); ALL_TEX.push(o); return o; };
function plane(w, h, ct, basic = true, extra = {}) {
  const m = basic ? new THREE.MeshBasicMaterial({ map: ct.t, toneMapped: false, transparent: true, side: THREE.DoubleSide, ...extra })
                  : new THREE.MeshStandardMaterial({ map: ct.t, roughness: .8, transparent: true, side: THREE.DoubleSide, ...extra });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}
function ui(x, w, h, title, sub) {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#121216'); g.addColorStop(1, '#0a0a0c'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = '#1a1a1f'; x.fillRect(0, 0, w, h * .16); x.fillStyle = '#D29A3A'; x.fillRect(0, h * .16 - 3, w, 3);
  T(x, title, w * .05, h * .08, h * .075, '#F5B94A', 700); if (sub) T(x, sub, w * .95, h * .08, h * .055, '#9a9a9a', 500, 'right');
}
let GLOWT;
function glowTex() {
  if (GLOWT) return GLOWT; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); GLOWT = new THREE.CanvasTexture(c); return GLOWT;
}
const glow = (color, s = 1, o = 1) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: o, toneMapped: false })); sp.scale.setScalar(s); return sp; };
function tag(text, { color = '#F5B94A', border = '#D29A3A', h = .34, bg = 'rgba(12,12,14,.88)' } = {}) {
  const fs = 44, pad = 26; const mc = document.createElement('canvas').getContext('2d'); mc.font = `700 ${fs}px ${FONT}`;
  const w = Math.ceil(mc.measureText(text).width + pad * 2), H = fs + 30;
  const ct = tex(w, H, (x, W, Hh, s = text, c = color, b = border) => { rr(x, 3, 3, W - 6, Hh - 6, 16); x.fillStyle = bg; x.fill(); x.lineWidth = 3; x.strokeStyle = b; x.stroke(); T(x, s, W / 2, Hh / 2 + 2, fs, c, 700, 'center'); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct.t, transparent: true, toneMapped: false, depthWrite: false }));
  sp.scale.set(h * w / H, h, 1); sp.userData.ct = ct; sp.renderOrder = 5; return sp;
}
function check(color = '#2ECC71') {
  const ct = tex(128, 128, x => { x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fillStyle = color; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 12; x.lineCap = x.lineJoin = 'round'; x.beginPath(); x.moveTo(36, 66); x.lineTo(56, 86); x.lineTo(94, 46); x.stroke(); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct.t, transparent: true, toneMapped: false, depthWrite: false })); sp.renderOrder = 6; return sp;
}

/* ---------- reusable devices ---------- */
function monitor(w, h, ct, stand = true) {
  const g = new THREE.Group(), head = new THREE.Group();
  head.add(rbox(w + .12, h + .12, .08, .04, M.black));
  const s = plane(w, h, ct); s.position.z = .042; head.add(s);
  const strip = rbox(w * .25, .018, .012, .006, M.gold); strip.position.set(0, -(h + .12) / 2 + .03, .045); head.add(strip);
  if (stand) {
    g.add(at(rbox(w * .45, .05, .45, .025, M.body), 0, .025, 0));
    g.add(at(rbox(.1, h * .55, .07, .03, M.body2), 0, h * .3, -.08));
    head.position.set(0, h * .55 + (h + .12) / 2, -.04); head.rotation.x = -.06;
  } else head.position.y = (h + .12) / 2;
  g.add(head); g.userData.head = head; return g;
}
function cashDrawer(W = 1.9, H = .48, D = 1.6) {
  const g = new THREE.Group(), t = .04;
  [[W, t, D, 0, t / 2, 0], [W, t, D, 0, H - t / 2, 0], [t, H, D, -W / 2 + t / 2, H / 2, 0], [t, H, D, W / 2 - t / 2, H / 2, 0], [W, H, t, 0, H / 2, -D / 2 + t / 2]]
    .forEach(([w, h, d, x, y, z]) => g.add(at(rbox(w, h, d, .015, M.body), x, y, z)));
  const tray = new THREE.Group();
  const front = rbox(W - .02, H - .03, .06, .03, M.body2); front.position.set(0, H / 2, D / 2); tray.add(front);
  tray.add(at(rbox(W * .3, .03, .03, .012, M.gold), 0, H * .62, D / 2 + .035));
  tray.add(at(cyl(.035, .035, .03, M.steel), W * .35, H * .55, D / 2 + .035)).rotation.x = Math.PI / 2;
  tray.add(at(rbox(W - .14, .03, D - .1, .01, M.body), 0, .07, 0));
  const notes = [0x5f9a63, 0x4b7cb3, 0xb27c3f, 0x8b5ea6, 0x6c8f8f];
  for (let i = 0; i < 5; i++) {
    const x = -W / 2 + .2 + i * (W - .3) / 5 + .08;
    tray.add(at(rbox(.03, .16, D * .55, .01, M.grey), x - .19, .17, -D * .15));
    for (let k = 0; k < 5; k++) tray.add(at(rbox(.3, .012, D * .5, .004, std(notes[i], 0, .7)), x, .1 + k * .015, -D * .15 + (k % 2) * .01));
  }
  for (let i = 0; i < 6; i++) { const cu = cyl(.11, .1, .07, M.steel, 24); cu.position.set(-W / 2 + .25 + i * (W - .4) / 5, .12, D * .32); tray.add(cu); }
  g.add(tray); g.userData.tray = tray; return g;
}
function dome() {
  const g = new THREE.Group();
  g.add(cyl(.34, .34, .07, M.white, 40));
  const head = new THREE.Group(); head.position.y = -.05; g.add(head);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.2, 32, 16), M.black); ball.position.y = -.08; head.add(ball);
  const lens = cyl(.075, .085, .14, M.black, 24); lens.rotation.x = Math.PI / 2; lens.position.set(0, -.1, .16); head.add(lens);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.085, .012, 8, 24), emis(RED, 2)); ring.position.set(0, -.1, .23); head.add(ring);
  const gl = new THREE.Mesh(new THREE.SphereGeometry(.3, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.glass); gl.position.y = -.035; g.add(gl);
  g.userData.head = head; g.userData.lens = lens; return g;
}
function nano() {
  const g = new THREE.Group();
  g.add(at(rbox(.56, .035, .2, .01, M.pcb), 0, .03, 0));
  g.add(at(rbox(.13, .03, .13, .01, M.black), .03, .06, 0)).rotation.y = Math.PI / 4;
  g.add(at(rbox(.1, .05, .08, .01, M.steel), -.29, .065, 0));
  const pinG = new THREE.BoxGeometry(.018, .06, .018), pins = new THREE.InstancedMesh(pinG, M.gold, 30), m4 = new THREE.Matrix4();
  for (let i = 0; i < 30; i++) { m4.makeTranslation(-.24 + (i % 15) * .034, .015, i < 15 ? .085 : -.085); pins.setMatrixAt(i, m4); }
  g.add(pins);
  const led = new THREE.Mesh(new THREE.SphereGeometry(.018, 12, 8), emis(GREEN, .3)); led.position.set(.2, .06, .05); g.add(led);
  const lg = glow(GREEN, .35, 0); lg.position.copy(led.position); g.add(lg);
  g.userData.led = led; g.userData.lg = lg; return g;
}
function router() {
  const g = new THREE.Group();
  g.add(at(rbox(1.0, .16, .66, .06, M.black), 0, .08, 0));
  [-.35, 0, .35].forEach((x, i) => { const a = cyl(.03, .035, .75, M.black, 16); a.position.set(x, .5, -.28); a.rotation.z = (i - 1) * -.25; g.add(a); });
  const leds = []; for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), emis(GREEN, 2)); l.position.set(-.3 + i * .12, .11, .335); g.add(l); leds.push(l); }
  const lg = glow(GREEN, .7, .8); lg.position.set(-.12, .12, .4); g.add(lg);
  g.userData.leds = leds; g.userData.lg = lg; return g;
}
function cloud(s = 1) {
  const g = new THREE.Group(), m = std(0xc9ced8, .1, .32, { emissive: 0x1a1612, emissiveIntensity: .3 });
  [[0, 0, 0, .55], [.55, -.1, 0, .42], [-.55, -.12, 0, .4], [.25, .3, -.05, .42], [-.25, .25, .05, .38], [0, -.15, .25, .4]]
    .forEach(([x, y, z, r]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), m); b.position.set(x, y, z); g.add(b); });
  const gl = glow(GOLDL, 2.6, .35); g.add(gl); g.userData.gl = gl; g.userData.mat = m; g.scale.setScalar(s); return g;
}
function receiptPrinter(s = 1) {
  const g = new THREE.Group();
  g.add(at(rbox(1.15, .62, 1.2, .14, M.body), 0, .31, 0));
  g.add(at(rbox(1.1, .1, .8, .05, M.black), 0, .64, -.18));
  g.add(at(rbox(.9, .02, .05, .01, M.rubber), 0, .66, .26));
  g.add(at(rbox(.18, .05, .02, .01, M.gold), -.38, .36, .605));
  const led = new THREE.Mesh(new THREE.SphereGeometry(.02, 10, 8), emis(GREEN, 2)); led.position.set(.42, .36, .605); g.add(led);
  g.scale.setScalar(s); return g;
}
function paperStrip(w, Hmax, ct) {
  const geo = new THREE.PlaneGeometry(w, Hmax); geo.translate(0, Hmax / 2, 0);
  const t = ct.t; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: .85, side: THREE.DoubleSide, transparent: true }));
  m.userData.set = f => { f = Math.max(.001, f); m.scale.y = f; t.repeat.set(1, f); t.offset.set(0, 1 - f); };
  m.castShadow = true; return m;
}
function phone(w, h, ct) {
  const g = new THREE.Group(); g.add(rbox(w, h, .08, .09, M.black));
  const s = plane(w * .9, h * .92, ct); s.position.z = .042; g.add(s);
  g.add(at(rbox(w * .25, .015, .01, .005, M.grey), 0, h * .44, .042)); return g;
}
function laptop(w, ct) {
  const g = new THREE.Group(), d = w * .68;
  g.add(at(rbox(w, .05, d, .03, M.grey), 0, .025, 0));
  g.add(at(rbox(w * .85, .006, d * .5, .003, M.black), 0, .052, -d * .08));
  const lid = new THREE.Group(); lid.position.set(0, .05, -d / 2); lid.rotation.x = -.22; g.add(lid);
  lid.add(at(rbox(w, d * .95, .035, .03, M.grey), 0, d * .475, 0));
  const s = plane(w * .9, d * .82, ct); s.position.set(0, d * .475, .02); lid.add(s); return g;
}
function wire(points, color = 0x333338, r = .018) {
  const c = new THREE.CatmullRomCurve3(points); const m = new THREE.Mesh(new THREE.TubeGeometry(c, 64, r, 8, false), std(color, .1, .6));
  m.userData.curve = c; m.castShadow = true; return m;
}
function beam(a, b, color = GOLD, r = .012, o = .45) {
  const d = b.clone().sub(a), L = d.length(); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m;
}

/* ---------- scene shell ---------- */
function stage(o = {}) {
  const bg = o.bg ?? 0x0b0b0b, s = new THREE.Scene();
  s.background = new THREE.Color(bg); s.fog = new THREE.Fog(bg, o.fogN ?? 12, o.fogF ?? 26); s.environment = ENV;
  const c = new THREE.PerspectiveCamera(o.fov ?? 32, 1.8, .1, 80);
  s.add(new THREE.HemisphereLight(0xfff4e6, 0x1a1410, .5));
  const k = new THREE.DirectionalLight(0xfff1dc, 2.3); k.position.set(4, 9, 6); k.castShadow = true;
  const sh = k.shadow; sh.mapSize.set(1024, 1024); Object.assign(sh.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 26 }); sh.bias = -.0004; sh.normalBias = .02;
  s.add(k);
  const rim = new THREE.DirectionalLight(0xffb45a, 1.5); rim.position.set(-6, 4, -6); s.add(rim);
  if (o.floor !== false) {
    const f = new THREE.Mesh(new THREE.CircleGeometry(16, 64), M.floor); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; s.add(f);
    const gr = new THREE.GridHelper(32, 40, GOLD, 0x2a2a2a); gr.material.transparent = true; gr.material.opacity = .1; gr.position.y = .003; s.add(gr);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(o.ring ?? 4.4, .014, 8, 128), emis(GOLD, 1.4)); ring.rotation.x = Math.PI / 2; ring.position.y = .01; s.add(ring);
  }
  return { s, c, base: V(...(o.cam ?? [0, 3.4, 9])), look: V(...(o.look ?? [0, 1.2, 0])), ar: o.ar ?? 1.8, period: o.period ?? 10, still: o.still ?? 4, update: () => {}, mx: 0, my: 0, orbit: o.orbit ?? .1 };
}

/* ================= SCENES ================= */
const S = {};

/* HERO — shop counter on a gold network */
S.hero = () => {
  const sc = stage({ cam: [0, 3.9, 10.2], look: [0, 1.75, 0], fov: 33, ar: 2.15, period: 9, still: 2.6, ring: 5.2, fogN: 14, fogF: 30, bg: 0x0d0d0d });
  const s = sc.s, g = new THREE.Group(); s.add(g);
  // counter
  g.add(at(rbox(8.4, 1.36, 1.9, .04, M.body), 0, .68, 0));
  g.add(at(rbox(8.6, .12, 2.1, .05, M.stone), 0, 1.42, 0));
  g.add(at(rbox(8.62, .035, .035, .015, M.gold), 0, 1.36, 1.06));
  for (let i = 0; i < 5; i++) g.add(at(rbox(1.5, 1.1, .03, .02, M.body2), -3.3 + i * 1.65, .68, .965));
  const top = 1.48;
  // drawer + POS
  const dr = cashDrawer(1.7, .42, 1.4); dr.position.set(-1.6, top, .1); g.add(dr);
  const posT = tex(640, 400, (x, w, h, n = 0, open = 0) => {
    ui(x, w, h, 'SaedOne POS', 'Counter 1');
    const items = [['Capacitor 25µF', 2], ['Bearing 6203', 4], ['Motor brush', 2], ['Timer switch', 1]];
    items.slice(0, n).forEach(([a, q], i) => { T(x, a, 30, 110 + i * 46, 26, '#e6e6e6', 500); T(x, '× ' + q, w - 30, 110 + i * 46, 26, '#9a9a9a', 500, 'right'); x.fillStyle = '#1f1f24'; x.fillRect(30, 132 + i * 46, w - 60, 2); });
    rr(x, 24, h - 86, w - 48, 62, 12); x.fillStyle = open ? '#1f5f3a' : '#2a2116'; x.fill();
    T(x, open ? 'Sale #1043 · Drawer opened' : 'Total  Rs ••••', w / 2, h - 55, 28, open ? '#7ff0a8' : '#F5B94A', 700, 'center');
  });
  const mon = monitor(1.5, .94, posT); mon.position.set(-1.6, top + .42, -.1); g.add(mon);
  // printer + receipt
  const pr = receiptPrinter(.62); pr.position.set(.15, top, .2); g.add(pr);
  const rct = tex(256, 512, x => { x.fillStyle = '#f7f4ec'; x.fillRect(0, 0, 256, 512); T(x, 'SaedOne POS', 128, 40, 24, '#111', 700, 'center'); T(x, 'Sale #1043', 128, 72, 18, '#444', 500, 'center');
    for (let i = 0; i < 7; i++) { x.fillStyle = '#9a968e'; x.fillRect(24, 110 + i * 34, 120 + (i * 37) % 70, 8); x.fillRect(190, 110 + i * 34, 40, 8); }
    x.fillStyle = '#111'; x.fillRect(24, 360, 208, 3); T(x, 'TOTAL  Rs ••••', 128, 395, 22, '#111', 700, 'center'); for (let i = 0; i < 40; i++) { x.fillRect(40 + i * 4.4, 430, (i % 3) + 1, 50); } });
  const paper = paperStrip(.42, .9, rct); paper.position.set(.15, top + .4, .36); paper.rotation.x = -.25; g.add(paper);
  // ZKTeco
  const zk = new THREE.Group(); zk.position.set(2.5, top, .1); g.add(zk);
  zk.add(at(rbox(.5, .06, .4, .03, M.body), 0, .03, 0)); zk.add(at(rbox(.08, .45, .08, .03, M.body2), 0, .27, 0));
  const zkb = rbox(.7, 1.05, .2, .07, M.body); zkb.position.set(0, .95, 0); zk.add(zkb);
  const zkt = tex(256, 180, (x, w, h, ok = 0) => { x.fillStyle = '#0b1420'; x.fillRect(0, 0, w, h); T(x, ok ? 'Verified' : '09:02', w / 2, 60, 42, ok ? '#7ff0a8' : '#e6e6e6', 700, 'center'); T(x, ok ? 'Staff 01 · IN' : 'Place finger', w / 2, 125, 26, '#9ab', 500, 'center'); });
  const zs = plane(.5, .35, zkt); zs.position.set(0, 1.22, .102); zk.add(zs);
  const sens = new THREE.Mesh(new THREE.PlaneGeometry(.2, .24), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: .15, toneMapped: false })); sens.position.set(0, .7, .103); zk.add(sens);
  zk.add(at(rbox(.26, .3, .02, .02, M.glass), 0, .7, .1));
  const zg = glow(GREEN, .8, 0); zg.position.set(0, .7, .2); zk.add(zg);
  // CCTV pole + dome
  g.add(at(cyl(.06, .07, 4.2, M.body2), -3.6, 2.1, -1.4));
  const arm = rbox(1.9, .08, .08, .03, M.body2); arm.position.set(-2.65, 4.1, -1.4); g.add(arm);
  const dm = dome(); dm.position.set(-1.8, 3.98, -1.4); dm.rotation.x = Math.PI; dm.rotation.x = 0; g.add(dm);
  const fl = glow(0xffffff, 1.6, 0); fl.position.set(-1.8, 3.7, -1.2); g.add(fl);
  const fpl = new THREE.PointLight(0xffffff, 0, 6); fpl.position.set(-1.8, 3.5, -.8); g.add(fpl);
  // core
  const core = new THREE.Group(); core.position.set(.9, 3.7, -2.2); g.add(core);
  const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: .25, wireframe: true, emissive: 0x6b4210, emissiveIntensity: 1 }));
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(.3, 2), emis(GOLDL, 3)); core.add(ico, heart, glow(GOLDL, 2.2, .7));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(.85, .015, 8, 96), emis(GOLD, 2)); halo.rotation.x = 1.2; core.add(halo);
  const lab = tag('SaedOne', { h: .3 }); lab.position.set(0, -.95, 0); core.add(lab);
  // network
  const nodes = [V(-1.6, top + 1.9, 0), V(.15, top + .5, .2), V(2.5, top + 1.5, .1), V(-1.8, 3.8, -1.4), V(-1.6, top + .3, .9)];
  const pulses = [];
  nodes.forEach((n, i) => {
    const mid = n.clone().lerp(core.position, .5); mid.y += .8;
    const c = new THREE.QuadraticBezierCurve3(n, mid, core.position.clone());
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, .01, 6), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .4, toneMapped: false })));
    for (let k = 0; k < 2; k++) { const p = glow(GOLDL, .28, .95); g.add(p); pulses.push({ p, c, o: k / 2 + i * .13 }); }
  });
  const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 900 }, () => (Math.random() - .5) * 14).map((v, i) => i % 3 === 1 ? Math.abs(v) * .45 : v), 3)),
    new THREE.PointsMaterial({ color: GOLDL, size: .03, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(dust); shadow(g); paper.castShadow = true;
  const tmp = V();
  sc.update = (t, T9) => {
    const k = T9;
    posT.draw(Math.min(4, Math.floor(k / .5)), k > 3.1 && k < 6.6 ? 1 : 0);
    paper.userData.set(sm(seg(k, 2.1, 3.1)) * (1 - seg(k, 7.4, 7.6)));
    const open = sm(seg(k, 3, 3.6)) * (1 - sm(seg(k, 6.2, 6.8))); dr.userData.tray.position.z = open * .75;
    const aim = sm(seg(k, 3, 3.5)) * (1 - sm(seg(k, 6, 6.8)));
    dm.userData.head.rotation.y = lerp(Math.sin(t * .5) * .8, .05, aim); dm.userData.head.rotation.x = lerp(.25, .75, aim);
    const f = Math.max(0, 1 - Math.abs(k - 3.8) * 5); fl.material.opacity = f; fpl.intensity = f * 18;
    const zz = seg(k, 5, 5.6) * (1 - seg(k, 7.2, 7.4)); zg.material.opacity = zz * (.6 + .4 * Math.sin(t * 20)); sens.material.opacity = .15 + zz * .6; zkt.draw(zz > .5 ? 1 : 0);
    ico.rotation.y = t * .5; ico.rotation.x = t * .2; halo.rotation.z = t * .6; heart.scale.setScalar(1 + .08 * Math.sin(t * 3));
    pulses.forEach(q => q.p.position.copy(q.c.getPoint((t * .35 + q.o) % 1)));
    dust.rotation.y = t * .02;
    const a = Math.sin(t * .13) * .42; sc.base.set(Math.sin(a) * 10.2, 3.9, Math.cos(a) * 10.2);
  };
  return sc;
};

/* 1 — Migration */
S[1] = () => {
  const sc = stage({ cam: [1.3, 3.4, 8.8], look: [0, 1.25, 0], period: 9, still: 4.2 });
  const g = new THREE.Group(); sc.s.add(g);
  const old = new THREE.Group(); old.position.set(-2.7, 0, 0); g.add(old);
  old.add(at(rbox(1.2, 2.5, 1.1, .05, std(0x3b3c40, .55, .55)), 0, 1.25, 0));
  const oldLeds = [];
  for (let i = 0; i < 6; i++) { old.add(at(rbox(1.04, .3, .04, .02, std(0x2b2c30, .5, .6)), 0, .35 + i * .36, .56)); const l = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), emis(i % 2 ? AMBER : GREEN, 1.6)); l.position.set(.4, .35 + i * .36, .59); old.add(l); oldLeds.push(l); }
  const ol = tag('OLD ERP', { color: '#bbbbbb', border: '#555' }); ol.position.set(0, 2.95, 0); old.add(ol);
  const nw = new THREE.Group(); nw.position.set(2.7, 0, 0); g.add(nw);
  nw.add(at(rbox(1.2, 2.5, 1.1, .06, M.black), 0, 1.25, 0));
  for (let i = 0; i < 2; i++) nw.add(at(new THREE.Mesh(new THREE.BoxGeometry(.03, 2.3, .03), emis(GOLD, 2.2)), -.5 + i, 1.25, .56));
  const cnt = tex(256, 128, (x, w, h, n = 0, ok = 0) => { x.fillStyle = '#0d0d10'; x.fillRect(0, 0, w, h); T(x, 'IMPORTED', w / 2, 30, 20, '#9a9a9a', 600, 'center'); T(x, ok ? 'Verified' : n.toLocaleString(), w / 2, 84, 46, ok ? '#7ff0a8' : '#F5B94A', 700, 'center'); });
  const cs = plane(.8, .4, cnt); cs.position.set(0, 2.1, .565); nw.add(cs);
  for (let i = 0; i < 4; i++) { nw.add(at(rbox(.9, .2, .03, .02, M.body), 0, .4 + i * .32, .56)); nw.add(at(new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 6), emis(GOLDL, 2)), .35, .4 + i * .32, .59)); }
  const ng = glow(GOLDL, 3, .25); ng.position.set(0, 1.4, .8); nw.add(ng);
  const nl = tag('SaedOne'); nl.position.set(0, 2.95, 0); nw.add(nl);
  // conveyor
  const belt = tex(256, 64, x => { x.fillStyle = '#151518'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#2a2a30'; for (let i = 0; i < 8; i++) x.fillRect(i * 32, 0, 14, 64); x.fillStyle = '#D29A3A'; x.fillRect(0, 0, 256, 3); x.fillRect(0, 61, 256, 3); });
  belt.t.wrapS = THREE.RepeatWrapping; belt.t.repeat.set(5, 1);
  const bm = new THREE.Mesh(new THREE.BoxGeometry(3.6, .08, .75), [M.body, M.body, new THREE.MeshStandardMaterial({ map: belt.t, roughness: .7 }), M.body, M.body, M.body]); bm.position.set(0, .95, 0); g.add(bm);
  [-1.8, 1.8].forEach(x => { const r = cyl(.07, .07, .8, M.steel); r.rotation.x = Math.PI / 2; r.position.set(x, .95, 0); g.add(r); });
  [-1.5, 1.5].forEach(x => [-.3, .3].forEach(z => g.add(at(rbox(.07, .9, .07, .02, M.body2), x, .45, z))));
  const kinds = ['SKU', 'CUST', 'PRICE'].map(k => tex(128, 128, x => { x.fillStyle = '#17171a'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#D29A3A'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120); T(x, k, 64, 66, k.length > 4 ? 30 : 36, '#F5B94A', 700, 'center'); }));
  const cubes = Array.from({ length: 7 }, (_, i) => { const m = new THREE.Mesh(new RoundedBoxGeometry(.36, .36, .36, 3, .05), new THREE.MeshStandardMaterial({ map: kinds[i % 3].t, metalness: .4, roughness: .4, emissive: 0x3a2508, emissiveMap: kinds[i % 3].t, emissiveIntensity: .9 })); m.castShadow = true; g.add(m); return m; });
  shadow(old); shadow(nw);
  const a = V(-2.1, 1.17, 0), b = V(2.1, 1.17, 0);
  sc.update = (t, k) => {
    belt.t.offset.x = -t * .55;
    cubes.forEach((c, i) => { const p = ((t * .2 + i / 7) % 1); c.position.lerpVectors(a, b, p); c.position.y = 1.17 + (p < .08 ? (p / .08 - 1) * .0 : 0); const sIn = sm(seg(p, 0, .08)), sOut = 1 - sm(seg(p, .9, 1)); c.scale.setScalar(Math.max(.001, sIn * sOut)); c.rotation.y = p * .6; });
    oldLeds.forEach((l, i) => l.material.emissiveIntensity = (Math.sin(t * 3 + i * 1.7) > .2) ? 1.8 : .2);
    const n = Math.floor(seg(k, 0, 7) * 1248); cnt.draw(n, k > 7.2 ? 1 : 0); ng.material.opacity = .2 + .1 * Math.sin(t * 2);
  };
  return sc;
};

/* 2 — Offline POS with pending sync */
S[2] = () => {
  const sc = stage({ cam: [.3, 3.5, 9.4], look: [.2, 1.45, 0], period: 12, still: 6.8 });
  const g = new THREE.Group(); sc.s.add(g);
  g.add(at(rbox(1.9, .7, 1.2, .05, M.body2), -2.4, .35, 0));
  const posT = tex(512, 320, (x, w, h, st = 0, n = 0) => {
    ui(x, w, h, 'SaedOne POS', st === 1 ? 'OFFLINE' : 'ONLINE');
    const c = st === 1 ? '#E5484D' : '#2ECC71'; x.beginPath(); x.arc(w - 150, h * .08, 9, 0, 7); x.fillStyle = c; x.fill();
    T(x, st === 1 ? 'Internet down — billing continues' : st === 2 ? 'Syncing pending bills…' : st === 3 ? 'All bills synced' : 'Billing · live', w / 2, 120, 28, '#e6e6e6', 600, 'center');
    rr(x, 60, 170, w - 120, 90, 14); x.fillStyle = st === 1 ? '#3a2410' : '#132a1d'; x.fill();
    T(x, st === 3 ? '0 pending' : `${n} pending sync`, w / 2, 215, 38, st === 1 ? '#F5A524' : '#7ff0a8', 700, 'center');
  });
  const mon = monitor(1.45, .9, posT); mon.position.set(-2.4, .7, 0); g.add(mon);
  const rt = router(); rt.position.set(.5, 0, .2); g.add(rt);
  g.add(at(rbox(1.4, .02, 1, .01, M.body2), .5, .005, .2));
  const waves = [0, 1, 2].map(i => { const w = new THREE.Mesh(new THREE.TorusGeometry(.4, .025, 8, 48, Math.PI * .7), new THREE.MeshBasicMaterial({ color: GOLDL, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })); w.rotation.z = Math.PI * .15; w.position.set(.5, .9, .2); g.add(w); return w; });
  const cl = cloud(1); cl.position.set(2.8, 3.05, -.6); g.add(cl);
  const off = tag('OFFLINE', { color: '#ff8a8e', border: '#E5484D' }); off.position.set(.5, 1.95, .2); g.add(off);
  const ck = check(); ck.position.set(2.8, 3.95, -.4); g.add(ck);
  const billT = tex(200, 260, (x, w, h, pending = 1) => { rr(x, 4, 4, w - 8, h - 8, 16); x.fillStyle = '#f6f2e9'; x.fill(); x.fillStyle = pending ? '#F5A524' : '#2ECC71'; rr(x, 4, 4, w - 8, 54, 16); x.fill(); x.fillRect(4, 40, w - 8, 18);
    T(x, pending ? 'PENDING' : 'SYNCED', w / 2, 34, 24, '#111', 700, 'center'); for (let i = 0; i < 5; i++) { x.fillStyle = '#b5b0a5'; x.fillRect(22, 84 + i * 28, 90 + (i * 29) % 60, 9); } x.fillStyle = '#111'; x.fillRect(22, 228, w - 44, 4); });
  const bills = Array.from({ length: 5 }, () => { const m = plane(.5, .66, billT); g.add(m); return m; });
  const bg = glow(AMBER, 1.6, 0); bg.position.set(-.95, 1.6, .3); g.add(bg);
  const src = V(-2.4, 1.6, .3), cl0 = cl.position.clone(), tmp = V();
  const stack = i => V(-1.05 + (i % 2) * .08, .95 + i * .22, .35 + i * .02);
  sc.update = (t, k) => {
    const offline = k > 3 && k < 7.8, st = k < 3 ? 0 : offline ? 1 : k < 10.4 ? 2 : 3;
    const n = st === 1 ? Math.min(4, Math.floor(seg(k, 3.4, 7.4) * 4.99)) : st === 2 ? 4 - Math.min(4, Math.floor(seg(k, 8.2, 10.4) * 4.99)) : 0;
    posT.draw(st, n);
    rt.userData.leds.forEach((l, i) => { const c = offline ? RED : GREEN; l.material.color.setHex(c); l.material.emissive.setHex(c); l.material.emissiveIntensity = offline ? (i === 0 ? 2.4 * (Math.sin(t * 8) > 0) : .4) : (Math.sin(t * 9 + i * 2) > -.3 ? 2.2 : .6); });
    rt.userData.lg.material.color.setHex(offline ? RED : GREEN);
    waves.forEach((w, i) => { const p = (t * .7 + i / 3) % 1; w.scale.setScalar(.6 + p * 2.2); w.material.opacity = offline ? 0 : (1 - p) * .9; });
    off.material.opacity = sm(seg(k, 3, 3.4)) * (1 - sm(seg(k, 7.6, 7.9)));
    bills.forEach((b, i) => {
      b.visible = true; let p;
      if (i === 4) { p = seg(k, .8, 2.4); b.visible = p > 0 && p < 1; arc(b.position, src, cl0, eo(p), 1); b.scale.setScalar(Math.max(.001, 1 - p * .7)); b.material.opacity = 1; return; }
      const born = 3.4 + i * 1, s1 = bk(seg(k, born, born + .6)), fly = 8.2 + i * .55, p2 = sm(seg(k, fly, fly + .9));
      b.visible = k > born && p2 < 1; if (!b.visible) return;
      const st0 = stack(i); b.position.lerpVectors(src, st0, s1); if (p2 > 0) arc(b.position, st0, cl0, p2, 1.2);
      b.scale.setScalar(Math.max(.001, (.4 + .6 * s1) * (1 - p2 * .7))); b.rotation.z = Math.sin(t * 2 + i) * .04 * (1 - p2); b.material.opacity = 1;
    });
    billT.draw(1); bg.material.opacity = (st === 1 || st === 2) ? .5 * (n / 4) + .1 * Math.sin(t * 4) : 0;
    const pulse = st === 2 ? .5 + .3 * Math.sin(t * 10) : .3; cl.userData.gl.material.opacity = pulse;
    const ckp = bk(seg(k, 10.5, 11)); ck.scale.setScalar(Math.max(.001, ckp * .7 * (1 - seg(k, 11.7, 12)))); ck.position.y = 3.95 + .05 * Math.sin(t * 3);
    cl.position.y = 3.05 + .08 * Math.sin(t * 1.2);
  };
  shadow(mon); shadow(rt); return sc;
};

/* 3 — Online POS: cloud + devices in sync */
S[3] = () => {
  const sc = stage({ cam: [0, 3.5, 9.6], look: [0, 1.55, 0], period: 10, still: 3 });
  const g = new THREE.Group(); sc.s.add(g);
  const cl = cloud(1.25); cl.position.set(0, 2.4, 0); g.add(cl);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, .012, 8, 160), emis(GOLD, 1.6)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.1; g.add(ring);
  const draw = (x, w, h, n = 128, portrait = 0) => { ui(x, w, h, 'SaedOne', 'LIVE'); const big = portrait ? 64 : 52;
    T(x, "Today's bills", w / 2, h * .34, portrait ? 34 : 28, '#9a9a9a', 500, 'center'); T(x, String(n), w / 2, h * .5, big, '#F5B94A', 700, 'center');
    const bars = [.4, .55, .5, .7, .62, .85, .9]; const bw = w * .09; bars.forEach((v, i) => { x.fillStyle = i === 6 ? '#D29A3A' : '#2e2e35'; x.fillRect(w * .12 + i * bw * 1.3, h * .92 - v * h * .28, bw, v * h * .28); }); };
  const land = tex(512, 320, (x, w, h, n) => draw(x, w, h, n, 0)), port = tex(300, 560, (x, w, h, n) => draw(x, w, h, n, 1));
  const desk = monitor(1.3, .8, land), lap = laptop(1.25, land), ph = phone(.55, 1.05, port);
  const devs = [desk, lap, ph].map((d, i) => { const holder = new THREE.Group(); holder.add(d); g.add(holder); shadow(d); return holder; });
  ph.position.y = .6; lap.position.y = .05; desk.position.y = 0;
  const base = [new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, .08, 40), M.body2), new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, .08, 40), M.body2), new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, .08, 40), M.body2)];
  base.forEach((b, i) => { devs[i].add(b); b.position.y = .04; b.receiveShadow = true; });
  const beams = devs.map(() => { const b = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: GOLDL, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); g.add(b); return b; });
  const pul = devs.map(() => { const p = glow(GOLDL, .35, 1); g.add(p); return p; });
  const tmp = V(), up = V(0, 1, 0), cam = V();
  sc.update = (t, k, c) => {
    const n = 128 + Math.floor(t / 1.6) % 40; land.draw(n); port.draw(n);
    devs.forEach((d, i) => { const a = t * .25 + i * Math.PI * 2 / 3; d.position.set(Math.sin(a) * 2.7, 1.1 - .05, Math.cos(a) * 2.7); d.position.y = .0 + (i === 2 ? .3 : 0) + .9;
      d.rotation.y = Math.atan2(c.position.x - d.position.x, c.position.z - d.position.z);
      const top = d.position.clone(); top.y += .7; const dir = cl.position.clone().sub(top); const L = dir.length();
      beams[i].position.copy(top).addScaledVector(dir, .5); beams[i].scale.y = L; beams[i].quaternion.setFromUnitVectors(up, dir.normalize());
      const p = (t * .8 + i * .33) % 1; pul[i].position.lerpVectors(top, cl.position, p < .5 ? p * 2 : 2 - p * 2); });
    cl.rotation.y = t * .15; cl.userData.gl.material.opacity = .35 + .1 * Math.sin(t * 2);
  };
  return sc;
};

/* 4 — Roles & permissions */
S[4] = () => {
  const sc = stage({ cam: [0, 3.1, 9.6], look: [0, 1.6, 0], period: 9, still: 1.6 });
  const g = new THREE.Group(); sc.s.add(g);
  const roles = [['OWNER', ['Billing', 'Products', 'Purchases', 'Returns', 'Reports']], ['ADMIN', ['Billing', 'Products', 'Purchases']], ['CASHIER', ['Billing', 'Returns']]];
  const items = roles.map(([r, perms], i) => {
    const grp = new THREE.Group(); grp.position.set(-2.4 + i * 2.4, 0, 0); g.add(grp);
    grp.add(at(cyl(.55, .6, .1, M.body2, 40), 0, .05, 0));
    const card = new THREE.Group(); card.position.y = 1.7; grp.add(card);
    card.add(rbox(1.45, 1.95, .05, .08, M.body));
    const ct = tex(290, 390, (x, w, h, act = 0) => { rr(x, 0, 0, w, h, 22); x.fillStyle = '#141417'; x.fill(); x.fillStyle = act ? '#D29A3A' : '#3a3a40'; rr(x, 0, 0, w, 70, 22); x.fill(); x.fillRect(0, 40, w, 30);
      T(x, r, w / 2, 38, 32, act ? '#111' : '#cfcfcf', 700, 'center'); x.beginPath(); x.arc(w / 2, 140, 46, 0, 7); x.fillStyle = '#26262c'; x.fill(); x.beginPath(); x.arc(w / 2, 128, 18, 0, 7); x.arc(w / 2, 175, 30, Math.PI, 0); x.fillStyle = act ? '#F5B94A' : '#6a6a70'; x.fill();
      T(x, 'Staff ' + String(i + 1).padStart(2, '0'), w / 2, 222, 26, '#e6e6e6', 600, 'center'); T(x, `${perms.length} permission${perms.length > 1 ? 's' : ''}`, w / 2, 258, 22, '#9a9a9a', 500, 'center');
      for (let k = 0; k < 5; k++) { x.fillStyle = k < perms.length ? (act ? '#D29A3A' : '#55555c') : '#222227'; rr(x, 40 + k * 44, 300, 34, 14, 7); x.fill(); } });
    const face = plane(1.38, 1.86, ct); face.position.z = .03; card.add(face);
    const lock = new THREE.Group(); lock.position.set(0, .62, .55); grp.add(lock);
    lock.add(rbox(.46, .38, .16, .06, M.gold));
    const kh = cyl(.04, .04, .02, M.black, 12); kh.rotation.x = Math.PI / 2; kh.position.set(0, .02, .085); lock.add(kh);
    const sh = new THREE.Mesh(new THREE.TorusGeometry(.14, .035, 12, 24, Math.PI), M.steel); sh.position.y = .19; lock.add(sh);
    const gl = glow(GOLDL, 2.6, 0); gl.position.set(0, 1.7, -.3); grp.add(gl);
    const chips = perms.map(p => { const c = tex(220, 64, x => { rr(x, 2, 2, 216, 60, 30); x.fillStyle = 'rgba(20,20,24,.95)'; x.fill(); x.strokeStyle = '#D29A3A'; x.lineWidth = 3; x.stroke(); x.beginPath(); x.arc(34, 32, 9, 0, 7); x.fillStyle = '#2ECC71'; x.fill(); T(x, p, 56, 33, 26, '#f0f0f0', 600); }); const m = plane(.82, .24, c); m.renderOrder = 4; grp.add(m); return m; });
    shadow(grp); return { card, ct, sh, gl, chips, lock };
  });
  sc.update = (t, k) => {
    items.forEach((it, i) => {
      const a = i * 3, on = sm(seg(k, a + .2, a + .7)) * (1 - sm(seg(k, a + 2.6, a + 3)));
      it.sh.position.y = .19 + .14 * on; it.sh.rotation.y = on * 2.2; it.ct.draw(on > .5 ? 1 : 0);
      it.card.position.y = 1.7 + .18 * on + .03 * Math.sin(t * 1.5 + i); it.card.rotation.y = Math.sin(t * .6 + i) * .08;
      it.gl.material.opacity = on * .55;
      it.chips.forEach((c, j) => { const p = bk(seg(k, a + .7 + j * .12, a + 1.2 + j * .12)) * (1 - sm(seg(k, a + 2.5, a + 2.9)));
        c.visible = p > .01; c.position.set(.95 * (j % 2 ? 1 : -1) * (.2 + p * .7), 2.95 - j * .3 + (1 - p) * -.6, .3); c.scale.setScalar(Math.max(.01, p)); });
    });
  };
  return sc;
};

/* 5 — Printing */
S[5] = () => {
  const sc = stage({ cam: [.4, 2.9, 7.2], look: [0, .9, 0], period: 8, still: 3.6 });
  const g = new THREE.Group(); sc.s.add(g);
  const pr = receiptPrinter(1.15); pr.position.set(-1.7, 0, 0); g.add(pr);
  const rct = tex(256, 600, x => { x.fillStyle = '#f7f4ec'; x.fillRect(0, 0, 256, 600); T(x, 'SaedOne POS', 128, 36, 26, '#111', 700, 'center'); T(x, 'Sale #1043  ·  Counter 1', 128, 70, 16, '#555', 500, 'center');
    x.setLineDash([6, 6]); x.strokeStyle = '#999'; x.beginPath(); x.moveTo(20, 92); x.lineTo(236, 92); x.stroke(); x.setLineDash([]);
    [['Capacitor 25µF', 'x2'], ['Bearing 6203', 'x4'], ['Motor brush', 'x2'], ['Timer switch', 'x1'], ['Drain pump', 'x1']].forEach(([a, b], i) => { T(x, a, 20, 122 + i * 40, 18, '#222', 500); T(x, b, 236, 122 + i * 40, 18, '#222', 600, 'right'); });
    x.fillStyle = '#111'; x.fillRect(20, 330, 216, 3); T(x, 'TOTAL', 20, 362, 22, '#111', 700); T(x, 'Rs ••••', 236, 362, 22, '#111', 700, 'right'); T(x, 'Thank you!', 128, 410, 18, '#444', 500, 'center');
    for (let i = 0; i < 46; i++) x.fillRect(30 + i * 4.3, 440, (i * 7) % 3 + 1, 70); });
  const paper = paperStrip(.82, 1.9, rct); paper.position.set(-1.7, .76, .3); paper.rotation.x = -.18; g.add(paper);
  // label printer
  const lp = new THREE.Group(); lp.position.set(1.7, 0, -.1); g.add(lp);
  lp.add(at(rbox(1.15, .45, 1.25, .12, M.body), 0, .225, 0));
  const lid = rbox(1.1, .5, 1.0, .14, M.glass); lid.position.set(0, .66, -.1); lp.add(lid); lp.add(at(rbox(1.12, .05, 1.02, .02, M.gold), 0, .43, -.1));
  const roll = cyl(.2, .2, .8, M.white, 40); roll.rotation.z = Math.PI / 2; roll.position.set(0, .66, -.1); lp.add(roll);
  lp.add(at(rbox(.7, .03, .05, .01, M.rubber), 0, .32, .63));
  const parts = ['Bearing 6203', 'Capacitor 25µF', 'Motor brush', 'Drain pump'];
  const labs = parts.map((p, i) => { const ct = tex(245, 145, x => { rr(x, 0, 0, 245, 145, 10); x.fillStyle = '#ffffff'; x.fill(); T(x, p, 122, 22, 20, '#111', 700, 'center');
      let X = 22; for (let k = 0; k < 44; k++) { const w = ((k * 7 + i * 3) % 3) + 1; x.fillStyle = '#111'; x.fillRect(X, 42, w, 62); X += w + 2.6; } T(x, 'SE-' + (4120 + i * 37), 122, 122, 18, '#333', 600, 'center'); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.62, .37), new THREE.MeshStandardMaterial({ map: ct.t, roughness: .6, side: THREE.DoubleSide })); m.castShadow = true; g.add(m); return m; });
  const t1 = tag('80 mm receipt', { h: .26 }); t1.position.set(-.35, 2.2, 0); g.add(t1); const t2 = tag('49×29 mm labels', { h: .26 }); t2.position.set(1.7, 1.55, -.1); g.add(t2);
  shadow(pr); shadow(lp);
  const out0 = V(1.7, .33, .55);
  sc.update = (t, k) => {
    const f = sm(seg(k, .3, 3.6)), tear = sm(seg(k, 5, 6));
    paper.userData.set(f); paper.position.y = .76 + tear * .9; paper.position.z = .3 + tear * .4; paper.rotation.x = -.18 - tear * .5; paper.material.opacity = 1 - tear; paper.visible = k < 6.1;
    labs.forEach((m, i) => { const s0 = .4 + i * 1.3, p1 = sm(seg(k, s0, s0 + .55)), p2 = eo(seg(k, s0 + .55, s0 + 1.0)); const reset = k > 7.6;
      m.visible = k > s0 && !reset;
      m.position.set(1.7, lerp(.34, .008 + i * .012, p2), .55 + p1 * .35 + p2 * .45);
      m.rotation.set(-Math.PI / 2, 0, p2 * (i % 2 ? .12 : -.1)); });
    roll.rotation.x = k * 2;
  };
  return sc;
};

/* 6 — Cash drawer linked to sale (reed + Arduino + CCTV) */
S[6] = () => {
  const sc = stage({ cam: [1.1, 3.6, 8.9], look: [.25, 1.35, 0], period: 10, still: 4.3 });
  const g = new THREE.Group(); sc.s.add(g);
  const dr = cashDrawer(2.0, .5, 1.7); dr.position.set(-1.7, 0, 0); g.add(dr);
  const posT = tex(512, 320, (x, w, h, st = 0) => { ui(x, w, h, 'SaedOne POS', 'Counter 1'); T(x, 'Sale #1043', w / 2, 112, 42, '#F5F5F5', 700, 'center'); T(x, 'Total Rs ••••  ·  Cash', w / 2, 165, 26, '#9a9a9a', 500, 'center');
    rr(x, 50, 205, w - 100, 80, 14); x.fillStyle = st ? '#163a26' : '#2a2116'; x.fill(); T(x, st ? 'Drawer opened · linked' : 'Billed · opening drawer', w / 2, 246, 28, st ? '#7ff0a8' : '#F5B94A', 700, 'center'); });
  const mon = monitor(1.4, .85, posT); mon.position.set(-1.7, .5, -.35); g.add(mon);
  // reed sensor + magnet
  const reed = rbox(.16, .07, .06, .02, M.white); reed.position.set(-.68, .38, .86); g.add(reed);
  const reedLed = new THREE.Mesh(new THREE.SphereGeometry(.016, 8, 6), emis(RED, 2)); reedLed.position.set(-.64, .42, .89); g.add(reedLed);
  const mag = rbox(.14, .06, .05, .02, M.grey); mag.position.set(.3 - .0, .3, .88); dr.userData.tray.add(mag); mag.position.set(1.06, .3, .86);
  // arduino
  const nn = nano(); nn.position.set(.45, 0, 1.0); nn.rotation.y = -.3; g.add(nn);
  const nl = tag('Arduino', { h: .22 }); nl.position.set(.45, .35, 1.05); g.add(nl);
  const w1 = wire([V(-.6, .36, .9), V(-.3, .05, 1.1), V(.2, .05, 1.05)]); g.add(w1);
  const w2 = wire([V(.7, .05, .95), V(1.3, .05, .2), V(1.45, 1.6, -.6), V(.6, 2.9, -.9), V(.2, 3.1, -.6)], 0x2a2a30); g.add(w2);
  // ceiling dome
  g.add(at(cyl(.035, .035, 1.4, M.body2), .15, 3.75, -.6));
  const dm = dome(); dm.position.set(.15, 3.05, -.6); g.add(dm);
  const fl = glow(0xffffff, 2.4, 0); fl.position.set(.1, 2.8, -.3); g.add(fl);
  const fpl = new THREE.PointLight(0xfff6e8, 0, 7, 1.5); fpl.position.set(0, 2.6, 0); g.add(fpl);
  // log monitor
  const logT = tex(560, 360, (x, w, h, st = 0) => { ui(x, w, h, 'Drawer log', 'CAM 01');
    const rows = [['Sale #1041', '13:58'], ['Sale #1042', '14:10']]; if (st) rows.push(['Sale #1043', '14:32']);
    rows.forEach(([a, b], i) => { const y = 92 + i * 86, nw = st && i === 2; rr(x, 24, y, w - 48, 72, 12); x.fillStyle = nw ? '#1d2a1f' : '#17171b'; x.fill(); if (nw) { x.strokeStyle = '#2ECC71'; x.lineWidth = 3; x.stroke(); }
      x.fillStyle = '#2a2a30'; x.fillRect(38, y + 10, 82, 52); x.fillStyle = '#3d3d44'; x.fillRect(46, y + 34, 66, 20); T(x, a, 136, y + 26, 26, '#eee', 700); T(x, b + '  ·  snapshot linked', 136, y + 52, 19, '#9a9a9a', 500); T(x, '✓', w - 50, y + 36, 32, '#2ECC71', 700, 'center'); }); });
  const lm = monitor(1.75, 1.12, logT); lm.position.set(2.5, 0, -.5); lm.rotation.y = -.35; g.add(lm);
  const snapT = tex(300, 210, x => { x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 210); x.fillStyle = '#1b1d22'; x.fillRect(10, 10, 280, 160); x.fillStyle = '#2f3138'; x.fillRect(40, 90, 220, 60); x.fillStyle = '#4b7cb3'; x.fillRect(60, 100, 40, 30); x.fillStyle = '#5f9a63'; x.fillRect(110, 100, 40, 30); x.fillStyle = '#b27c3f'; x.fillRect(160, 100, 40, 30);
    T(x, 'CAM 01  ·  14:32:07', 20, 28, 16, '#7ff0a8', 600); x.fillStyle = '#E5484D'; x.beginPath(); x.arc(272, 28, 6, 0, 7); x.fill(); T(x, 'Sale #1043', 150, 190, 22, '#111', 700, 'center'); });
  const snap = plane(.9, .63, snapT); snap.renderOrder = 6; g.add(snap);
  const pulse = glow(GOLDL, .4, 0); g.add(pulse);
  shadow(dr); shadow(mon); shadow(nn); shadow(lm); shadow(dm);
  const snapA = V(.15, 2.6, -.2), snapB = V(2.25, 1.45, -.3);
  sc.update = (t, k) => {
    const open = sm(seg(k, 1.2, 1.9)) * (1 - sm(seg(k, 6.8, 7.6))); dr.userData.tray.position.z = open * .95;
    const trig = k > 1.35 && k < 7.2; reedLed.material.color.setHex(trig ? GREEN : RED); reedLed.material.emissive.setHex(trig ? GREEN : RED);
    const nb = trig && k < 2.4 ? (Math.sin(t * 30) > 0 ? 3 : .3) : (trig ? 1.5 : .2); nn.userData.led.material.emissiveIntensity = nb; nn.userData.lg.material.opacity = trig ? .7 : 0;
    const pp = seg(k, 1.45, 2.35); pulse.material.opacity = pp > 0 && pp < 1 ? 1 : 0; if (pp > 0 && pp < 1) pulse.position.copy(pp < .2 ? w1.userData.curve.getPoint(pp / .2) : w2.userData.curve.getPoint((pp - .2) / .8));
    const aim = sm(seg(k, 1.9, 2.4)) * (1 - sm(seg(k, 6.5, 7.3)));
    dm.userData.head.rotation.y = lerp(.9, -.35, aim) ; dm.userData.head.rotation.x = .55 * aim;
    const f = Math.max(0, 1 - Math.abs(k - 2.75) * 6); fl.material.opacity = f; fpl.intensity = f * 30;
    const sp = seg(k, 2.8, 4.2), sv = k > 2.75 && k < 4.25; snap.visible = sv;
    if (sv) { arc(snap.position, snapA, snapB, eo(sp), .7); snap.scale.setScalar(lerp(.3, 1.2, bk(seg(k, 2.75, 3.1))) * (1 - sp * .7)); snap.rotation.y = -.35 * sp; snap.rotation.z = Math.sin(sp * Math.PI) * .12; }
    posT.draw(k > 1.9 && k < 9.4 ? 1 : 0); logT.draw(k > 4.2 && k < 9.6 ? 1 : 0);
  };
  return sc;
};

/* 7 — ZKTeco attendance */
S[7] = () => {
  const sc = stage({ cam: [.6, 3.1, 8.6], look: [.2, 1.75, 0], period: 11.5, still: 1.75 });
  const g = new THREE.Group(); sc.s.add(g);
  const dev = new THREE.Group(); dev.position.set(-1.6, 0, 0); g.add(dev);
  dev.add(at(cyl(.4, .45, .06, M.body2, 40), 0, .03, 0)); dev.add(at(cyl(.06, .06, 1.2, M.body2), 0, .6, 0));
  dev.add(at(rbox(1.05, 1.75, .28, .09, M.body), 0, 2.05, 0));
  dev.add(at(rbox(1.0, .06, .3, .03, M.gold), 0, 2.88, 0));
  const scr = tex(300, 210, (x, w, h, st = 0, who = 1, time = '09:02') => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d1a2a'); gr.addColorStop(1, '#070d16'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    if (st === 2) { x.beginPath(); x.arc(w / 2, 62, 34, 0, 7); x.fillStyle = '#2ECC71'; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(w / 2 - 15, 63); x.lineTo(w / 2 - 3, 75); x.lineTo(w / 2 + 17, 52); x.stroke();
      T(x, 'Verified', w / 2, 122, 32, '#7ff0a8', 700, 'center'); T(x, `Staff 0${who} · IN ${time}`, w / 2, 168, 22, '#cfe', 500, 'center'); }
    else { T(x, time, w / 2, 72, 56, '#e9f1ff', 700, 'center'); T(x, st === 1 ? 'Scanning…' : 'Place finger', w / 2, 150, 26, st === 1 ? '#7ff0a8' : '#8aa', 600, 'center'); } });
  const sp = plane(.78, .54, scr); sp.position.set(0, 2.5, .142); dev.add(sp);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) dev.add(at(rbox(.17, .1, .03, .02, M.body2), -.22 + c * .22, 2.05 - r * .14, .145));
  dev.add(at(rbox(.36, .42, .03, .05, M.black), 0, 1.38, .145));
  const sensM = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: .1, toneMapped: false });
  const sens = new THREE.Mesh(new THREE.PlaneGeometry(.26, .32), sensM); sens.position.set(0, 1.38, .163); dev.add(sens);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(.28, .025), new THREE.MeshBasicMaterial({ color: 0x9dffc4, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending })); line.position.set(0, 1.38, .168); dev.add(line);
  const sg = glow(GREEN, 1.1, 0); sg.position.set(0, 1.38, .3); dev.add(sg);
  const lb = tag('ZKTeco K40', { h: .24 }); lb.position.set(0, 3.15, 0); dev.add(lb);
  const finger = new THREE.Group(); g.add(finger);
  const fm = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .55, 8, 16), M.skin); fm.rotation.x = Math.PI / 2; finger.add(fm);
  const nail = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 8), std(0xe8c3b0, 0, .3)); nail.scale.set(1, .35, 1.2); nail.position.set(0, .07, -.3); finger.add(nail);
  const hand = rbox(.42, .22, .5, .1, M.skin); hand.position.set(.05, -.03, .45); finger.add(hand);
  const dashT = tex(560, 380, (x, w, h, n = 0) => { ui(x, w, h, 'Attendance · Today', 'LIVE'); const tm = ['09:02', '09:05', '09:11'];
    for (let i = 0; i < 3; i++) { const y = 88 + i * 92; rr(x, 22, y, w - 44, 78, 12); x.fillStyle = i < n ? '#16241b' : '#141417'; x.fill();
      x.beginPath(); x.arc(64, y + 39, 22, 0, 7); x.fillStyle = i < n ? '#2ECC71' : '#2a2a30'; x.fill(); T(x, `Staff 0${i + 1}`, 104, y + 28, 26, i < n ? '#eee' : '#666', 700); T(x, i < n ? `IN · ${tm[i]}` : 'not yet', 104, y + 56, 20, i < n ? '#7ff0a8' : '#555', 500); if (i < n) T(x, 'Present', w - 44, y + 40, 22, '#7ff0a8', 700, 'right'); } });
  const dash = monitor(1.8, 1.22, dashT); dash.position.set(1.9, 0, -.5); dash.rotation.y = -.3; g.add(dash);
  const recT = tex(260, 90, (x, w, h, who = 1) => { rr(x, 2, 2, w - 4, h - 4, 16); x.fillStyle = '#10261a'; x.fill(); x.strokeStyle = '#2ECC71'; x.lineWidth = 4; x.stroke(); T(x, `Staff 0${who} · IN`, w / 2, h / 2 + 2, 30, '#7ff0a8', 700, 'center'); });
  const rec = plane(.8, .28, recT); rec.renderOrder = 6; g.add(rec);
  shadow(dev); shadow(dash); fm.castShadow = hand.castShadow = true;
  const fA = V(-.2, 1.2, 1.9), fB = V(-1.6, 1.38, .5), recA = V(-1.6, 2.5, .4), recB = V(1.75, 1.75, -.25); const tms = ['09:02', '09:05', '09:11'];
  sc.update = (t, k) => {
    const i = Math.min(2, Math.floor(k / 3.6)), l = k - i * 3.6, who = i + 1, done = k >= 10.8;
    const ap = sm(seg(l, 0, .8)) * (1 - sm(seg(l, 2.6, 3.4)));
    finger.position.lerpVectors(fA, fB, ap); finger.rotation.y = .5 * (1 - ap) + .15; finger.visible = !done;
    const scan = l > .8 && l < 1.6 && !done, ok = l >= 1.6 && l < 3.2 && !done;
    sensM.opacity = scan ? .45 + .3 * Math.sin(t * 25) : ok ? .55 : .1; sg.material.opacity = scan ? .8 : ok ? .5 : 0;
    line.material.opacity = scan ? 1 : 0; line.position.y = 1.38 + .15 * Math.sin(l * 9);
    scr.draw(scan ? 1 : ok ? 2 : 0, who, tms[i]);
    const rp = seg(l, 1.8, 2.8); rec.visible = rp > 0 && rp < 1 && !done; recT.draw(who);
    if (rec.visible) { arc(rec.position, recA, recB, eo(rp), .9); rec.scale.setScalar(lerp(.6, 1, bk(seg(l, 1.8, 2.1))) * (1 - rp * .6)); }
    dashT.draw(done ? 3 : Math.min(3, i + (l >= 2.8 ? 1 : 0)));
  };
  return sc;
};

/* 8 — Salary from attendance */
S[8] = () => {
  const sc = stage({ cam: [.2, 3.7, 8.9], look: [.3, 1.3, 0], period: 10, still: 6 });
  const g = new THREE.Group(); sc.s.add(g);
  const board = new THREE.Group(); board.position.set(-1, 1.35, 0); board.rotation.x = -1.0; g.add(board);
  board.add(rbox(4.2, 3.4, .1, .08, M.body2));
  const hd = tex(512, 64, x => { T(x, 'ATTENDANCE  ·  NOVEMBER', 256, 34, 34, '#F5B94A', 700, 'center'); }); const hm = plane(3.6, .45, hd); hm.position.set(0, 1.42, .06); board.add(hm);
  g.add(at(rbox(.12, 1.3, .12, .03, M.body), -2.4, .62, .5)); g.add(at(rbox(.12, 1.3, .12, .03, M.body), .4, .62, .5));
  const status = Array.from({ length: 28 }, (_, i) => (i % 7 === 6) ? 'off' : [9, 18].includes(i) ? 'leave' : i === 13 ? 'abs' : 'ok');
  const col = { ok: GREEN, leave: AMBER, abs: RED, off: 0x3a3a40 };
  const tiles = status.map((s, i) => { const t = new THREE.Group(); t.position.set(-1.65 + (i % 7) * .55, .85 - Math.floor(i / 7) * .55, .08); board.add(t);
    const front = rbox(.46, .46, .05, .05, M.body); front.position.z = .03; t.add(front);
    const back = rbox(.46, .46, .05, .05, s === 'off' ? M.body2 : std(col[s], .1, .45, { emissive: col[s], emissiveIntensity: .55 })); back.position.z = -.03; t.add(back);
    t.castShadow = true; return t; });
  const slipT = tex(360, 480, x => { x.fillStyle = '#f6f2e9'; x.fillRect(0, 0, 360, 480); x.fillStyle = '#111'; x.fillRect(0, 0, 360, 78); T(x, 'PAYSLIP', 26, 40, 34, '#F5B94A', 700); T(x, 'NOV', 334, 40, 24, '#bbb', 600, 'right');
    T(x, 'Staff 01', 26, 116, 28, '#111', 700); [['Present days', '24'], ['Leaves', '2'], ['Absent', '1'], ['Deduction', 'auto'], ['Overtime', 'auto']].forEach(([a, b], i) => { T(x, a, 26, 170 + i * 44, 22, '#444', 500); T(x, b, 334, 170 + i * 44, 22, '#111', 700, 'right'); x.fillStyle = '#ddd7cb'; x.fillRect(26, 192 + i * 44, 308, 2); });
    x.fillStyle = '#111'; x.fillRect(26, 400, 308, 3); T(x, 'Net pay', 26, 438, 26, '#111', 700); T(x, 'Rs ••••', 334, 438, 26, '#111', 700, 'right');
    x.save(); x.translate(250, 120); x.rotate(-.25); x.strokeStyle = '#2ECC71'; x.lineWidth = 4; rr(x, -70, -22, 140, 44, 8); x.stroke(); T(x, 'CALCULATED', 0, 2, 18, '#2ECC71', 700, 'center'); x.restore(); });
  const slip = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.0), new THREE.MeshStandardMaterial({ map: slipT.t, roughness: .8, side: THREE.DoubleSide })); slip.castShadow = true; g.add(slip);
  const sg = glow(GOLDL, 3.2, 0); sg.position.set(2.5, 1.9, -.4); g.add(sg);
  const sumT = tex(420, 80, (x, w, h, a = 0, b = 0, c = 0) => { rr(x, 2, 2, w - 4, h - 4, 18); x.fillStyle = 'rgba(14,14,16,.92)'; x.fill(); x.strokeStyle = '#D29A3A'; x.lineWidth = 3; x.stroke();
    [[a, '#2ECC71', 'present'], [b, '#F5A524', 'leave'], [c, '#E5484D', 'absent']].forEach(([n, cl, l], i) => { x.beginPath(); x.arc(30 + i * 136, 40, 8, 0, 7); x.fillStyle = cl; x.fill(); T(x, `${n} ${l}`, 44 + i * 136, 41, 20, '#eee', 600); }); });
  const sum = new THREE.Sprite(new THREE.SpriteMaterial({ map: sumT.t, toneMapped: false, transparent: true, depthWrite: false })); sum.scale.set(2.4, .46, 1); sum.position.set(-1, 3.25, 0); sum.renderOrder = 5; g.add(sum);
  shadow(board);
  sc.update = (t, k) => {
    let a = 0, b = 0, c = 0;
    tiles.forEach((tl, i) => { const p = sm(seg(k, .3 + i * .1, .7 + i * .1)) * (1 - sm(seg(k, 8.8 + i * .02, 9.3 + i * .02))); tl.rotation.y = p * Math.PI; tl.position.z = .08 + Math.sin(p * Math.PI) * .25;
      if (p > .5) { const s = status[i]; if (s === 'ok') a++; else if (s === 'leave') b++; else if (s === 'abs') c++; } });
    sumT.draw(a, b, c);
    const r = eo(seg(k, 3.6, 5)) * (1 - sm(seg(k, 8.6, 9.4)));
    slip.position.set(2.5, lerp(-1.1, 1.9, r) + .04 * Math.sin(t * 1.5), -.4); slip.rotation.set(-.08, -.35 + .05 * Math.sin(t), .04); slip.visible = r > .01;
    sg.material.opacity = r * (.45 + .1 * Math.sin(t * 2));
  };
  return sc;
};

/* 9 — Demand tracker & purchase orders */
S[9] = () => {
  const sc = stage({ cam: [.6, 3.5, 9.8], look: [.3, 1.3, 0], period: 13, still: 4.8, ring: 5 });
  const g = new THREE.Group(); sc.s.add(g);
  const sh = new THREE.Group(); sh.position.set(-2.4, 0, -.2); g.add(sh);
  [-1.25, 1.25].forEach(x => [-.4, .4].forEach(z => sh.add(at(rbox(.07, 2.8, .07, .02, M.steel), x, 1.4, z))));
  const levels = [.35, 1.25, 2.15]; levels.forEach(y => sh.add(at(rbox(2.6, .05, .9, .02, M.grey), 0, y - .03, 0)));
  const empty = [1, 3, 7];
  const slots = []; levels.forEach((y, li) => [-.82, 0, .82].forEach((x, xi) => { const i = li * 3 + xi; const bin = new THREE.Group(); bin.position.set(x, y, 0); sh.add(bin);
    const box = rbox(.7, .55, .7, .05, std([0x2e2e34, 0x3a2d1c, 0x24303a][i % 3], .2, .55)); box.position.y = .28; bin.add(box); bin.add(at(rbox(.36, .1, .01, .01, M.gold), 0, .38, .355));
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(.78, .66), new THREE.MeshBasicMaterial({ map: tex(128, 108, (x2, w, h) => { x2.strokeStyle = '#fff'; x2.lineWidth = 8; x2.setLineDash([14, 10]); x2.strokeRect(5, 5, w - 10, h - 10); }).t, color: RED, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })); fr.position.set(x, y + .32, .42); sh.add(fr);
    slots.push({ bin, box, fr, empty: empty.includes(i) }); }));
  const dm = tag('LOW STOCK · 3', { color: '#ff8a8e', border: '#E5484D', h: .3 }); dm.position.set(-2.4, 3.2, -.2); g.add(dm);
  const pr = receiptPrinter(.8); pr.position.set(.3, 0, .6); g.add(pr);
  const poT = tex(300, 400, x => { x.fillStyle = '#f6f2e9'; x.fillRect(0, 0, 300, 400); x.fillStyle = '#111'; x.fillRect(0, 0, 300, 64); T(x, 'PURCHASE ORDER', 150, 33, 24, '#F5B94A', 700, 'center'); T(x, 'PO-0217 · auto', 20, 96, 20, '#555', 600);
    [['Bearing 6203', '× 20'], ['Capacitor 25µF', '× 10'], ['Motor brush', '× 15']].forEach(([a, b], i) => { T(x, a, 20, 150 + i * 52, 22, '#111', 600); T(x, b, 280, 150 + i * 52, 22, '#111', 700, 'right'); });
    T(x, 'From real sales data', 150, 350, 18, '#2e7d4f', 700, 'center'); });
  const po = paperStrip(.62, .82, poT); po.position.set(.3, .55, .85); po.rotation.x = -.2; g.add(po);
  const poF = plane(.62, .82, poT, false); poF.castShadow = true; g.add(poF);
  // truck
  const tr = new THREE.Group(); g.add(tr);
  tr.add(at(rbox(2.0, 1.05, 1.0, .06, M.white), -.35, .95, 0)); tr.add(at(rbox(2.02, .07, 1.02, .02, M.gold), -.35, .62, 0));
  const dl = tex(256, 64, x => T(x, 'DELIVERY', 128, 34, 34, '#1b1b1e', 700, 'center')); const dlp = plane(1.2, .3, dl, false); dlp.position.set(-.35, 1.0, .505); tr.add(dlp);
  tr.add(at(rbox(.8, .85, .95, .14, std(0x1f2a44, .4, .35)), 1.1, .78, 0)); tr.add(at(rbox(.04, .34, .8, .02, M.glass), 1.5, 1.0, 0));
  tr.add(at(rbox(2.9, .18, .9, .04, M.body), .05, .38, 0));
  const wheels = [[-.95, .45], [-.95, -.45], [1.1, .45], [1.1, -.45]].map(([x, z]) => { const w = cyl(.24, .24, .16, M.rubber, 24); w.rotation.x = Math.PI / 2; w.position.set(x, .24, z); tr.add(w); return w; });
  const hl = glow(0xfff2c0, .6, .8); hl.position.set(1.52, .6, .3); tr.add(hl);
  const crates = empty.map(() => { const m = rbox(.7, .55, .7, .05, std(0x3a2d1c, .2, .55)); m.castShadow = true; g.add(m); return m; });
  shadow(sh); shadow(pr); shadow(tr);
  const tHome = V(2.7, 0, .6), tmp = V();
  sc.update = (t, k) => {
    const filled = k > 10.6;
    slots.forEach((s, i) => { s.bin.visible = !s.empty || filled; const red = s.empty && !filled; s.fr.material.color.setHex(red ? RED : GREEN); s.fr.material.opacity = red ? .55 + .45 * Math.sin(t * 5) : (s.empty ? .9 * (1 - seg(k, 11, 12.4)) : 0); });
    dm.material.opacity = 1 - sm(seg(k, 10.4, 10.8)) + sm(seg(k, 12.8, 13));
    const pf = sm(seg(k, 1.4, 2.8)); po.userData.set(pf); po.visible = k < 3.2 && k > 1.4;
    const fp = seg(k, 3.2, 4.4); poF.visible = k >= 3.2 && k < 4.4; if (poF.visible) { arc(poF.position, V(.3, .55 + .41, .85), V(2.4, 1.2, .6), eo(fp), .8); poF.scale.setScalar(1 - fp * .7); poF.rotation.set(-.2 * (1 - fp), -fp * 1.2, fp * .4); }
    const go = sm(seg(k, 4.8, 6.2)), back = 1 - eo(seg(k, 7.4, 9)); const off = Math.max(k < 7.4 ? go : back, 0) * 7;
    tr.position.set(tHome.x + off, 0, tHome.z); wheels.forEach(w => w.rotation.set(Math.PI / 2, -off * 4, 0));
    crates.forEach((c, j) => { const i = empty[j], li = Math.floor(i / 3), xi = i % 3; const dst = V(-2.4 + [-.82, 0, .82][xi], levels[li] + .28, -.2);
      const p = sm(seg(k, 9.2 + j * .45, 10.2 + j * .45)); c.visible = k > 9.2 + j * .45 && k < 10.6 + j * 0; if (c.visible) arc(c.position, V(2.4, 1.0, .6), dst, p, 1.6); c.rotation.y = (1 - p) * 2; });
    if (k > 10.6) crates.forEach(c => c.visible = false);
  };
  return sc;
};

/* 10 — AI assistant in Roman Urdu */
S[10] = () => {
  const sc = stage({ cam: [0, 3.4, 9], look: [.3, 1.45, 0], period: 11, still: 6.5 });
  const g = new THREE.Group(); sc.s.add(g);
  g.add(at(rbox(3.0, .12, 2.2, .05, M.stone), -1.5, .8, .1));
  [[-2.8, -.8], [-2.8, .9], [-.2, -.8], [-.2, .9]].forEach(([x, z]) => g.add(at(rbox(.08, .8, .08, .02, M.body2), x, .4, z)));
  const invT = tex(360, 480, x => { x.fillStyle = '#f3eee2'; x.fillRect(0, 0, 360, 480); x.fillStyle = '#c9c1ae'; for (let i = 0; i < 14; i++) x.fillRect(0, 70 + i * 30, 360, 1);
    T(x, 'Supplier bill', 24, 36, 28, '#24305e', 700); x.font = `italic 600 24px "Comic Sans MS", cursive`; x.fillStyle = '#24305e';
    ['Bearing 6203 — 20', 'Capacitor 25 — 10', 'Motor brush — 15', 'Drain pump — 4', 'Timer switch — 6'].forEach((s, i) => { x.save(); x.translate(26, 118 + i * 62); x.rotate((i % 2 ? -.02 : .015)); x.fillText(s, 0, 0); x.restore(); });
    x.font = `italic 700 26px "Comic Sans MS", cursive`; x.fillText('Total ——', 180, 440); });
  const invG = new THREE.Group(); invG.position.set(-1.5, 1.5, .1); invG.rotation.x = -1.0; g.add(invG);
  invG.add(at(rbox(2.0, 2.6, .05, .04, M.body2), 0, 0, -.035));
  g.add(at(rbox(.1, 1.0, .1, .03, M.body2), -1.5, 1.2, -.5));
  const inv = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4), new THREE.MeshStandardMaterial({ map: invT.t, roughness: .85, side: THREE.DoubleSide })); inv.receiveShadow = true; invG.add(inv);
  const laser = new THREE.Mesh(new THREE.BoxGeometry(2.0, .025, .03), new THREE.MeshBasicMaterial({ color: 0xff5a4a, toneMapped: false })); invG.add(laser);
  const lg = glow(0xff5a4a, 1.2, .8); lg.scale.set(2.6, .45, 1); invG.add(lg);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .5), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: .1, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(sheet); sheet.visible = false;
  const bubT = tex(620, 150, (x, w, h) => { rr(x, 4, 4, w - 8, h - 30, 26); x.fillStyle = '#1d3b2a'; x.fill(); x.beginPath(); x.moveTo(60, h - 27); x.lineTo(40, h - 4); x.lineTo(96, h - 27); x.fill(); T(x, '“20 bearing 6203 aur 10 capacitor', 30, 50, 28, '#e8fff0', 600); T(x, ' order kar do”', 30, 92, 28, '#e8fff0', 600); });
  const bub = plane(2.7, .65, bubT); bub.position.set(-1.6, 3.15, 0); bub.renderOrder = 5; g.add(bub);
  const tbl = new THREE.Group(); tbl.position.set(2.0, 1.85, -.3); tbl.rotation.y = -.25; g.add(tbl);
  tbl.add(rbox(2.7, 2.7, .06, .06, std(0x121216, .3, .3)));
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(2.72, 2.72), new THREE.MeshBasicMaterial({ map: tex(256, 256, x => { x.strokeStyle = '#D29A3A'; x.lineWidth = 4; rr(x, 3, 3, 250, 250, 14); x.stroke(); }).t, transparent: true, toneMapped: false })); frame.position.z = .035; tbl.add(frame);
  const hT = tex(520, 70, x => { T(x, 'ITEM', 24, 36, 26, '#F5B94A', 700); T(x, 'QTY', 330, 36, 26, '#F5B94A', 700); T(x, 'STATUS', 500, 36, 26, '#F5B94A', 700, 'right'); });
  const hp = plane(2.4, .32, hT); hp.position.set(0, 1.05, .04); tbl.add(hp);
  const data = [['Bearing 6203', '20'], ['Capacitor 25µF', '10'], ['Motor brush', '15'], ['Drain pump', '4'], ['Timer switch', '6']];
  const rows = data.map(([a, b], i) => { const ct = tex(520, 70, x => { rr(x, 2, 2, 516, 66, 12); x.fillStyle = '#1b1b20'; x.fill(); T(x, a, 24, 36, 26, '#eee', 600); T(x, b, 330, 36, 26, '#fff', 700); T(x, 'added', 496, 36, 22, '#7ff0a8', 700, 'right'); });
    const m = new THREE.Mesh(new RoundedBoxGeometry(2.4, .3, .05, 3, .04), [M.body, M.body, M.body, M.body, new THREE.MeshBasicMaterial({ map: ct.t, toneMapped: false }), M.body]); m.renderOrder = 4; g.add(m); return m; });
  const done = tag('Purchase order ready', { color: '#7ff0a8', border: '#2ECC71', h: .3 }); done.position.set(2.0, 3.45, -.3); g.add(done);
  const tmp = V(), q = new THREE.Quaternion(); tbl.updateMatrixWorld(true); invG.updateMatrixWorld(true);
  sc.update = (t, k) => {
    bub.material.opacity = bk(seg(k, .1, .6)) * (1 - seg(k, 10.3, 10.8)); bub.scale.setScalar(Math.max(.01, bk(seg(k, .1, .6)))); bub.position.y = 3.15 + .04 * Math.sin(t * 2);
    const sp = seg(k, 1.2, 5.2), on = k > 1.2 && k < 5.4; laser.visible = lg.visible = sheet.visible = on;
    const ly = lerp(1.1, -1.1, sp); laser.position.set(0, ly, .03); lg.position.set(0, ly, .08); sheet.visible = false;
    rows.forEach((r, i) => { const yy = .61 - .31 * i, s0 = 1.2 + 4 * (1.1 - yy) / 2.2, p = sm(seg(k, s0, s0 + .9)); r.visible = k > s0 && k < 10.6;
      const src = invG.localToWorld(V(-.1, yy, .04)), dst = V(0, .65 - i * .38, .06).applyMatrix4(tbl.matrixWorld);
      arc(r.position, src, dst, p, 1.1); r.quaternion.slerpQuaternions(invG.quaternion, tbl.quaternion, p); r.scale.setScalar(.7 + .3 * p); });
    done.material.opacity = sm(seg(k, 6.2, 6.6)) * (1 - seg(k, 10.2, 10.6));
  };
  shadow(g); inv.castShadow = false; return sc;
};

/* 11 — WhatsApp product catalogue */
S[11] = () => {
  const sc = stage({ cam: [0, 2.9, 9.4], look: [0, 1.65, 0], period: 14, still: 4 });
  const g = new THREE.Group(); sc.s.add(g);
  const phT = tex(300, 600, x => { x.fillStyle = '#0e1210'; x.fillRect(0, 0, 300, 600); x.fillStyle = '#1f7a4d'; x.fillRect(0, 0, 300, 120); T(x, 'Parts Catalogue', 24, 52, 28, '#fff', 700); T(x, '600+ parts · 16 categories', 24, 90, 18, '#cfeedd', 500);
    for (let i = 0; i < 8; i++) { const X = 16 + (i % 2) * 140, Y = 140 + Math.floor(i / 2) * 112; rr(x, X, Y, 128, 100, 12); x.fillStyle = '#1a201d'; x.fill(); x.fillStyle = ['#D29A3A', '#4b7cb3', '#9aa0a6', '#5f9a63'][i % 4]; x.beginPath(); x.arc(X + 64, Y + 42, 22, 0, 7); x.fill(); x.fillStyle = '#3a423e'; x.fillRect(X + 18, Y + 76, 92, 10); } });
  const ph = phone(1.15, 2.3, phT); ph.position.set(0, 1.75, .55); g.add(ph);
  g.add(at(cyl(.7, .8, .12, M.body2, 48), 0, .06, 0)); g.add(at(rbox(.5, .5, .3, .05, M.body), 0, .35, -.1));
  const pg = glow(0x2ECC71, 3.4, .18); pg.position.set(0, 1.75, -.3); g.add(pg);
  const prods = [['Drain pump', 'Pumps', 'pump'], ['Bearing 6203', 'Bearings', 'ring'], ['Motor brush', 'Motors', 'brush'], ['Timer switch', 'Switches', 'dial'], ['Capacitor 25µF', 'Capacitors', 'cap'], ['Belt M-21', 'Belts', 'belt'], ['Door lock', 'Locks', 'lock'], ['Inlet valve', 'Valves', 'valve'], ['Gear box', 'Gears', 'gear'], ['Water sensor', 'Sensors', 'sens']];
  const icon = (x, kind, cx, cy) => { x.save(); x.translate(cx, cy); x.strokeStyle = '#D29A3A'; x.fillStyle = '#D29A3A'; x.lineWidth = 7;
    if (kind === 'ring') { x.beginPath(); x.arc(0, 0, 40, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 18, 0, 7); x.stroke(); for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(Math.cos(i * .785) * 29, Math.sin(i * .785) * 29, 5, 0, 7); x.fill(); } }
    else if (kind === 'gear') { for (let i = 0; i < 10; i++) { x.save(); x.rotate(i * .628); x.fillRect(-7, -48, 14, 16); x.restore(); } x.beginPath(); x.arc(0, 0, 34, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 10, 0, 7); x.fill(); }
    else if (kind === 'cap') { rr(x, -22, -40, 44, 70, 10); x.fill(); x.fillRect(-12, 30, 5, 22); x.fillRect(8, 30, 5, 22); }
    else if (kind === 'pump') { x.beginPath(); x.arc(-8, 0, 32, 0, 7); x.stroke(); x.fillRect(20, -10, 34, 20); x.beginPath(); x.arc(-8, 0, 10, 0, 7); x.fill(); }
    else if (kind === 'belt') { x.beginPath(); x.ellipse(0, 0, 52, 26, 0, 0, 7); x.stroke(); }
    else if (kind === 'dial') { x.beginPath(); x.arc(0, 0, 38, 0, 7); x.stroke(); x.save(); x.rotate(-.8); x.fillRect(-4, -34, 8, 34); x.restore(); }
    else if (kind === 'lock') { rr(x, -30, -8, 60, 46, 8); x.fill(); x.beginPath(); x.arc(0, -8, 20, Math.PI, 0); x.stroke(); }
    else if (kind === 'valve') { x.fillRect(-46, -8, 92, 16); x.fillRect(-6, -40, 12, 34); x.fillRect(-26, -46, 52, 10); }
    else if (kind === 'brush') { rr(x, -16, -36, 32, 52, 6); x.fill(); x.fillRect(-2, 16, 4, 28); }
    else { x.beginPath(); x.arc(0, 0, 30, 0, 7); x.stroke(); x.beginPath(); x.moveTo(-14, 0); x.lineTo(14, 0); x.moveTo(0, -14); x.lineTo(0, 14); x.stroke(); }
    x.restore(); };
  const cards = prods.map(([n, c, k]) => { const ct = tex(230, 300, x => { rr(x, 2, 2, 226, 296, 18); x.fillStyle = '#141417'; x.fill(); x.strokeStyle = '#2f2f35'; x.lineWidth = 3; x.stroke();
      rr(x, 14, 14, 202, 140, 12); x.fillStyle = '#1c1c21'; x.fill(); icon(x, k, 115, 84); T(x, n, 115, 182, 22, '#f2f2f2', 700, 'center');
      rr(x, 60, 202, 110, 30, 15); x.fillStyle = '#2a2116'; x.fill(); T(x, c, 115, 218, 16, '#F5B94A', 600, 'center'); rr(x, 30, 246, 170, 38, 19); x.fillStyle = '#1f7a4d'; x.fill(); T(x, 'Share', 115, 266, 20, '#fff', 700, 'center'); });
    const m = new THREE.Mesh(new RoundedBoxGeometry(.85, 1.1, .03, 3, .05), [M.body, M.body, M.body, M.body, new THREE.MeshBasicMaterial({ map: ct.t, toneMapped: false }), M.body]); m.castShadow = true; g.add(m); return m; });
  const cnt = tag('16 categories', { h: .28 }); cnt.position.set(0, 3.4, 0); g.add(cnt);
  shadow(ph);
  const ctr = V(0, 1.75, .1);
  sc.update = (t, k, c) => {
    ph.rotation.y = Math.sin(t * .5) * .15;
    const N = cards.length;
    cards.forEach((m, i) => { const out = bk(seg(k, .2 + i * .12, 1.0 + i * .12)) * (1 - sm(seg(k, 12.6 + i * .05, 13.4 + i * .05)));
      const a = t * .28 + i * Math.PI * 2 / N; const R = 2.9 * out; m.position.set(Math.sin(a) * R * 1.05, 1.55 + Math.sin(a * 2 + t) * .12, Math.cos(a) * R * .5 - .5);
      m.rotation.y = Math.atan2(c.position.x - m.position.x, c.position.z - m.position.z); m.scale.setScalar(Math.max(.01, .25 + .75 * out)); m.visible = out > .02; });
    cnt.material.opacity = sm(seg(k, 1.2, 1.8)) * (1 - seg(k, 12.6, 13));
  };
  return sc;
};

/* 12 — Busiest-timings analytics */
S[12] = () => {
  const sc = stage({ cam: [0, 4.3, 10.2], look: [0, 1.7, 0], period: 12, still: 5, ring: 4.8 });
  const g = new THREE.Group(); sc.s.add(g);
  const vals = [1.0, 1.35, 1.7, 2.15, 1.9, 1.55, 1.85, 2.4, 3.3, 3.65, 2.75, 1.95, 1.35, .85];
  const win = tex(64, 256, (x, w, h, gold = 0) => { x.fillStyle = gold ? '#2a1d08' : '#16161b'; x.fillRect(0, 0, w, h); for (let r = 0; r < 26; r++) for (let c = 0; c < 4; c++) if (((r * 7 + c * 3) % 5) > 1) { x.fillStyle = gold ? '#F5B94A' : '#5a6070'; x.fillRect(6 + c * 14, 6 + r * 9.6, 8, 5); } });
  const winG = tex(64, 256, (x, w, h) => { x.fillStyle = '#3a280c'; x.fillRect(0, 0, w, h); for (let r = 0; r < 26; r++) for (let c = 0; c < 4; c++) if (((r * 5 + c) % 4) > 0) { x.fillStyle = '#ffd27a'; x.fillRect(6 + c * 14, 6 + r * 9.6, 8, 5); } });
  const bars = vals.map((v, i) => { const peak = i === 8 || i === 9; const geo = new THREE.BoxGeometry(.38, 1, .38); geo.translate(0, .5, 0);
    const tx = (peak ? winG : win).t.clone(); tx.needsUpdate = true; tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, v / 2);
    const side = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: peak ? 0xffffff : 0x8090a0, emissiveIntensity: peak ? 1.1 : .35, metalness: .4, roughness: .35 });
    const topM = peak ? M.gold : M.body2; const m = new THREE.Mesh(geo, [side, side, topM, topM, side, side]); m.position.set(-3.25 + i * .5, 0, 0); m.castShadow = m.receiveShadow = true; g.add(m); m.userData.v = v; return m; });
  const hrs = tex(1024, 48, x => { for (let i = 0; i < 14; i++) { const h = 9 + i; T(x, (h > 12 ? h - 12 : h) + (h >= 12 ? 'p' : 'a'), 36 + i * 73.2, 26, 22, i === 8 || i === 9 ? '#F5B94A' : '#8a8a8a', 700, 'center'); } });
  const hp = new THREE.Mesh(new THREE.PlaneGeometry(7.2, .34), new THREE.MeshBasicMaterial({ map: hrs.t, transparent: true, toneMapped: false })); hp.rotation.x = -Math.PI / 2; hp.position.set(-.07, .02, .5); g.add(hp);
  const pk = tag('Peak 5–7 PM', { h: .32 }); pk.position.set(2.5, 3.5, 0); g.add(pk);
  const pg = glow(GOLDL, 2.6, 0); pg.position.set(.95, 3.6, 0); g.add(pg);
  const nT = tex(520, 210, x => { rr(x, 2, 2, 516, 206, 22); x.fillStyle = 'rgba(16,16,19,.95)'; x.fill(); x.strokeStyle = '#D29A3A'; x.lineWidth = 3; x.stroke();
    T(x, 'Nightly report · 11:00 PM', 28, 42, 24, '#F5B94A', 700); T(x, 'Busiest hour: 6 PM', 28, 96, 26, '#eee', 600); T(x, 'Suggestion: extra staff 5–7 PM', 28, 146, 22, '#9a9a9a', 500); T(x, 'Slow: 10–11 AM → run offers', 28, 182, 20, '#9a9a9a', 500); });
  const nt = new THREE.Sprite(new THREE.SpriteMaterial({ map: nT.t, toneMapped: false, transparent: true, depthWrite: false })); nt.scale.set(2.3, .93, 1); nt.position.set(-2.4, 3.3, -.6); nt.renderOrder = 6; g.add(nt);
  sc.update = (t, k) => {
    bars.forEach((b, i) => { const p = bk(seg(k, .2 + i * .1, 1.2 + i * .1)) * (1 - sm(seg(k, 10.8 + i * .03, 11.6 + i * .03))); b.scale.y = Math.max(.001, b.userData.v * p); });
    pk.material.opacity = sm(seg(k, 2.2, 2.7)) * (1 - seg(k, 10.6, 11)); pg.material.opacity = pk.material.opacity * (.5 + .15 * Math.sin(t * 3));
    nt.material.opacity = sm(seg(k, 3.6, 4.2)) * (1 - seg(k, 10.4, 10.9)); nt.position.y = 3.3 + .05 * Math.sin(t * 1.7);
    sc.base.set(Math.sin(t * .22) * 2.2, 4.3 + Math.sin(t * .15) * .3, 10.2);
  };
  return sc;
};

/* ================= RUNTIME ================= */
async function main() {
  const els = [...document.querySelectorAll('[data-s3d]')]; if (!els.length) return;
  const probe = document.createElement('canvas'); if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
  const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  R.setPixelRatio(1); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.08;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.setScissorTest(true);
  const pm = new THREE.PMREMGenerator(R); ENV = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  [M.gold, M.goldD, M.goldE, M.steel].forEach(m => m.envMapIntensity = 1.2);
  const DPR = Math.min(devicePixelRatio || 1, 1.75);
  const list = [];
  for (const el of els) {
    try {
      const sc = S[el.dataset.s3d](); if (!sc) continue;
      const cv = document.createElement('canvas'); cv.className = 'c3d'; cv.setAttribute('aria-hidden', 'true');
      sc.el = el; sc.cv = cv; sc.ctx = cv.getContext('2d'); sc.vis = false; sc.dirty = true;
      el.appendChild(cv); el.classList.add('on3d'); list.push(sc);
    } catch (e) { console.warn('3D scene failed', el.dataset.s3d, e); }
  }
  const io = new IntersectionObserver(es => es.forEach(e => { const sc = list.find(s => s.el === e.target); if (sc) { sc.vis = e.isIntersecting; sc.dirty = true; } }), { rootMargin: '120px' });
  list.forEach(s => io.observe(s.el));
  let px = -1, py = -1; addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; }, { passive: true });
  addEventListener('resize', () => list.forEach(s => s.dirty = true));
  let GW = 0, GH = 0;
  const tmpL = V(), cpos = V();
  function draw(sc, t) {
    const r = sc.el.getBoundingClientRect(); const w = Math.round(r.width), h = Math.round(r.height); if (w < 2 || h < 2) return;
    const pw = Math.round(w * DPR), ph = Math.round(h * DPR);
    if (sc.cv.width !== pw || sc.cv.height !== ph) { sc.cv.width = pw; sc.cv.height = ph; }
    if (pw > GW || ph > GH) { GW = Math.max(GW, pw); GH = Math.max(GH, ph); R.setSize(GW, GH, false); }
    const asp = w / h; sc.c.aspect = asp; sc.c.updateProjectionMatrix();
    const inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
    const tx = inside ? ((px - r.left) / w - .5) * 2 : 0, ty = inside ? ((py - r.top) / h - .5) * 2 : 0;
    sc.mx += (tx - sc.mx) * .06; sc.my += (ty - sc.my) * .06;
    const scroll = clamp(((r.top + h / 2) - innerHeight / 2) / innerHeight, -1, 1);
    const T0 = RM ? sc.still : (t % sc.period);
    sc.update(t, T0, sc.c);
    const fit = Math.pow(Math.max(1, sc.ar / asp), .85) * (sc.zoom ?? .84);
    cpos.copy(sc.base).sub(sc.look).multiplyScalar(fit).add(sc.look);
    cpos.x += sc.mx * .9; cpos.y += -sc.my * .45 + scroll * .7;
    sc.c.position.copy(cpos); tmpL.copy(sc.look); tmpL.x += sc.mx * .2; sc.c.lookAt(tmpL);
    R.setViewport(0, 0, pw, ph); R.setScissor(0, 0, pw, ph); R.render(sc.s, sc.c);
    sc.ctx.drawImage(R.domElement, 0, GH - ph, pw, ph, 0, 0, pw, ph);
  }
  function frame(now) {
    requestAnimationFrame(frame); const t = now / 1000;
    for (const sc of list) { if (!sc.vis) continue; if (RM && !sc.dirty) continue; draw(sc, t); sc.dirty = false; }
  }
  requestAnimationFrame(frame);
  window.__case3d = { list, R };
}
main().catch(e => console.warn('3D disabled:', e));
