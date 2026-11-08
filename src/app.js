'use strict';
// ====== 工具 ======
const $ = s => document.querySelector(s);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 依城市分開存放；'trips' 與 'city' 為全域鍵；大阪沿用舊版（無前綴）資料
const GLOBAL_KEYS = ['trips', 'city'];
const skey = k => GLOBAL_KEYS.includes(k) ? 'osk3d.' + k : 'osk3d.' + CITY_ID + '.' + k;
const store = {
  get(k,d){ try{ let v = localStorage.getItem(skey(k)); if (v == null && CITY_ID === 'osaka') v = localStorage.getItem('osk3d.' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(skey(k), JSON.stringify(v)); }catch(e){} }
};
function toast(msg, ms=2800){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'), ms); }
const badge = L => `<span class="badge" style="--c:${L.color}">${esc(L.badge)}</span>`;
const hhmm = d => String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const area = id => areaOf(ST[id][2], ST[id][3]);
const IN_FRAME = (()=>{ try{ return window.self !== window.top; }catch(e){ return true; } })();
const GPS_BLOCK_MSG = '目前環境封鎖了定位（在 Claude 內開啟時會這樣）。請改用時間推算＋「到站了」手動校正；把這個 HTML 放到 GitHub Pages 等 HTTPS 網址開啟即可使用 GPS。';
const gmapsTransit = (a,b) => `https://www.google.com/maps/dir/?api=1&origin=${ST[a][2]},${ST[a][3]}&destination=${ST[b][2]},${ST[b][3]}&travelmode=transit`;
const gmapsWalk = sp => `https://www.google.com/maps/dir/?api=1&origin=${ST[sp.st][2]},${ST[sp.st][3]}&destination=${encodeURIComponent(sp.q)}&travelmode=walking`;

// ====== 3D ======
const LAT0 = CITY.lat0, LON0 = CITY.lon0, KZ = 111.0, KX = 111.32*Math.cos(LAT0*Math.PI/180);
const P = (lat, lon, y=0) => new THREE.Vector3((lon-LON0)*KX, y, -(lat-LAT0)*KZ);
let renderer, scene, camera, clock, routeGroup, train, userDot;
const lineMeshes = [];
const netSegs = [];   // 路網線段（判斷藍點是否在軌道上）
function segDist(px, pz, ax, az, bx, bz){
  const dx = bx-ax, dz = bz-az, L2 = dx*dx + dz*dz;
  const t = L2 ? clamp(((px-ax)*dx + (pz-az)*dz) / L2, 0, 1) : 0;
  return Math.hypot(px - (ax + t*dx), pz - (az + t*dz));
}
function distToTrack(p){
  let best = Infinity;
  if (segs3D.length){ for (const S of segs3D) for (const q of S.samples){ const d = Math.hypot(q.x-p.x, q.z-p.z); if (d < best) best = d; } }
  for (const s of netSegs){ const d = segDist(p.x, p.z, s[0], s[1], s[2], s[3]); if (d < best) best = d; }
  return best;
}
// 在軌道附近（含 GPS 誤差）就隱藏藍點，由列車代表你的位置
function updateUserDot(acc){
  const tol = Math.max(0.12, Math.min((acc || 0)/1000, 0.3));
  userDot.visible = distToTrack(userDot.position) > tol;
}
const labels = [];          // 需要依距離縮放的 sprite
const flows = [];           // 路線上流動的光點
const pins = [];
let segs3D = [];            // 目前路線的乘車段 3D 資料
const camS = {target:new THREE.Vector3(0,0,-1), dist:CITY.view || 20, az:0.35, el:0.95, follow:false, auto:true, azOff:0, tT:null, tD:null, touchT:0};

function pointInPoly(lat, lon, poly){
  let ins = false;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++){
    const [yi,xi]=poly[i], [yj,xj]=poly[j];
    if (((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) ins = !ins;
  }
  return ins;
}
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

// 站名貼圖延遲建立（東京有近 800 站，全部預先建立會吃光手機記憶體）
const LFONT = `700 40px -apple-system,"PingFang TC","Hiragino Sans","Noto Sans TC","Noto Sans JP","Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
const _mctx = document.createElement('canvas').getContext('2d');
let texCount = 0;
function makeLabel(text, color='#ffffff', strong=false){
  _mctx.font = LFONT;
  const w = Math.ceil(_mctx.measureText(text).width) + 36, h = 64;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({depthTest:false, transparent:true}));
  sp.renderOrder = 20; sp.userData.asp = w/h; sp.userData.px = strong ? 19 : 15; sp.userData.pri = strong ? 4 : 3;
  sp.userData.lbl = {text, color, strong, w, h}; sp.visible = false;
  return sp;
}
function ensureTex(sp){
  if (sp.material.map) return;
  const {text, color, strong, w, h} = sp.userData.lbl;
  const fs = 40, pad = 18;
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  c.width = w; c.height = h;
  ctx.font = `700 ${fs}px -apple-system,"PingFang TC","Hiragino Sans","Noto Sans TC","Noto Sans JP",sans-serif`;
  ctx.fillStyle = strong ? 'rgba(12,20,40,0.92)' : 'rgba(8,14,30,0.78)';
  const r = 16; ctx.beginPath(); ctx.moveTo(r,0); ctx.arcTo(w,0,w,h,r); ctx.arcTo(w,h,0,h,r); ctx.arcTo(0,h,0,0,r); ctx.arcTo(0,0,w,0,r); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = strong ? 5 : 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, pad, h/2+1);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  sp.material.map = tex; sp.material.needsUpdate = true; texCount++;
}
function trimTex(){
  if (texCount < 320) return;
  for (const sp of labels){ if (!sp.visible && sp.material.map && sp.userData.net){ sp.material.map.dispose(); sp.material.map = null; sp.material.needsUpdate = true; texCount--; if (texCount < 220) break; } }
}

function init3D(){
  const cv = $('#c3d');
  renderer = new THREE.WebGLRenderer({canvas:cv, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a16);
  scene.fog = new THREE.FogExp2(0x060a16, 0.02);
  camera = new THREE.PerspectiveCamera(50, 1, 0.02, 800);
  scene.add(new THREE.HemisphereLight(0xb0c0ff, 0x0a0f20, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 0.65); dl.position.set(20,40,15); scene.add(dl);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500,500), new THREE.MeshStandardMaterial({color:0x0b1325, roughness:1}));
  ground.rotation.x = -Math.PI/2; scene.add(ground);
  // 大阪灣（概略）
  const sh = new THREE.Shape();
  BAY.forEach(([la,lo],i) => { const x=(lo-LON0)*KX, y=(la-LAT0)*KZ; i ? sh.lineTo(x,y) : sh.moveTo(x,y); });
  const bay = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({color:0x0a2147}));
  bay.rotation.x = -Math.PI/2; bay.position.y = 0.004; scene.add(bay);
  for (const [la,lo,w,h,r] of (CITY.ISLES || [])){
    const isle = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshStandardMaterial({color:0x0f182e}));
    isle.rotation.x = -Math.PI/2; isle.rotation.z = r; isle.position.copy(P(la, lo, 0.008)); scene.add(isle);
  }
  const grid = new THREE.GridHelper(500, 500, 0x1a2950, 0x111b38);
  grid.position.y = 0.01; grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);

  buildCity(); buildNetwork(); buildSpotMarkers();
  routeGroup = new THREE.Group(); scene.add(routeGroup);
  train = makeTrain(); train.visible = false; scene.add(train);
  userDot = new THREE.Group();
  const ud = new THREE.Mesh(new THREE.SphereGeometry(0.05,16,12), new THREE.MeshBasicMaterial({color:0x4aa8ff}));
  ud.position.y = 0.12;
  const ur = new THREE.Mesh(new THREE.RingGeometry(0.9,1,40), new THREE.MeshBasicMaterial({color:0x4aa8ff, transparent:true, opacity:0.35, side:THREE.DoubleSide}));
  ur.rotation.x = -Math.PI/2; ur.position.y = 0.03; userDot.add(ud, ur); userDot.ring = ur; userDot.visible = false; scene.add(userDot);

  new ResizeObserver(resize).observe($('#stage'));
  resize(); setupControls(cv);
  clock = new THREE.Clock();
  requestAnimationFrame(loop);
}

function resize(){
  const st = $('#stage'); const w = st.clientWidth, h = st.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix();
}

function buildCity(){
  const rnd = mulberry(20261121);
  const items = [];
  for (const id in ST){
    const hub = HUBS.includes(id) || (SERVE[id]||[]).length >= 4;
    const n = hub ? 26 : 7, R = hub ? 1.1 : 0.55;
    const c = P(ST[id][2], ST[id][3]);
    for (let i=0;i<n;i++){
      const a = rnd()*Math.PI*2, r = 0.12 + Math.sqrt(rnd())*R;
      const x = c.x + Math.cos(a)*r, z = c.z + Math.sin(a)*r;
      const lat = LAT0 - z/KZ, lon = LON0 + x/KX;
      if (pointInPoly(lat, lon, BAY)) continue;
      if (SPOTS.some(sp => Math.abs(sp.y - lat) < 0.0022 && Math.abs(sp.x - lon) < 0.0026)) continue;
      const hgt = hub ? (0.03 + Math.pow(rnd(),2.2)*0.38) : (0.015 + rnd()*0.09);
      items.push([x, z, 0.04+rnd()*0.1, hgt, 0.04+rnd()*0.1, rnd()]);
    }
  }
  const geo = new THREE.BoxGeometry(1,1,1); geo.translate(0,0.5,0);
  const mat = new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.85, emissive:0x070c1c});
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  items.forEach(([x,z,w,h,d,r],i) => {
    m.makeScale(w,h,d); m.setPosition(x,0,z); im.setMatrixAt(i,m);
    col.setHSL(0.62, 0.35, r > 0.93 ? 0.42 : 0.14 + r*0.1); im.setColorAt(i, col);
  });
  scene.add(im);
}

function lineVecs(L, y){
  const pts = [];
  for (const it of L.stops){
    if (it[0] === '@') pts.push(P(it[1], it[2], y));
    else pts.push(P(ST[it[0]][2], ST[it[0]][3], y));
  }
  return pts;
}

function buildNetwork(){
  for (const L of LINES){
    const pts = lineVecs(L, 0.04);
    const curve = new THREE.CatmullRomCurve3(pts, !!L.loop, 'centripetal');
    const mat = new THREE.MeshBasicMaterial({color:L.color, transparent:true, opacity:0.55});
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length*14, 0.032, 5, !!L.loop), mat);
    mesh.userData.lid = L.id; lineMeshes.push(mesh); scene.add(mesh);
    const vs = lineVecs(L, 0); if (L.loop) vs.push(vs[0]);
    for (let i=1;i<vs.length;i++) netSegs.push([vs[i-1].x, vs[i-1].z, vs[i].x, vs[i].z]);
  }
  const ids = Object.keys(ST);
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055,0.055,0.05,14), new THREE.MeshBasicMaterial({color:0xdfe7ff}), ids.length);
  const m = new THREE.Matrix4();
  ids.forEach((id,i) => { const v = P(ST[id][2], ST[id][3], 0.05); m.makeTranslation(v.x, v.y, v.z); im.setMatrixAt(i, m); });
  scene.add(im);
  for (const id of ids){
    const hub = HUBS.includes(id);
    const sp = makeLabel(ST[id][0], hub ? '#7d93c6' : '#4a5e8c');
    sp.position.copy(P(ST[id][2], ST[id][3], 0.2)); sp.userData.base = 0.08; sp.userData.net = true; sp.userData.st = id;
    sp.userData.px = hub ? 15 : 13; sp.userData.pri = hub ? 2 : 1;
    scene.add(sp); labels.push(sp);
  }
}

function makeTrain(){
  const g = new THREE.Group(); g.cars = [];
  g.stripeMat = new THREE.MeshStandardMaterial({color:0xE5171F, emissive:0xE5171F, emissiveIntensity:0.45});
  const bodyGeo = new THREE.BoxGeometry(0.1, 0.075, 0.3);
  const bodyMat = new THREE.MeshStandardMaterial({color:0xf3f6fb, roughness:0.35, metalness:0.25, emissive:0x1d2433});
  const winMat = new THREE.MeshBasicMaterial({color:0xaee3ff});
  for (let i=0;i<1;i++){   // 只放一節車廂，中心＝你的位置
    const car = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.03, 0.302), g.stripeMat); stripe.position.y = -0.02;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.27), new THREE.MeshStandardMaterial({color:0x8a93a6})); roof.position.y = 0.043; car.add(roof);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.103, 0.02, 0.25), winMat); win.position.y = 0.014;
    car.add(body, stripe, win);
    if (i === 0){
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.02,0.01), new THREE.MeshBasicMaterial({color:0xfff3c4}));
      hl.position.set(0,-0.01,0.152); car.add(hl);
    }
    g.add(car); g.cars.push(car);
  }
  g.light = new THREE.PointLight(0xfff1c8, 1.4, 1.6); g.add(g.light);
  g.ring = new THREE.Mesh(new THREE.RingGeometry(0.12,0.16,40), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.6, side:THREE.DoubleSide}));
  g.ring.rotation.x = -Math.PI/2; g.add(g.ring);
  return g;
}

function disposeGroup(gr){
  while (gr.children.length){
    const o = gr.children.pop();
    o.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material){ if (x.material.map) x.material.map.dispose(); x.material.dispose(); } });
  }
}

function makePin(color){
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08,0.24,16), new THREE.MeshStandardMaterial({color, emissive:color, emissiveIntensity:0.5}));
  cone.rotation.x = Math.PI; cone.position.y = 0.12;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1,16,12), new THREE.MeshStandardMaterial({color, emissive:color, emissiveIntensity:0.6}));
  ball.position.y = 0.3;
  g.add(cone, ball); return g;
}

// route：單一路線；opt.legs：一天多段路線；opt.marks：[{y,x,label}] 編號景點
function buildRoute3D(route, opt={}){
  disposeGroup(routeGroup);
  for (let i=labels.length-1;i>=0;i--) if (!labels[i].userData.net) labels.splice(i,1);
  flows.length = 0; pins.length = 0; segs3D = []; hlLine = null;
  const routes = opt.legs ? opt.legs.filter(Boolean) : (route ? [route] : []);
  const active = routes.length > 0 || !!opt.marks;
  lineMeshes.forEach(m => { m.material.opacity = active ? 0.16 : 0.55; m.scale.set(1,1,1); });
  const onRoute = new Set(routes.flatMap(r => r.steps.flatMap(s => s.type === 'ride' ? s.stations : [])));
  labels.forEach(l => { l.material.opacity = active ? 0.6 : 1; l.userData.hide = onRoute.has(l.userData.st); l.userData.boost = false; });
  if (!active) return;
  const all = [];
  const flowGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const labeled = new Set();
  for (const r of routes) for (const s of r.steps){
    if (s.type === 'walk'){
      const a = P(ST[s.a][2], ST[s.a][3], 0.1), b = P(ST[s.b][2], ST[s.b][3], 0.1);
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]), new THREE.LineDashedMaterial({color:0xffffff, dashSize:0.05, gapSize:0.04}));
      ln.computeLineDistances(); routeGroup.add(ln); continue;
    }
    if (s.type !== 'ride') continue;
    const L = LMAP[s.line];
    const pts = ridePolyline(s).map(p => P(p.lat, p.lon, 0.09));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const N = Math.max(60, Math.ceil(len*60));
    const samples = curve.getSpacedPoints(N);
    const stPos = s.stations.map(id => P(ST[id][2], ST[id][3], 0.09));
    const stU = []; let from = 0;
    stPos.forEach((sp, k) => {
      let bi = from, bd = 1e9;
      for (let i=from;i<=N;i++){ const d = samples[i].distanceToSquared(sp); if (d < bd){ bd = d; bi = i; } }
      if (k === 0) bi = 0; if (k === stPos.length-1) bi = N;
      stU.push(bi/N); from = bi;
    });
    const seg = {step:s, line:L, curve, len, samples, stU, stPos, N};
    segs3D.push(seg); all.push(...pts);
    routeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, N, 0.07, 8), new THREE.MeshBasicMaterial({color:L.color})));
    routeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.ceil(N/2), 0.17, 8),
      new THREE.MeshBasicMaterial({color:L.color, transparent:true, opacity:0.2, depthWrite:false, blending:THREE.AdditiveBlending})));
    const fm = new THREE.MeshBasicMaterial({color:new THREE.Color(L.color).lerp(new THREE.Color(0xffffff), 0.6)});
    const nf = clamp(Math.round(len*2), 3, 40);
    for (let i=0;i<nf;i++){ const f = new THREE.Mesh(flowGeo, fm); routeGroup.add(f); flows.push({m:f, seg, u0:i/nf}); }
    stPos.forEach((sp, k) => {
      const end = (k === 0 || k === stPos.length-1);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(end?0.12:0.085, end?0.12:0.085, 0.07, 18), new THREE.MeshStandardMaterial({color:0xffffff, emissive:end?L.color:0x333a4a, emissiveIntensity:end?0.6:0.4}));
      cyl.position.copy(sp); routeGroup.add(cyl);
      const sid = s.stations[k];
      if (labeled.has(sid)) return; labeled.add(sid);
      const lb = makeLabel(ST[sid][0], L.color, end);
      lb.position.copy(sp); lb.userData.base = 0.15; routeGroup.add(lb); labels.push(lb);
    });
  }
  if (routes.length === 1 && !opt.legs){
    const r = routes[0];
    const a = P(ST[r.from][2], ST[r.from][3], 0.05), b = P(ST[r.to][2], ST[r.to][3], 0.05);
    const p1 = makePin(0x3ddc97); p1.position.copy(a); const p2 = makePin(0xff5d6c); p2.position.copy(b);
    routeGroup.add(p1, p2); pins.push(p1, p2); all.push(a, b);
  }
  if (opt.home){ const h = P(ST[opt.home][2], ST[opt.home][3], 0.05); const p = makePin(0x3ddc97); p.position.copy(h); routeGroup.add(p); pins.push(p); all.push(h); }
  for (const m of (opt.marks || [])){
    const v = P(m.y, m.x, 0.05 + (m.top || 0));
    const pin = makePin(0xffb547); pin.position.copy(v); routeGroup.add(pin); pins.push(pin);
    const lb = makeLabel(m.label, '#ffb547', true); lb.position.copy(v); lb.userData.base = 0.42; lb.userData.pri = 6; lb.userData.px = 17;
    routeGroup.add(lb); labels.push(lb); all.push(v);
  }
  if (all.length) fitPoints(all);
}

// ====== 景點標記、點選、路線亮顯 ======
const spotMarks = [];   // {i, pos, icon, model, label}
const landmarkAnims = [];
let hlLine = null;
// 景點圖示：圓形徽章＋emoji，外圈顏色代表狀態（橘＝一般、金＝想去、綠＝已排入）
const EFONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
function drawSpotIcon(sm, ring){
  const c = sm.canvas, ctx = c.getContext('2d'), S = c.width;
  ctx.clearRect(0, 0, S, S);
  ctx.beginPath(); ctx.arc(S/2, S/2 - 6, S/2 - 14, 0, Math.PI*2);
  ctx.fillStyle = '#0b1428'; ctx.fill();
  ctx.lineWidth = 9; ctx.strokeStyle = ring; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(S/2 - 13, S - 26); ctx.lineTo(S/2 + 13, S - 26); ctx.lineTo(S/2, S - 4); ctx.closePath(); ctx.fillStyle = ring; ctx.fill();
  ctx.font = `64px ${EFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(SPOTS[sm.i].i || '📍', S/2, S/2 - 2);
  sm.tex.needsUpdate = true;
}
function buildSpotMarkers(){
  const pole = new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6); pole.translate(0, 0.13, 0);
  const poleMat = new THREE.MeshBasicMaterial({color:0xffb547, transparent:true, opacity:0.5});
  SPOTS.forEach((sp, i) => {
    const pos = P(sp.y, sp.x, 0.3);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas); tex.minFilter = THREE.LinearFilter;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false, transparent:true}));
    icon.center.set(0.5, 0.05); icon.position.copy(pos); icon.renderOrder = 25; scene.add(icon);
    const lb = makeLabel(sp.n, '#c98a2c'); lb.position.copy(pos); lb.userData.base = 0.3;
    lb.userData.net = true; lb.userData.spot = i; lb.userData.px = 13; lb.userData.pri = 1.5;
    scene.add(lb); labels.push(lb);
    const sm = {i, pos, icon, canvas, tex, label:lb, px:30};
    // 3D 地標模型
    const model = buildLandmark(sp);
    model.position.copy(P(sp.y, sp.x, 0.012)); model.rotation.y = (sp.ry != null ? sp.ry : 0);
    scene.add(model); sm.model = model; sm.top = model.userData.top;
    model.traverse(o => { if (o.userData && o.userData.anim) landmarkAnims.push(o); });
    pos.y = sm.top + 0.06; icon.position.copy(pos); lb.position.copy(pos); lb.userData.base = pos.y;
    drawSpotIcon(sm, '#ffb547');
    spotMarks.push(sm);
  });
}
function refreshSpotMarkers(){
  const t = (typeof curTrip === 'function') ? curTrip() : null;
  const wish = new Set(t ? t.wish : []);
  const planned = new Set(t ? t.days.flatMap(d => d.stops.filter(s => s.s).map(s => s.s)) : []);
  for (const sm of spotMarks){
    const n = SPOTS[sm.i].n, w = wish.has(n), p = planned.has(n);
    drawSpotIcon(sm, p ? '#3ddc97' : w ? '#ffd34d' : '#ffb547');
    sm.px = p || w ? 38 : 30;
    sm.label.userData.pri = p || w ? 2.5 : 1.5;
  }
}
function highlightLine(lid){
  buildRoute3D(null);
  hlLine = lid;
  const L = LMAP[lid];
  lineMeshes.forEach(m => { const on = m.userData.lid === lid; m.material.opacity = on ? 1 : 0.1; m.scale.set(1,1,1); });
  const st = new Set(L.real);
  labels.forEach(l => { l.userData.boost = st.has(l.userData.st); l.material.opacity = l.userData.boost ? 1 : 0.5; });
  const thick = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lineVecs(L, 0.06), !!L.loop, 'centripetal'), L.stops.length*14, 0.08, 8, !!L.loop),
    new THREE.MeshBasicMaterial({color:L.color}));
  routeGroup.add(thick);
  fitPoints(L.real.map(id => P(ST[id][2], ST[id][3])));
  toast(`${L.name}：${L.real.map(id => ST[id][0]).join('・')}`, 5000);
}
function handleTap(cx, cy){
  const rc = renderer.domElement.getBoundingClientRect();
  const x = cx - rc.left, y = cy - rc.top, W = rc.width, H = rc.height;
  const scr = v => { _v.copy(v).project(camera); return _v.z < 1 ? [(_v.x+1)/2*W, (1-_v.y)/2*H] : null; };
  let best = null;
  for (const sm of spotMarks){ const s = scr(sm.icon.visible && sm.icon.material.opacity > .6 ? sm.pos.clone().setY(sm.pos.y + (sm.iw || 0)*0.5) : sm.pos.clone().setY(sm.top*0.5)); if (!s) continue; const d = Math.hypot(s[0]-x, s[1]-y); if (d < Math.max(30, sm.top / ((camera.position.distanceTo(sm.pos) || 1) * 2*Math.tan(camera.fov*Math.PI/360)) * H * 0.6) && (!best || d < best.d)) best = {d, spot:sm.i}; }
  if (!best){
    for (const id in ST){ const s = scr(P(ST[id][2], ST[id][3], 0.05)); if (!s) continue; const d = Math.hypot(s[0]-x, s[1]-y); if (d < 24 && (!best || d < best.d)) best = {d, st:id}; }
    for (const l of labels){ if (!l.visible || !l.userData.st) continue; const s = scr(l.position); if (!s) continue; const w = l.userData.px*l.userData.asp/2 + 4, h = l.userData.px/2 + 4;
      if (Math.abs(s[0]-x) < w && Math.abs(s[1]-y) < h){ const d = Math.hypot(s[0]-x, s[1]-y)*0.5; if (!best || d < best.d) best = {d, st:l.userData.st}; } }
    for (const l of labels){ if (!l.visible || l.userData.spot == null) continue; const s = scr(l.position); if (!s) continue; const w = l.userData.px*l.userData.asp/2 + 4, h = l.userData.px/2 + 4;
      if (Math.abs(s[0]-x) < w && Math.abs(s[1]-y) < h){ best = {d:0, spot:l.userData.spot}; break; } }
  }
  if (!best) return;
  if (best.spot != null) showSpotPop(best.spot); else showStationPop(best.st);
}
function openPop(html){ $('#popBody').innerHTML = html; $('#pop').classList.add('open'); }
function closePop(){ $('#pop').classList.remove('open'); }
function dayOptions(){
  const t = curTrip();
  return t.days.map((d,k) => `<option value="${k}">第${k+1}天 ${dayDateLabel(t,k)}</option>`).join('');
}
function showSpotPop(i){
  const sp = SPOTS[i], t = curTrip(), w = t.wish.includes(sp.n);
  const inDay = t.days.findIndex(d => d.stops.some(s => s.s === sp.n));
  openPop(`<div class="pop-h"><b><span class="ico">${sp.i}</span>${esc(sp.n)}</b><span class="mut">${esc(sp.a)} · 建議停留 ${sp.h} 小時</span></div>
    <div class="mut" style="margin-top:6px">${esc(sp.d)}</div>
    <div class="sp-st">🚉 <b>${esc(ST[sp.st][0])}</b>站 ${sp.ex ? '· '+esc(sp.ex) : ''} · 步行約 ${sp.w} 分 <span class="bl">${(SERVE[sp.st]||[]).map(l=>badge(LMAP[l])).join('')}</span></div>
    ${inDay >= 0 ? `<div class="okline">✅ 已排在第 ${inDay+1} 天</div>` : ''}
    <div class="row"><button class="sec" data-pa="wish">${w ? '★ 取消想去' : '☆ 加入想去'}</button><button class="sec" data-pa="go">🧭 規劃前往</button></div>
    <div class="row"><select id="popDay" class="sel">${dayOptions()}</select><button class="primary" data-pa="add" style="flex:.8">＋ 排入這天</button></div>`);
  if (inDay >= 0) $('#popDay').value = inDay; else $('#popDay').value = Math.min(curDay, t.days.length-1);
  $('#popBody').onclick = e => {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    if (b.dataset.pa === 'wish'){ toggleWish(sp.n); showSpotPop(i); }
    if (b.dataset.pa === 'go'){ closePop(); goSpot(i, curTrip().home ? 'home' : 'from'); }
    if (b.dataset.pa === 'add'){ addSpotToDay(sp.n, +$('#popDay').value); closePop(); }
  };
}
function showStationPop(id){
  const t = curTrip();
  openPop(`<div class="pop-h"><b>${esc(ST[id][0])}</b><span class="mut">${esc(ST[id][1])}</span></div>
    <div class="mut" style="margin:8px 0 4px">點路線可在 3D 中亮起整條線：</div>
    <div class="chips">${(SERVE[id]||[]).map(l => `<button class="chip" data-hl="${l}">${badge(LMAP[l])} ${esc(LMAP[l].name)}</button>`).join('')}</div>
    <div class="row"><button class="sec" data-pa="from">設為出發</button><button class="sec" data-pa="to">設為目的地</button></div>
    <div class="row"><select id="popDay" class="sel">${dayOptions()}</select><button class="sec" data-pa="add" style="flex:.8">＋ 排入這天</button></div>`);
  $('#popDay').value = Math.min(curDay, t.days.length-1);
  $('#popBody').onclick = e => {
    const h = e.target.closest('[data-hl]'); if (h){ closePop(); highlightLine(h.dataset.hl); return; }
    const b = e.target.closest('[data-pa]'); if (!b) return;
    if (b.dataset.pa === 'from'){ fromId = id; renderOD(); closePop(); switchTab('plan'); toast('出發站：' + ST[id][0]); }
    if (b.dataset.pa === 'to'){ toId = id; renderOD(); closePop(); switchTab('plan'); toast('目的地：' + ST[id][0]); }
    if (b.dataset.pa === 'add'){ addStationToDay(id, +$('#popDay').value); closePop(); }
  };
}

function fitPoints(pts){
  const box = new THREE.Box3().setFromPoints(pts);
  const c = box.getCenter(new THREE.Vector3()); const sz = box.getSize(new THREE.Vector3());
  c.y = 0;
  camS.tT = c; camS.tD = clamp(Math.max(sz.x, sz.z)*1.15 + 1.5, 2.5, 140);
  camS.follow = false; camS.el = 0.95; camS.tAz = 0.12; camS.auto = false;
}

function setupControls(cv){
  const pts = new Map(); let lastPinch = null, lastMid = null, tap = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    tap = pts.size === 1 ? {x:e.clientX, y:e.clientY, t:performance.now(), moved:0} : null; camS.auto = false; camS.tT = null; camS.tD = null; camS.tAz = null; lastPinch = null; });
  cv.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (tap) tap.moved += Math.abs(dx) + Math.abs(dy);
    camS.touchT = performance.now();
    if (pts.size === 1){
      if (camS.follow) camS.azOff -= dx*0.006; else camS.az -= dx*0.006;
      camS.el = clamp(camS.el + dy*0.005, 0.12, 1.45);
    } else if (pts.size === 2){
      const [a,b] = [...pts.values()];
      const d = Math.hypot(a.x-b.x, a.y-b.y), mid = {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
      if (lastPinch){
        camS.dist = clamp(camS.dist * lastPinch / d, 0.4, 160);
        if (!camS.follow){
          const k = camS.dist*0.0016, s = Math.sin(camS.az), c = Math.cos(camS.az);
          const mx = mid.x - lastMid.x, my = mid.y - lastMid.y;
          camS.target.x += -c*mx*k - s*my*k;
          camS.target.z +=  s*mx*k - c*my*k;
        }
      }
      lastPinch = d; lastMid = mid;
    }
  });
  const up = e => {
    if (e.type === 'pointerup' && tap && pts.size === 1 && tap.moved < 10 && performance.now() - tap.t < 450) handleTap(e.clientX, e.clientY);
    tap = null; pts.delete(e.pointerId); lastPinch = null; lastMid = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); camS.auto = false; camS.tD = null; camS.dist = clamp(camS.dist*Math.exp(e.deltaY*0.0012), 0.4, 160); }, {passive:false});
}

const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI*2)) - Math.PI; if (d < -Math.PI) d += Math.PI*2; return a + d*t; };

function updateCamera(dt){
  const k = 1 - Math.pow(0.02, dt);
  if (camS.follow && train.visible){
    const lead = train.cars[0];
    camS.target.lerp(lead.position.clone().setY(0.1), k*1.5 > 1 ? 1 : k*1.5);
    const dir = new THREE.Vector3(0,0,1).applyQuaternion(lead.quaternion);
    const want = Math.atan2(-dir.x, -dir.z) + camS.azOff;
    camS.az = angLerp(camS.az, want, k*0.8);
    if (performance.now() - camS.touchT > 5000) camS.azOff *= (1 - k*0.3);
  } else {
    if (camS.tT){ camS.target.lerp(camS.tT, k); if (camS.target.distanceTo(camS.tT) < 0.02) camS.tT = null; }
    if (camS.tD){ camS.dist += (camS.tD - camS.dist)*k; if (Math.abs(camS.dist - camS.tD) < 0.02) camS.tD = null; }
    if (camS.tAz != null){ camS.az = angLerp(camS.az, camS.tAz, k); if (Math.abs(Math.sin(camS.az - camS.tAz)) < 0.01) camS.tAz = null; }
    if (camS.auto) camS.az += dt*0.05;
  }
  const ce = Math.cos(camS.el);
  camera.position.set(camS.target.x + Math.sin(camS.az)*ce*camS.dist, camS.target.y + Math.sin(camS.el)*camS.dist, camS.target.z + Math.cos(camS.az)*ce*camS.dist);
  camera.lookAt(camS.target);
  scene.fog.density = 1.1 / (camS.dist*2.4 + 8);
}

let lastFrame = 0, frameCount = 0;
const _v = new THREE.Vector3();
// 站名避免重疊：路線上的站 > 大站 > 一般站，近的優先
let topH = 0;
function declutter(W, H){
  if (!topH){ const tb = document.getElementById('topbar'); topH = tb ? tb.offsetHeight - 6 : 60; }
  const arr = [];
  for (const sp of labels){
    _v.copy(sp.position).project(camera);
    arr.push({sp, x:(_v.x+1)/2*W, y:(1-_v.y)/2*H, z:_v.z, w:sp.userData.px*sp.userData.asp, h:sp.userData.px, d:camera.position.distanceToSquared(sp.position)});
  }
  const pr = sp => sp.userData.boost ? 3.5 : sp.userData.pri;
  arr.sort((a,b) => (pr(b.sp) - pr(a.sp)) || (a.d - b.d));
  const placed = [];
  for (const o of arr){
    let ok = !o.sp.userData.hide && o.z < 1 && o.x > -o.w/2 && o.x < W + o.w/2 && o.y > topH && o.y < H + o.h;
    if (ok) for (const p of placed){ if (Math.abs(o.x-p.x) < (o.w+p.w)/2 + 3 && Math.abs(o.y-p.y) < (o.h+p.h)/2 + 2){ ok = false; break; } }
    if (ok) ensureTex(o.sp);
    o.sp.visible = ok; if (ok) placed.push(o);
  }
  trimTex();
}
function loop(now){
  requestAnimationFrame(loop);
  const busy = ride.active || camS.tT || camS.tD || (performance.now() - camS.touchT < 1500);
  if (!busy && now - lastFrame < 32) return;   // 閒置時降到 30fps 省電
  lastFrame = now;
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  updateRide(dt);
  updateCamera(dt);
  for (const f of flows){
    const u = (f.u0 + t*0.45/f.seg.len) % 1;
    f.m.position.copy(f.seg.curve.getPointAt(u)); f.m.position.y += 0.005;
  }
  pins.forEach((p,i) => { p.position.y = 0.05 + Math.abs(Math.sin(t*2 + i))*0.08; p.rotation.y = t; });
  if (train.visible){ const s = 1 + (t*1.5 % 1)*1.6; train.ring.scale.set(s,s,s); train.ring.material.opacity = 0.7*(1 - (t*1.5 % 1)); }
  if (userDot.visible) userDot.children[0].position.y = 0.12 + Math.sin(t*3)*0.02;
  const cw = renderer.domElement.clientWidth || 300, ch = renderer.domElement.clientHeight || 300;
  const tanF = 2*Math.tan(camera.fov*Math.PI/360);
  for (const sm of spotMarks){
    const d = camera.position.distanceTo(sm.pos);
    const near = d < 1.3 + sm.top*2;   // 拉近時看模型就好，圖示縮小淡出
    const k = near ? clamp((d - 0.6) / (0.7 + sm.top*2), 0, 1) : 1;
    const s = sm.px * (0.45 + 0.55*k) / ch * d * tanF; sm.icon.scale.set(s, s, 1); sm.iw = s;
    sm.icon.material.opacity = 0.25 + 0.75*k; sm.icon.visible = k > 0.02;
  }
  for (const o of landmarkAnims) o.userData.anim(o, t);
  for (const sp of labels){
    const d = camera.position.distanceTo(sp.position);
    const hw = sp.userData.px / ch * d * tanF;     // 讓字在螢幕上固定 px 大小
    sp.scale.set(hw*sp.userData.asp, hw, 1);
    sp.position.y = sp.userData.base + hw*0.6 + (sp.userData.spot != null && spotMarks[sp.userData.spot] ? (spotMarks[sp.userData.spot].iw || 0)*0.98 : 0);
  }
  if (frameCount % 4 === 0) declutter(cw, ch);
  if (++frameCount % 30 === 0 && ride.active) renderRideHud(true);
  renderer.render(scene, camera);
}

// ====== 乘車引擎（時間推算 + GPS 校正） ======
const ride = {active:false, si:0, leg:0, legT:0, phase:'idle', dwell:0, speed:1, dispU:0, dispSi:-1, gpsWatch:null, gpsStatus:'未啟用', lastFix:null, off:null, alerted:{}, wake:null};
const ease = t => (1 - Math.cos(Math.PI*t))/2;
const easeInv = f => Math.acos(clamp(1 - 2*f, -1, 1))/Math.PI;
const curSeg = () => segs3D[ride.si];

function rideU(){
  const S = curSeg(), n = S.stU.length;
  if (ride.leg >= n-1) return 1;
  return S.stU[ride.leg] + (S.stU[ride.leg+1] - S.stU[ride.leg]) * (ride.phase === 'move' ? ease(ride.legT) : 0);
}

function startRide(r){
  if (r && r.steps) curRoute = r;
  if (!curRoute) return;
  if (ride.active) stopRide(true);
  buildRoute3D(curRoute);
  if (!segs3D.length){ toast('這段不需要搭車（同站或步行）'); return; }
  Object.assign(ride, {active:true, si:0, leg:0, legT:0, phase:'board', dwell:0, alerted:{}, dispSi:-1});
  train.stripeMat.color.set(segs3D[0].line.color); train.stripeMat.emissive.set(segs3D[0].line.color);
  train.visible = true; camS.follow = true; camS.azOff = 0; camS.auto = false; camS.dist = 1.6; camS.el = 0.42; camS.tT = null; camS.tD = null;
  placeTrain(1);
  pins.forEach(p => p.visible = false);
  requestWake();
  switchTab('ride'); renderRide();
}
function stopRide(silent){
  ride.active = false; ride.phase = 'idle'; train.visible = false; camS.follow = false;
  if (ride.wake){ try{ ride.wake.release(); }catch(e){} ride.wake = null; }
  if (silent === true) return;
  if (curRoute) buildRoute3D(curRoute);
  renderRide(); $('#miniHud').classList.remove('show');
}
async function requestWake(){ try{ if (navigator.wakeLock) ride.wake = await navigator.wakeLock.request('screen'); }catch(e){} }

function updateRide(dt){
  if (!ride.active) return;
  const S = curSeg(), st = S.step;
  if (ride.phase === 'move'){
    const m = Math.max(0.5, st.mins[ride.leg]);
    ride.legT += dt*ride.speed/(m*60);
    if (ride.legT >= 1) arriveAt(ride.leg + 1);
  } else if (ride.phase === 'dwell'){
    ride.dwell -= dt*ride.speed;
    if (ride.dwell <= 0){ ride.phase = 'move'; ride.legT = 0; renderRide(); }
  }
  placeTrain(dt);
}

function arriveAt(k){
  const S = curSeg(), n = S.step.stations.length;
  ride.leg = k; ride.legT = 0;
  if (k >= n-1){
    ride.leg = n-1;
    ride.phase = ride.si < segs3D.length-1 ? 'xfer' : 'done';
    buzz([200,100,200]);
    toast(ride.phase === 'done' ? '🎉 已抵達目的地 ' + ST[S.step.stations[n-1]][0] : '抵達 ' + ST[S.step.stations[n-1]][0] + '，請換乘');
  } else { ride.phase = 'dwell'; ride.dwell = 25; }
  renderRide();
}

function placeTrain(dt){
  const S = curSeg(); if (!S) return;
  const u = rideU();
  if (ride.dispSi !== ride.si){ ride.dispSi = ride.si; ride.dispU = u; }
  else ride.dispU += (u - ride.dispU) * Math.min(1, (dt||0)*4);
  train.cars.forEach(car => {
    const uu = clamp(ride.dispU, 0, 1);
    const p = S.curve.getPointAt(uu), t = S.curve.getTangentAt(uu);
    car.position.set(p.x, 0.135, p.z);
    car.lookAt(p.x + t.x, 0.135, p.z + t.z);
  });
  const lp = train.cars[0].position;
  train.light.position.set(lp.x, 0.4, lp.z); train.ring.position.set(lp.x, 0.1, lp.z);
}

function buzz(p){ try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }

function remainingMin(){
  const S = curSeg(), st = S.step; let t = 0;
  if (ride.phase === 'board') t += S.line.wait*0.5;
  for (let i=ride.leg;i<st.mins.length;i++) t += st.mins[i] * (i === ride.leg && ride.phase === 'move' ? 1 - ride.legT : 1);
  let after = false;
  for (const s of curRoute.steps){
    if (s === st){ after = true; continue; }
    if (!after) continue;
    t += s.type === 'ride' ? s.total + LMAP[s.line].wait*0.5 : s.min;
  }
  return t;
}

function rideNext(){
  if (!ride.active) return;
  if (ride.phase === 'board'){ ride.phase = 'move'; ride.legT = 0; renderRide(); return; }
  if (ride.phase === 'xfer'){ boardNextSeg(); return; }
  if (ride.phase === 'move' || ride.phase === 'dwell') arriveAt(ride.leg + 1);
}
function ridePrev(){
  if (!ride.active) return;
  if ((ride.phase === 'xfer' || ride.phase === 'done')){ ride.leg = curSeg().step.stations.length-2; ride.phase = 'dwell'; ride.dwell = 15; renderRide(); return; }
  if (ride.leg > 0){ ride.leg--; ride.legT = 0; ride.phase = 'dwell'; ride.dwell = 15; }
  else { ride.phase = 'board'; ride.legT = 0; }
  renderRide();
}
function boardNextSeg(){
  ride.si++; ride.leg = 0; ride.legT = 0; ride.phase = 'move'; ride.dispSi = -1;
  const L = curSeg().line; train.stripeMat.color.set(L.color); train.stripeMat.emissive.set(L.color);
  renderRide();
}

// GPS
function toggleGPS(){
  if (ride.gpsWatch != null){ navigator.geolocation.clearWatch(ride.gpsWatch); ride.gpsWatch = null; ride.gpsStatus = '未啟用'; userDot.visible = false; renderRide(); return; }
  if (!('geolocation' in navigator)){ toast('此裝置/瀏覽器不支援定位'); return; }
  ride.gpsStatus = '要求定位權限中…'; renderRide();
  try{
    ride.gpsWatch = navigator.geolocation.watchPosition(onFix, onGpsErr, {enableHighAccuracy:true, maximumAge:3000, timeout:25000});
  }catch(e){ onGpsErr({code:1}); }
}
function onGpsErr(e){
  if (e.code === 1){
    if (ride.gpsWatch != null){ try{ navigator.geolocation.clearWatch(ride.gpsWatch); }catch(_){} }
    ride.gpsWatch = null; ride.gpsStatus = '定位被封鎖'; toast(GPS_BLOCK_MSG, 7000);
  } else ride.gpsStatus = e.code === 3 ? '等待訊號中（地下常收不到）' : '暫時無法定位';
  renderRide();
}
function onFix(pos){
  const {latitude:la, longitude:lo, accuracy:acc} = pos.coords;
  ride.lastFix = {la, lo, acc, t:Date.now()};
  ride.gpsStatus = `訊號 ±${Math.round(acc)}m`;
  userDot.position.copy(P(la, lo)); updateUserDot(acc);
  const r = clamp(acc/1000, 0.03, 2); userDot.ring.scale.set(r, r, r);
  if (ride.active && acc < 300) snapToRoute(la, lo);
  renderRide();
}
function snapToRoute(la, lo){
  const p = P(la, lo, 0.09);
  let best = null;
  for (let j=ride.si; j<Math.min(segs3D.length, ride.si+2); j++){
    const S = segs3D[j];
    for (let i=0;i<=S.N;i++){
      const q = S.samples[i], d = Math.hypot(q.x-p.x, q.z-p.z);
      if (!best || d < best.d - (j > ride.si ? 0.05 : 0)) best = {d, j, u:i/S.N};
    }
  }
  if (!best || best.d > 0.8){ ride.off = best ? best.d : null; return; }
  ride.off = null;
  const S = segs3D[best.j];
  // 是否靠近某站
  let nearK = -1;
  S.stPos.forEach((sp,k) => { if (Math.hypot(sp.x-p.x, sp.z-p.z) < 0.2) nearK = k; });
  if (best.j > ride.si){
    if (nearK === 0) return;                 // 還在換乘站
    ride.si = best.j; ride.dispSi = -1;
    const L = S.line; train.stripeMat.color.set(L.color); train.stripeMat.emissive.set(L.color);
  } else {
    const cu = rideU();
    if (best.u < cu - 0.01 && cu - best.u < 0.2 && ride.phase !== 'board') return;   // 小幅倒退忽略
    if ((ride.phase === 'board') && nearK === 0) return;
  }
  const n = S.stU.length;
  if (nearK >= 0){
    if (nearK === ride.leg && ride.phase === 'dwell') return;
    if (nearK >= n-1){ if (ride.phase !== 'xfer' && ride.phase !== 'done') arriveAt(n-1); return; }
    ride.leg = nearK; ride.legT = 0; ride.phase = 'dwell'; ride.dwell = 20; renderRide(); return;
  }
  let leg = 0; while (leg < n-2 && best.u >= S.stU[leg+1]) leg++;
  const f = (best.u - S.stU[leg]) / Math.max(1e-6, S.stU[leg+1] - S.stU[leg]);
  ride.leg = leg; ride.legT = easeInv(clamp(f, 0, 0.98)); ride.phase = 'move';
  renderRide();
}

// ====== UI ======
let curRoute = null, fromId = store.get('from', null), toId = store.get('to', null), homeId = store.get('home', null), pendingSpot = null;

function switchTab(name){
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === name));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-'+name));
  $('#panel').scrollTop = 0;
  if (name === 'ride') renderRide();
  if (name === 'trip'){ renderTrip(); if (!ride.active) viewDay(); }
}

function stBtnHTML(id, ph){
  if (!id) return `<span class="ph">${ph}</span>`;
  const lines = (SERVE[id]||[]).map(l => badge(LMAP[l])).join('');
  return `<b>${esc(ST[id][0])}</b><small>${esc(ST[id][1])}</small><span class="bl">${lines}</span>`;
}
function renderOD(){
  $('#fromVal').innerHTML = stBtnHTML(fromId, '選擇出發站');
  $('#toVal').innerHTML = stBtnHTML(toId, '選擇目的站');
  $('#homeVal').innerHTML = homeId ? `${esc(ST[homeId][0])} <small>${esc(ST[homeId][1])}</small>` : '<span class="ph">尚未設定</span>';
  $('#btnHome').textContent = homeId ? `🏨 從住宿（${ST[homeId][0]}）出發` : '🏨 設定住宿車站';
}

// 車站選擇器
let pickCb = null, pickMode = 'st';
const stIndex = {}; for (const id in ST){ const v = ST[id]; stIndex[id] = normQ([v[0], v[1], v[4] || '', (SERVE[id]||[]).map(l => LMAP[l].name).join(' ')].join(' ')); }
function openPicker(title, cb){
  pickCb = cb; pickMode = 'st'; $('#pkTitle').textContent = title; $('#pkSearch').value = '';
  renderPicker(''); $('#picker').classList.add('open');
}
function closePicker(){ $('#picker').classList.remove('open'); }
function renderPicker(q){
  if (pickMode === 'spot') return renderSpotPicker(q);
  q = normQ(q.trim());
  let groups = {}; AREA_ORDER.forEach(g => groups[g] = []);
  for (const id in ST){
    if (q && !stIndex[id].includes(q)) continue;
    (groups[area(id)] = groups[area(id)] || []).push(id);
  }
  const rank = id => { if (!q) return 0; const nm = normQ(ST[id][0]); return nm === q ? 0 : nm.startsWith(q) ? 1 : nm.includes(q) ? 2 : 3; };
  for (const g in groups) groups[g].sort((x,y) => (rank(x) - rank(y)) || ((SERVE[y]||[]).length - (SERVE[x]||[]).length));
  if (q){ const all = Object.values(groups).flat().sort((x,y) => rank(x) - rank(y)); const best = all.filter(x => rank(x) <= 1);
    if (best.length){ const bs = new Set(best); for (const g in groups) groups[g] = groups[g].filter(x => !bs.has(x)); groups = Object.assign({'最符合': best}, groups); } }
  let h = '';
  const quick = [homeId, ...store.get('recent', [])].filter((x,i,a) => x && ST[x] && a.indexOf(x) === i).slice(0,6);
  if (!q && quick.length) h += `<div class="pk-g">常用</div>` + quick.map(pkItem).join('');
  for (const g in groups) if (groups[g].length) h += `<div class="pk-g">${g}</div>` + groups[g].map(pkItem).join('');
  $('#pkList').innerHTML = h || '<div class="empty">找不到車站，試試日文、英文或中文</div>';
}
function pkItem(id){
  const sub = ST[id][1] || (SERVE[id]||[]).map(l => LMAP[l].name).filter((x,i,a) => a.indexOf(x) === i).slice(0,3).join('・');
  return `<button class="pk-i" data-id="${id}"><span><b>${esc(ST[id][0])}</b><small>${esc(sub)}${id===homeId?' · 🏨住宿':''}</small></span><span class="bl">${(SERVE[id]||[]).map(l=>badge(LMAP[l])).join('')}</span></button>`;
}
function pushRecent(id){ const r = store.get('recent', []).filter(x => x !== id); r.unshift(id); store.set('recent', r.slice(0,6)); }

function doPlan(spot){
  if (!fromId || !toId){ toast('請先選擇出發站和目的站'); return; }
  if (fromId === toId){ toast('出發站和目的站相同'); return; }
  if (ride.active) stopRide();
  store.set('from', fromId); store.set('to', toId); pushRecent(fromId); pushRecent(toId);
  const r = planRoute(fromId, toId, $('#fewer').checked);
  if (!r){ toast('找不到路線'); return; }
  r.spot = spot || null;
  curRoute = r;
  buildRoute3D(r);
  renderResult(r);
  switchTab('plan');
  setTimeout(() => { const pn = $('#panel'), el = $('#result'); pn.scrollTo({top: el.getBoundingClientRect().top - pn.getBoundingClientRect().top + pn.scrollTop - 8, behavior:'smooth'}); }, 50);
}

function renderResult(r){
  const eta = new Date(Date.now() + r.total*60000);
  let h = `<div class="card sum">
    <div class="sum-top"><div><div class="big">約 ${r.total} <small>分</small></div><div class="mut">轉乘 ${r.transfers} 次 · 共 ${r.stops} 站 · 現在出發約 ${hhmm(eta)} 到</div></div></div>
    <div class="row"><button class="primary" id="btnRide">🚃 開始乘車導航</button></div>
    <a class="ext" href="${gmapsTransit(r.from, r.to)}" target="_blank" rel="noopener">在 Google 地圖查即時班次 ↗</a>
  </div><div class="tl">`;
  h += `<div class="tl-i start"><i></i><div><b>${esc(ST[r.from][0])}</b> <span class="mut">出發</span></div></div>`;
  for (const s of r.steps){
    if (s.type === 'walk') h += `<div class="tl-i walk"><i></i><div>🚶 步行到 <b>${esc(ST[s.b][0])}</b>（約 ${s.min} 分）</div></div>`;
    else if (s.type === 'xfer') h += `<div class="tl-i walk"><i></i><div>🔁 在 <b>${esc(ST[s.at][0])}</b> 站內換乘（約 ${s.min} 分）</div></div>`;
    else {
      const L = LMAP[s.line], n = s.stations.length - 1;
      h += `<div class="tl-i ride" style="--c:${L.color}"><i></i><div class="ride-card">
        <div class="rc-h">${badge(L)}<div><b>${esc(L.name)}</b><small>${esc(L.op)} · ${esc(L.en)}</small></div></div>
        <div class="rc-d">往 <b>${esc(s.dirLabel)}</b></div>
        <div class="rc-m">${esc(ST[s.stations[0]][0])} → ${esc(ST[s.stations[n]][0])} · 搭 ${n} 站 · 約 ${s.total} 分<br><span class="mut">下一站：${esc(ST[s.stations[1]][0])}</span></div>
        <details><summary>經過車站</summary><ol>${s.stations.map(x => `<li>${esc(ST[x][0])} <small>${esc(ST[x][1])}</small></li>`).join('')}</ol></details>
        <div class="tip">💡 ${esc(L.tip)}</div>
      </div></div>`;
    }
  }
  h += `<div class="tl-i end"><i></i><div><b>${esc(ST[r.to][0])}</b> <span class="mut">抵達</span></div></div></div>`;
  if (r.spot) h += spotExitCard(r.spot);
  h += `<p class="note">時間為一般班次的估算（含平均候車），實際依時刻表與車種而異；出發前可用上方 Google 地圖連結確認。</p>`;
  $('#result').innerHTML = h;
  $('#btnRide').onclick = () => startRide(curRoute);
}
function spotExitCard(sp){
  return `<div class="card exit"><div>📍 出站後前往 <b>${sp.i || ""} ${esc(sp.n)}</b></div>
   <div class="mut">${esc(ST[sp.st][0])}${sp.ex ? ' · '+esc(sp.ex) : ''} · 步行約 ${sp.w} 分</div>
   <a class="ext" href="${gmapsWalk(sp)}" target="_blank" rel="noopener">步行路線（Google 地圖）↗</a></div>`;
}

// 景點
let spotArea = CITY.spotAreas[0];
function renderSpots(){
  const areas = CITY.spotAreas;
  $('#spotChips').innerHTML = areas.map(a => `<button class="chip ${a===spotArea?'on':''}" data-a="${a}">${a}</button>`).join('');
  $('#spotList').innerHTML = SPOTS.map((sp,i) => ({sp,i})).filter(x => x.sp.a === spotArea).map(({sp,i}) => `
    <div class="card spot">
      <div class="sp-h"><b><span class="ico">${sp.i}</span>${esc(sp.n)}</b><button class="star ${curTrip().wish.includes(sp.n)?'on':''}" data-star="${i}">${curTrip().wish.includes(sp.n)?'★':'☆'}</button></div>
      <div class="mut">${esc(sp.d)}</div>
      <div class="sp-st">🚉 <b>${esc(ST[sp.st][0])}</b>站 ${sp.ex ? '· '+esc(sp.ex) : ''} · 步行約 ${sp.w} 分 <span class="bl">${(SERVE[sp.st]||[]).map(l=>badge(LMAP[l])).join('')}</span></div>
      <div class="row">
        <button class="sec" data-go="${i}" data-from="home">🏨 從住宿去</button>
        <button class="sec" data-go="${i}" data-from="from">🚉 從出發站去</button>
      </div>
      <div class="row"><select class="sel" data-dsel="${i}">${dayOptions()}</select><button class="sec" data-addday="${i}" style="flex:.8">${spotDayOf(sp.n) >= 0 ? '✅ 已在第'+(spotDayOf(sp.n)+1)+'天' : '＋ 排入行程'}</button></div>
      <a class="ext" href="${gmapsWalk(sp)}" target="_blank" rel="noopener">出站步行路線 ↗</a>
    </div>`).join('');
  document.querySelectorAll('[data-dsel]').forEach(s => { const d = spotDayOf(SPOTS[+s.dataset.dsel].n); s.value = d >= 0 ? d : Math.min(curDay, curTrip().days.length-1); });
}
function goSpot(i, mode){
  const sp = SPOTS[i];
  const run = () => { toId = sp.st; renderOD(); doPlan(sp); };
  if (mode === 'home'){
    if (!homeId){ openPicker('先設定你的住宿車站', id => { homeId = id; store.set('home', id); syncHome(id); fromId = id; renderOD(); run(); }); return; }
    fromId = homeId;
  } else if (!fromId){ openPicker('選擇出發站', id => { fromId = id; renderOD(); run(); }); return; }
  run();
}

// 乘車中畫面
function renderRide(){
  const box = $('#rideBox');
  if (!ride.active){
    $('#miniHud').classList.remove('show');
    box.innerHTML = (curRoute
      ? `<div class="card"><p>已規劃 <b>${esc(ST[curRoute.from][0])} → ${esc(ST[curRoute.to][0])}</b>。上車前按下開始，3D 列車會跟著你的行程移動。</p><button class="primary" id="rbStart">🚃 開始乘車導航</button></div>`
      : '') + dayRideList();
    const b = $('#rbStart'); if (b) b.onclick = () => startRide(curRoute);
    box.querySelectorAll('[data-rideleg]').forEach(x => x.onclick = () => rideLeg(x.dataset.rideleg));
    return;
  }
  const S = curSeg(), st = S.step, L = S.line, n = st.stations.length;
  const nm = k => esc(ST[st.stations[k]][0]);
  const isLastSeg = ride.si === segs3D.length-1;
  const nextK = Math.min(ride.leg + 1, n-1);
  const left = (n-1) - ride.leg;
  let main = '', btn = '';
  if (ride.phase === 'board'){
    main = `<div class="ph-l">請在 <b>${nm(0)}</b> 搭乘</div><div class="big2">${badge(L)} ${esc(L.name)}</div><div class="dir">往 ${esc(st.dirLabel)}</div><div class="mut">下一站 ${nm(1)} · 搭 ${n-1} 站在 <b>${nm(n-1)}</b> ${isLastSeg?'下車':'換乘'}</div>`;
    btn = `<button class="primary" id="rbGo">✅ 已上車，列車出發</button>`;
  } else if (ride.phase === 'move' || ride.phase === 'dwell'){
    const alight = nextK === n-1;
    if (ride.phase === 'dwell') main = `<div class="ph-l">停靠中</div><div class="big2">${nm(ride.leg)}</div><div class="mut">下一站 ${nm(nextK)}</div>`;
    else main = `<div class="ph-l">下一站</div><div class="big2 ${alight?'alert':''}">${nm(nextK)}</div>`;
    main += alight ? `<div class="warn">⚠️ 下一站${isLastSeg?'下車':'請下車換乘'}！</div>` : `<div class="mut">還有 <b>${left}</b> 站在 <b>${nm(n-1)}</b> ${isLastSeg?'下車':'換乘'}</div>`;
    if (alight && !ride.alerted[ride.si]){ ride.alerted[ride.si] = 1; buzz([300,150,300]); toast(`下一站 ${ST[st.stations[n-1]][0]} ${isLastSeg?'下車':'換乘'}`); }
    btn = `<div class="row"><button class="sec" id="rbPrev">◀ 上一站</button><button class="primary" id="rbNext">已到 ${nm(nextK)} ▶</button></div>`;
  } else if (ride.phase === 'xfer'){
    const nS = segs3D[ride.si+1], nL = nS.line;
    const mid = curRoute.steps.slice(curRoute.steps.indexOf(st)+1, curRoute.steps.indexOf(nS.step)).filter(x => x.type !== 'ride');
    const how = mid.map(x => x.type === 'walk' ? `🚶 步行到 ${esc(ST[x.b][0])}（約${x.min}分）` : `🔁 站內換乘（約${x.min}分）`).join('<br>');
    main = `<div class="ph-l">在 <b>${nm(n-1)}</b> 換乘</div><div class="big2">${badge(nL)} ${esc(nL.name)}</div><div class="dir">往 ${esc(nS.step.dirLabel)}</div><div class="mut">${how}<br>下一站 ${esc(ST[nS.step.stations[1]][0])}</div><div class="tip">💡 ${esc(nL.tip)}</div>`;
    btn = `<div class="row"><button class="sec" id="rbPrev">◀ 返回</button><button class="primary" id="rbGo">✅ 已搭上 ${esc(nL.name)}</button></div>`;
  } else if (ride.phase === 'done'){
    main = `<div class="ph-l">🎉 已抵達</div><div class="big2">${nm(n-1)}</div>`;
    const tailWalk = curRoute.steps[curRoute.steps.length-1];
    if (tailWalk.type === 'walk') main += `<div class="mut">🚶 再步行到 ${esc(ST[tailWalk.b][0])}（約${tailWalk.min}分）</div>`;
    if (curRoute.spot) main += spotExitCard(curRoute.spot);
    btn = `<div class="row"><button class="sec" id="rbPrev">◀ 返回</button><button class="primary" id="rbEnd">結束導航</button></div>`;
  }
  const strip = st.stations.map((x,k) => {
    const cls = k < ride.leg ? 'past' : k === ride.leg ? (ride.phase === 'move' ? 'past' : 'cur') : (k === nextK && ride.phase === 'move' ? 'next' : '');
    return `<span class="sx ${cls}">${esc(ST[x][0])}</span>`;
  }).join('<span class="sa">›</span>');
  const segProg = Math.round((ride.phase === 'board' ? 0 : rideU())*100);
  const gpsOn = ride.gpsWatch != null;
  const stale = gpsOn && ride.lastFix && Date.now() - ride.lastFix.t > 45000;
  box.innerHTML = `
  <div class="card ridebox" style="--c:${L.color}">
    <div class="rc-h">${badge(L)}<div><b>${esc(L.name)}</b><small>第 ${ride.si+1}/${segs3D.length} 段 · 往 ${esc(st.dirLabel)}</small></div></div>
    <div class="ride-main">${main}</div>
    <div class="prog"><i style="width:${segProg}%"></i></div>
    <div class="strip" id="strip">${strip}</div>
    <div class="eta" id="etaLine"></div>
    ${btn}
  </div>
  <div class="card ctl">
    <div class="ctl-r"><span>模擬速度</span><div class="seg">${[1,10,60].map(v => `<button data-sp="${v}" class="${ride.speed===v?'on':''}">${v===1?'實際':v+'×'}</button>`).join('')}</div></div>
    <div class="ctl-r"><span>📡 GPS 校正 <small class="mut">${esc(stale ? '無訊號，時間推算中' : ride.gpsStatus)}${ride.off ? ` · 偏離路線 ${ride.off.toFixed(1)}km` : ''}</small></span><button class="sw ${gpsOn?'on':''}" id="rbGps">${gpsOn?'開':'關'}</button></div>
    <div class="ctl-r"><button class="sec" id="rbView">${camS.follow ? '🗺️ 看全路線' : '🎥 跟隨列車'}</button><button class="sec danger" id="rbStop">結束導航</button></div>
    <p class="note">在地下鐵通常收不到 GPS：會依各站行車時間自動推算位置，到站時也可按「已到 ○○」校正。</p>
  </div>`;
  const on = (id, f) => { const e = $('#'+id); if (e) e.onclick = f; };
  on('rbGo', rideNext); on('rbNext', rideNext); on('rbPrev', ridePrev); on('rbEnd', stopRide); on('rbStop', stopRide); on('rbGps', toggleGPS);
  on('rbView', () => { if (camS.follow){ fitPoints(segs3D.flatMap(s => s.samples)); } else { camS.follow = true; camS.dist = 1.6; camS.el = 0.42; camS.azOff = 0; } renderRide(); });
  box.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { ride.speed = +b.dataset.sp; renderRide(); });
  const cur = box.querySelector('.sx.cur, .sx.next'); if (cur) cur.scrollIntoView({inline:'center', block:'nearest'});
  renderRideHud(false);
}
function renderRideHud(tickOnly){
  if (!ride.active) return;
  const S = curSeg(), st = S.step, n = st.stations.length;
  const rem = Math.max(0, Math.round(remainingMin()/1));
  const etaEl = $('#etaLine');
  if (etaEl) etaEl.innerHTML = `預計 <b>${hhmm(new Date(Date.now()+rem*60000))}</b> 抵達 ${esc(ST[curRoute.to][0])}（約 ${rem} 分）`;
  const prog = document.querySelector('.ridebox .prog i');
  if (prog && ride.phase !== 'board') prog.style.width = Math.round(rideU()*100) + '%';
  const nextK = Math.min(ride.leg + 1, n-1);
  let txt;
  if (ride.phase === 'board') txt = `在 ${ST[st.stations[0]][0]} 搭 ${S.line.name}`;
  else if (ride.phase === 'xfer') txt = `換乘 ${segs3D[ride.si+1].line.name}`;
  else if (ride.phase === 'done') txt = `已抵達 ${ST[st.stations[n-1]][0]}`;
  else txt = `${ride.phase === 'dwell' ? '停靠 ' + ST[st.stations[ride.leg]][0] + ' · ' : ''}下一站 ${ST[st.stations[nextK]][0]} · 還有 ${(n-1)-ride.leg} 站`;
  $('#miniHud').innerHTML = `${badge(S.line)}<span class="mh-t">${esc(txt)}</span><b>${rem}分</b>`;
  $('#miniHud').classList.add('show');
}

function findNear(){
  if (!('geolocation' in navigator)){ toast('此瀏覽器不支援定位'); return; }
  toast('取得目前位置中…');
  navigator.geolocation.getCurrentPosition(pos => {
    const near = nearestStations(pos.coords.latitude, pos.coords.longitude, 4);
    $('#nearList').innerHTML = near.map(([id,d]) => `<button class="chip" data-near="${id}">${esc(ST[id][0])} <small>${d<1?Math.round(d*1000)+'m':d.toFixed(1)+'km'}</small></button>`).join('');
    userDot.position.copy(P(pos.coords.latitude, pos.coords.longitude)); updateUserDot(pos.coords.accuracy);
  }, e => toast(e.code === 1 ? GPS_BLOCK_MSG : '無法取得位置，請稍後再試', 7000), {enableHighAccuracy:true, timeout:15000});
}

function initUI(){
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.t));
  $('#btnFrom').onclick = () => openPicker('選擇出發站', id => { fromId = id; renderOD(); });
  $('#btnTo').onclick = () => openPicker('選擇目的站', id => { toId = id; renderOD(); });
  $('#swap').onclick = () => { [fromId, toId] = [toId, fromId]; renderOD(); };
  $('#btnPlan').onclick = () => doPlan(null);
  $('#btnHome').onclick = () => {
    if (!homeId) openPicker('設定住宿車站', id => { homeId = id; store.set('home', id); syncHome(id); fromId = id; renderOD(); });
    else { fromId = homeId; renderOD(); }
  };
  $('#btnSetHome').onclick = () => openPicker('設定住宿車站', id => { homeId = id; store.set('home', id); syncHome(id); renderOD(); toast('已設定住宿車站：' + ST[id][0]); });
  $('#btnNear').onclick = findNear;
  $('#btnGpsTest').onclick = findNear;
  $('#nearList').onclick = e => { const b = e.target.closest('[data-near]'); if (b){ fromId = b.dataset.near; renderOD(); switchTab('plan'); } };
  $('#pkClose').onclick = closePicker;
  $('#pkSearch').oninput = e => renderPicker(e.target.value);
  $('#pkList').onclick = e => { const b = e.target.closest('.pk-i'); if (!b) return; closePicker(); const cb = pickCb; pickCb = null; cb && cb(b.dataset.id != null ? b.dataset.id : b.dataset.spot); };
  $('#spotChips').onclick = e => { const b = e.target.closest('[data-a]'); if (b){ spotArea = b.dataset.a; renderSpots(); } };
  $('#spotList').onclick = e => {
    const b = e.target.closest('[data-go]'); if (b) goSpot(+b.dataset.go, b.dataset.from);
    const s = e.target.closest('[data-star]'); if (s){ toggleWish(SPOTS[+s.dataset.star].n); }
    const ad = e.target.closest('[data-addday]'); if (ad){ const i = +ad.dataset.addday; addSpotToDay(SPOTS[i].n, +$(`[data-dsel="${i}"]`).value); }
  };
  $('#btnBig').onclick = () => document.body.classList.toggle('big');
  $('#popClose').onclick = closePop;
  $('#pop').onclick = e => { if (e.target.id === 'pop') closePop(); };
  $('#btnFit').onclick = () => { if (hlLine){ buildRoute3D(curRoute); if (!curRoute) { camS.tT = new THREE.Vector3(0,0,-1); camS.tD = CITY.view || 20; } return; } if (ride.active && !camS.follow){ camS.follow = true; camS.dist = 1.6; camS.el = 0.42; } else if (curRoute) fitPoints(segs3D.length ? segs3D.flatMap(s => s.samples) : [P(ST[curRoute.from][2],ST[curRoute.from][3])]); else { camS.tT = new THREE.Vector3(0,0,-1); camS.tD = CITY.view || 20; camS.follow = false; } if (ride.active) renderRide(); };
  $('#miniHud').onclick = () => switchTab('ride');
  if (IN_FRAME) $('#frameNote').style.display = 'block';
  $('#cityTitle').textContent = '🚃 ' + CITY.title; $('#citySub').textContent = CITY.sub;
  document.title = CITY.title; $('#cityTips').innerHTML = CITY_TIPS; $('#tipsTitle').textContent = `🧳 ${CITY.name}搭車小提醒`;
  $('#pkSearch').placeholder = SEARCH_PH;
  $('#cityBtn').onclick = () => {
    const info = {osaka:['大阪・京都・奈良・神戶','JR、地鐵、私鐵、USJ、關西機場'], tokyo:['東京・橫濱・鎌倉・成田','地鐵、都營、JR、私鐵、羽田／成田機場'], taipei:['台北・新北・桃園機場','台北捷運 7 線＋機場捷運'], taichung:['台中・豐原・彰化','捷運綠線＋台鐵山線、高鐵台中站']};
    openPop(`<div class="pop-h"><b>切換城市</b><span class="mut">每個城市的行程、住宿車站分開保存</span></div><div class="citylist">${CITY_IDS.map(id => `<button data-city="${id}" class="${id===CITY_ID?'on':''}"><span><b>${CITIES[id].name}</b> <span class="mut">${info[id][0]}</span><br><small>${info[id][1]}</small></span><span>${id===CITY_ID?'✓':'›'}</span></button>`).join('')}</div>`);
    $('#popBody').onclick = e => { const b = e.target.closest('[data-city]'); if (b){ if (b.dataset.city === CITY_ID) closePop(); else { toast('切換到' + CITIES[b.dataset.city].name + '…'); switchCity(b.dataset.city); } } };
  };
  if (location.hash.slice(1) !== CITY_ID && !location.hash.startsWith('#trip=')){ try{ history.replaceState(null, '', '#' + CITY_ID); }catch(e){} }
  initTrips();
  renderOD(); renderSpots(); renderRide();
}

window.addEventListener('DOMContentLoaded', () => {
  if (!window.THREE){ document.body.innerHTML = '<p style="padding:24px;color:#fff">3D 函式庫載入失敗，請確認網路連線後重新整理。</p>'; return; }
  init3D(); initUI();
});
