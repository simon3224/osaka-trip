// ====== 景點 3D 地標模型（程式繪製的低多邊形造型） ======
// 單位：1 = MODEL_U 公里（約 11m）；模型原點在地面中心。box/cyl/cone 以底部為基準。
const MODEL_U = 0.011;
const LM_SOLID = new THREE.MeshStandardMaterial({vertexColors:true, flatShading:true, roughness:0.72, metalness:0.06});
const LM_GLOW = new THREE.MeshBasicMaterial({vertexColors:true});

class MB {
  constructor(){ this.s = []; this.g = []; this.subs = []; }
  _p(geo, c, x, y, z, o){ (o && o.glow ? this.g : this.s).push({geo, c, x, y, z, o:o || {}}); return this; }
  box(w,h,d,c,x=0,y=0,z=0,o){ const g = new THREE.BoxGeometry(w,h,d); g.translate(0,h/2,0); return this._p(g,c,x,y,z,o); }
  cyl(rt,rb,h,c,x=0,y=0,z=0,o){ const g = new THREE.CylinderGeometry(rt,rb,h,(o&&o.seg)||14); g.translate(0,h/2,0); return this._p(g,c,x,y,z,o); }
  cone(r,h,c,x=0,y=0,z=0,o){ const g = new THREE.ConeGeometry(r,h,(o&&o.seg)||14); g.translate(0,h/2,0); return this._p(g,c,x,y,z,o); }
  sph(r,c,x=0,y=0,z=0,o){ return this._p(new THREE.SphereGeometry(r,(o&&o.seg)||14,10),c,x,y,z,o); }
  tor(R,r,c,x=0,y=0,z=0,o){ return this._p(new THREE.TorusGeometry(R,r,8,(o&&o.seg)||32),c,x,y,z,o); }
  lathe(pts,c,x=0,y=0,z=0,o){ return this._p(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0],p[1])),(o&&o.seg)||16),c,x,y,z,o); }
  // 日式屋頂：四角錐壓扁＋簷口
  roof(w,d,h,c,x=0,y=0,z=0,o={}){
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI/4); g.translate(0, .5, 0);
    return this._p(g, c, x, y, z, Object.assign({}, o, {sx:w, sy:h, sz:d}));
  }
  sub(px=0, py=0, pz=0){ const s = new MB(); s.pivot = [px,py,pz]; this.subs.push(s); return s; }
}
function mergeParts(parts){
  if (!parts.length) return null;
  let n = 0; const list = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const p of parts){
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (g !== p.geo) p.geo.dispose();
    e.set(p.o.rx||0, p.o.ry||0, p.o.rz||0); q.setFromEuler(e);
    m.compose(v.set(p.x, p.y, p.z), q, sc.set(p.o.sx||1, p.o.sy||1, p.o.sz||1));
    g.applyMatrix4(m);
    list.push([g, new THREE.Color(p.c)]); n += g.attributes.position.count;
  }
  const pos = new Float32Array(n*3), nor = new Float32Array(n*3), col = new Float32Array(n*3); let o = 0;
  for (const [g, c] of list){
    const k = g.attributes.position.count;
    pos.set(g.attributes.position.array, o*3); nor.set(g.attributes.normal.array, o*3);
    for (let i=0;i<k;i++){ col[(o+i)*3] = c.r; col[(o+i)*3+1] = c.g; col[(o+i)*3+2] = c.b; }
    o += k; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos,3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor,3));
  out.setAttribute('color', new THREE.BufferAttribute(col,3));
  out.computeBoundingSphere();
  return out;
}
function mbToGroup(b){
  const grp = new THREE.Group();
  const s = mergeParts(b.s), g = mergeParts(b.g);
  if (s) grp.add(new THREE.Mesh(s, LM_SOLID));
  if (g) grp.add(new THREE.Mesh(g, LM_GLOW));
  grp.userData.subs = b.subs.map(sb => { const sg = mbToGroup(sb); sg.position.set(...sb.pivot); sg.userData.anim = sb.anim || null; grp.add(sg); return sg; });
  return grp;
}

// ---- 調色盤 ----
const C = {white:'#f2efe6', stone:'#8f8a80', stoneD:'#6e6a62', roofG:'#3f8f7a', roofD:'#3a4250', gold:'#e8b93a', ver:'#d8452b', red:'#c8322b',
  wood:'#7a4b2a', woodD:'#4e321f', glass:'#7fb4d8', glassD:'#4d7ea8', steel:'#b8c2cc', green:'#3f9d4f', greenD:'#2f6e3c', leaf:'#56b25e',
  water:'#2f7dc4', sand:'#d9c39a', brick:'#a5523a', cream:'#efe0bd', pink:'#f19ac2', navy:'#24365c', black:'#22262e', orange:'#f08a2c', yellow:'#f4d03f'};
const NEON = ['#ff3b6b','#ffd23f','#3bd1ff','#7cff6b','#ff7ad9','#ff8a3d'];
function rng(seed){ let a = seed|0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- 共用零件 ----
function pad(b, w, d, c='#1b2440'){ b.box(w, .4, d, c, 0, 0, 0); }
function tree(b, x, z, h=4, c=C.leaf){ b.cyl(.25,.3,h*.45,C.woodD,x,0,z,{seg:6}); b.sph(h*.35,c,x,h*.62,z,{seg:8}); }
function trees(b, n, R, seed=1, h=4, r0=0){ const r = rng(seed); for (let i=0;i<n;i++){ const a = r()*Math.PI*2, d = r0 + Math.sqrt(r())*R; tree(b, Math.cos(a)*d, Math.sin(a)*d, h*(0.7+r()*0.6), r() > .3 ? C.leaf : C.greenD); } }
function water(b, w, d, x=0, z=0){ b.box(w, .3, d, C.water, x, 0.05, z); }
function lantern(b, x, y, z, s=1, c='#ff5a3c'){ b.cyl(.55*s,.55*s,1.2*s,c,x,y,z,{glow:true, seg:10}); b.cyl(.6*s,.6*s,.15*s,C.black,x,y+1.2*s,z,{seg:10}); }
function torii(b, x, z, h=8, ry=0, c=C.ver){
  const w = h*.9, o = {ry};
  const cs = Math.cos(ry), sn = Math.sin(ry), P = (dx) => [x + dx*cs, z - dx*sn];
  for (const dx of [-w/2, w/2]){ const [px,pz] = P(dx); b.cyl(h*.06,h*.07,h,c,px,0,pz,{seg:10}); }
  b.box(w*1.35, h*.08, h*.12, C.black, x, h*.94, z, o);
  b.box(w*1.25, h*.07, h*.1, c, x, h*.86, z, o);
  b.box(w*1.05, h*.06, h*.08, c, x, h*.7, z, o);
}
function pagoda(b, x, z, tiers=5, w=6, h=3.2, wall=C.ver, roof=C.roofD){
  let y = 0;
  b.box(w*1.2, .8, w*1.2, C.stone, x, 0, z); y = .8;
  for (let i=0;i<tiers;i++){
    const k = 1 - i*0.12, ww = w*k;
    b.box(ww*.75, h*.55, ww*.75, wall, x, y, z); y += h*.55;
    b.roof(ww*1.45, ww*1.45, h*.45, roof, x, y, z); y += h*.32;
  }
  b.cyl(.15,.15,h*1.6,C.gold,x,y,z,{seg:6}); for (let i=0;i<5;i++) b.tor(.45,.1,C.gold,x,y+.4+i*.25,z,{rx:Math.PI/2, seg:10});
  return y + h*1.6;
}
function jpCastle(b, tiers=5, wall=C.white, roof=C.roofG){
  b.box(16, 4, 14, C.stone, 0, 0, 0, {}); b.box(14, 1.2, 12, C.stoneD, 0, 4, 0);
  let y = 5.2, w = 12, d = 10;
  for (let i=0;i<tiers;i++){
    const h = i === tiers-1 ? 3.2 : 2.6;
    b.box(w, h, d, wall, 0, y, 0); y += h;
    b.roof(w*1.35, d*1.35, 2.2, roof, 0, y-.3, 0); y += 1.4;
    if (i % 2 === 1) b.roof(w*.5, 2.4, 1.6, roof, 0, y-1.6, d*.55, {ry:0});
    w *= .8; d *= .8;
  }
  b.box(.6,1.2,.6,C.gold,-w*.6,y+.2,0); b.box(.6,1.2,.6,C.gold,w*.6,y+.2,0);
  return y + 1.5;
}
function hall(b, w, d, h, wall=C.wood, roof=C.roofD, x=0, z=0, y0=1){
  b.box(w*1.1, y0, d*1.1, C.stone, x, 0, z);
  b.box(w, h, d, wall, x, y0, z);
  for (let i=-2;i<=2;i++) b.box(.5, h, .5, C.ver, x + i*w/4.5, y0, z + d/2);
  b.roof(w*1.5, d*1.6, h*1.1, roof, x, y0+h-.2, z);
  return y0 + h + h*1.1;
}
function latticeTower(b, H, c1, c2, legs=4){
  const segs = 9;
  for (let i=0;i<segs;i++){
    const y = i*H/segs, t = i/segs, r = 6*(1-t)**1.6 + .7;
    b.cyl(r*.86, r, H/segs*.98, i%2 ? c1 : c2, 0, y, 0, {seg:legs});
  }
  b.box(5, 2, 5, c2, 0, H*.38, 0, {ry:Math.PI/4}); b.box(3.2, 1.6, 3.2, c2, 0, H*.68, 0, {ry:Math.PI/4});
  b.cyl(.2, .35, H*.25, c1, 0, H, 0, {seg:6});
  b.sph(.5, '#ff4040', 0, H*1.25, 0, {glow:true, seg:8});
  return H*1.27;
}
function skyscraper(b, w, h, c=C.glass, x=0, z=0, tiers=1){
  let y = 0, ww = w;
  for (let i=0;i<tiers;i++){ const hh = h/tiers; b.box(ww, hh, ww, c, x, y, z); y += hh; ww *= .82; }
  for (let i=1;i<10;i++) b.box(w*1.01, .15, w*1.01, '#ffeeb0', x, h*i/10*.9, z, {glow:true, sy:1});
  return y;
}
function ferris(b, R, x=0, z=0, cabinColors=NEON){
  b.cyl(.5,.8,R+1.5,C.steel,x-1.2,0,z,{rz:-.18, seg:6}); b.cyl(.5,.8,R+1.5,C.steel,x+1.2,0,z,{rz:.18, seg:6});
  const w = b.sub(x, R+1.5, z);
  w.tor(R, .25, C.white, 0, 0, 0, {seg:40}); w.tor(R*.98, .18, '#ffd23f', 0, 0, 0, {glow:true, seg:40});
  for (let i=0;i<16;i++){ const a = i/16*Math.PI*2;
    w.box(.15, R, .15, C.steel, 0, 0, 0, {rz:a});
    w.box(1.2, 1.2, 1.2, cabinColors[i % cabinColors.length], Math.cos(a)*R, Math.sin(a)*R - .6, 0, {glow:i%2===0});
  }
  w.anim = (g, t) => { g.rotation.z = t*0.15; };
  return R*2 + 2;
}
function stalls(b, n, spacing, seed, glowy=false, z0=0){
  const r = rng(seed);
  for (let i=0;i<n;i++){
    const x = (i - (n-1)/2)*spacing, side = i%2 ? 1 : -1;
    b.box(spacing*.8, 2.2, 2.4, C.cream, x, 0, z0 + side*2.6);
    b.box(spacing*.9, .3, 3, NEON[(r()*NEON.length)|0], x, 2.4, z0 + side*2.2, {rx:side*.25, glow:glowy});
    if (glowy && i%2===0) lantern(b, x, 2.9, z0 + side*1.4, .5, '#ffcf6b');
  }
}
function arcade(b, L, w, c='#9fd0ff', seed=3){
  const r = rng(seed);
  for (let i=0;i<8;i++){ const x = -L/2 + L*(i+.5)/8, hh = 3 + r()*3;
    b.box(L/8*.95, hh, 3, ['#d8cbb5','#c9b9a1','#e6dccb'][i%3], x, 0, -w/2-1.5); b.box(L/8*.95, hh, 3, ['#c9b9a1','#e6dccb','#d8cbb5'][i%3], x, 0, w/2+1.5);
    b.box(L/8*.6, .7, .2, NEON[i%NEON.length], x, 2.4, -w/2+.05, {glow:true}); b.box(L/8*.6, .7, .2, NEON[(i+3)%NEON.length], x, 2.4, w/2-.05, {glow:true}); }
  for (let i=0;i<=16;i++){ const x = -L/2 + L*i/16; b.tor(w/2+.5, .18, c, x, 4.4, 0, {ry:Math.PI/2, seg:12, sy:.55}); }
  b.box(L, .25, .25, c, 0, 4.4 + (w/2+.5)*.55, 0, {glow:true});
  for (const z of [-(w/2+.5), w/2+.5]) b.box(L, .3, .3, C.steel, 0, 4.3, z);
  return 6;
}
function neonBlock(b, n, seed, h0=5){
  const r = rng(seed);
  for (let i=0;i<n;i++){ const x = (i-(n-1)/2)*4.5, h = h0 + r()*7, z = (i%2?1:-1)*4;
    b.box(4, h, 4, ['#3a4056','#4a4f66','#2f3448'][i%3], x, 0, z);
    b.box(.3, h*.6, 2.6, NEON[(r()*6)|0], x + (i%2? -2.1: 2.1)*0, h*.3, z + (i%2?-2.05:2.05), {glow:true, ry:Math.PI/2});
    b.box(3, 1, .2, NEON[(r()*6)|0], x, h-1.6, z + (i%2?-2.1:2.1), {glow:true}); }
}
function oldStreet(b, n, seed, wall='#3b2f2a', roof=C.roofD){
  const r = rng(seed);
  for (let i=0;i<n;i++){ const x = (i-(n-1)/2)*4.2, z = (i%2?1:-1)*3.6, h = 3 + r()*1.5;
    b.box(3.9, h, 3.5, wall, x, 0, z); b.roof(4.6, 4.4, 1.6, roof, x, h, z); lantern(b, x+1.2, 1.2, z + (i%2?-1.9:1.9), .35, '#ffb347'); }
}
function chineseGate(b, w=10, h=8, c=C.red, roofC='#2f8f5b'){
  for (const dx of [-w/2, -w/6, w/6, w/2]) b.cyl(.35,.4,h*(Math.abs(dx) > w/3 ? .75 : 1),c,dx,0,0,{seg:8});
  b.box(w*1.1, 1.1, .9, c, 0, h*.72, 0); b.box(w*.5, 1.4, .7, C.gold, 0, h*.72+1.2, 0, {glow:false});
  b.roof(w*.55, 2.2, 1.6, roofC, 0, h, 0); b.roof(w*.5, 2, 1.3, roofC, -w*.42, h*.78, 0); b.roof(w*.5, 2, 1.3, roofC, w*.42, h*.78, 0);
  lantern(b, -w*.32, h*.5, .6, .6); lantern(b, w*.32, h*.5, .6, .6);
  return h + 1.6;
}
function twTemple(b){
  b.box(16, 1, 12, C.stone, 0, 0, 0);
  b.box(14, 4.5, 10, C.red, 0, 1, 0);
  b.roof(17, 13, 2.6, '#c9772a', 0, 5.3, 0);
  for (const s of [-1,1]){ b.box(4, .5, .5, '#3fa36b', s*7.2, 7.4, 0, {rz:s*-.5}); b.sph(.5, C.gold, s*8.8, 8.6, 0); }
  b.box(5, 1.6, 4, C.red, 0, 7.6, 0); b.roof(7, 6, 1.6, '#c9772a', 0, 9.1, 0);
  for (const s of [-1,1]) b.box(2.5, .4, .4, '#3fa36b', s*3, 10.3, 0, {rz:s*-.6});
  b.sph(.8, C.gold, 0, 11, 0, {glow:true});
  lantern(b, -3, 1, 5.3, .7, '#ffcf6b'); lantern(b, 3, 1, 5.3, .7, '#ffcf6b');
  return 12;
}
function airport(b){
  b.box(30, 3.5, 9, '#d7dde4', 0, 0, 0); b.box(30, .6, 10, C.glassD, 0, 3.5, 0);
  b.cyl(1, 1.2, 9, '#e8ecf0', 14, 0, -7, {seg:8}); b.cyl(2.2, 1.6, 2, C.glassD, 14, 9, -7, {seg:8});
  // 飛機
  const p = b.sub(-4, 7, 9);
  p.cyl(1.1,1.1,12,C.white,0,0,-6,{rx:Math.PI/2}); p.cone(1.1,2.5,C.white,0,0,6,{rx:Math.PI/2});
  p.box(14,.25,2.4,'#cfd6de',0,-.1,0); p.box(5,.2,1.4,'#cfd6de',0,0,-5.4); p.box(.2,2.6,1.6,'#3a6fd8',0,0,-5.6);
  p.anim = (g, t) => { g.position.y = 7 + Math.sin(t*.6)*.6; g.rotation.z = Math.sin(t*.4)*.08; };
  return 12;
}
function onsen(b, steam=true, pool='#43c6ac'){
  b.box(14, .5, 10, '#8a7b66', 0, 0, 0); b.cyl(4.5, 4.5, .35, pool, -2, .5, 0, {seg:20, glow:true});
  b.box(5, 3, 4, C.wood, 4.5, .5, -2); b.roof(6.5, 5.5, 1.8, C.roofD, 4.5, 3.5, -2);
  if (steam){ const s = b.sub(-2, 1, 0); for (let i=0;i<5;i++) s.sph(1.2 + i*.25, '#e8eef5', Math.sin(i)*1.2, i*1.6, Math.cos(i*1.7)*1.2, {seg:8});
    s.anim = (g, t) => { g.position.y = 1 + (t*.6 % 2); }; }
  return 9;
}
function mountain(b, h=12, r=12, c='#4f8f4a', snow=false, x=0, z=0){
  b.cone(r, h, c, x, 0, z, {seg:9});
  if (snow) b.cone(r*.32, h*.32, '#f4f6f8', x, h*.68, z, {seg:9});
  return h;
}
function park(b, seed, pond=true){
  pad(b, 22, 18, '#244a2c');
  if (pond) water(b, 9, 6, 2, 2);
  trees(b, 14, 9, seed, 4.5, 2);
  return 6;
}
function robot(b){
  const W = '#dfe4ea', G = '#8c97a6';
  b.box(6, 1, 4, C.stoneD, 0, 0, 0);
  for (const s of [-1,1]){ b.box(1.6, 7, 1.8, W, s*1.3, 1, 0); b.box(2, 1.2, 2.6, G, s*1.3, 1, .3); }
  b.box(4.8, 5, 3, W, 0, 8, 0); b.box(3, 1.8, 3.2, G, 0, 9.5, 0);
  for (const s of [-1,1]){ b.box(1.4, 6, 1.4, W, s*3.2, 7.5, 0); b.box(2, 1.6, 2, G, s*3.2, 12.4, 0); }
  b.box(2, 2, 2, W, 0, 13, 0); b.box(1.6, .4, .1, '#4ff3ff', 0, 14, 1.01, {glow:true});
  return 15.5;
}
function buddha(b){
  b.cyl(5.5, 6, 1.5, C.stone, 0, 0, 0, {seg:16}); b.cyl(4.6, 5, 1, '#5d7f74', 0, 1.5, 0, {seg:16});
  const BR = '#5f8a7c';
  b.sph(4.2, BR, 0, 4.2, 0, {seg:14, sy:.65}); b.sph(3.3, BR, 0, 7.4, 0, {seg:14, sy:1.15}); b.sph(1.9, BR, 0, 11.6, 0, {seg:12});
  b.sph(.9, BR, 0, 13.4, 0, {seg:8}); b.box(2.4, .6, 1.2, BR, 0, 5.6, 2.6);
  return 14.5;
}
function deer(b, x, z, ry=0){
  const D = '#a67a4f';
  b.box(2.2, 1.1, .9, D, x, 1.6, z, {ry});
  for (const a of [-.8,.8]) for (const c of [-.3,.3]) b.box(.22, 1.6, .22, D, x + a*Math.cos(ry) + c*Math.sin(ry), 0, z - a*Math.sin(ry) + c*Math.cos(ry));
  const hx = x + 1.2*Math.cos(ry), hz = z - 1.2*Math.sin(ry);
  b.box(.4, 1.2, .4, D, hx, 2.5, hz); b.box(.9, .5, .5, D, hx + .3*Math.cos(ry), 3.5, hz - .3*Math.sin(ry), {ry});
}
function panda(b, x, z, s=1){
  b.sph(1.6*s, '#f5f5f5', x, 1.5*s, z, {seg:10}); b.sph(1*s, '#f5f5f5', x, 3.2*s, z, {seg:10});
  for (const d of [-.7,.7]){ b.sph(.35*s, C.black, x + d*s, 4*s, z); b.sph(.6*s, C.black, x + d*1.3*s, .5*s, z + .6*s); }
  b.sph(.55*s, C.black, x, 1.9*s, z + 1.1*s, {sx:2.2, sy:.7});
}
function westernHouse(b, x=0, z=0, wall='#e8d6b0', roof='#4b6f8f'){
  b.box(7, 5, 6, wall, x, 0, z); b.roof(8, 7, 3, roof, x, 5, z);
  b.box(1.4, 5, 1.4, wall, x+3.5, 2.5, z+3); b.cone(1.1, 2, roof, x+3.5, 7.5, z+3, {seg:8});
  b.cyl(.06, .06, 1.6, C.black, x, 8, z); b.box(1, .5, .1, C.gold, x, 9.4, z);
  for (let i=-1;i<=1;i++) b.box(1, 1.4, .1, '#ffe7a8', x+i*2, 1.4, z+3.01, {glow:true});
  return 10;
}
function stationBrick(b){
  b.box(34, 4.5, 6, C.brick, 0, 0, 0); for (let i=0;i<9;i++) b.box(2, .3, .1, C.white, -16+i*4, 2.2, 3.01);
  for (const x of [-13, 13]){ b.cyl(3.4, 3.4, 5.5, C.brick, x, 0, 0, {seg:8}); b.lathe([[0,0],[3.6,0],[3.3,1.5],[2.4,2.8],[.8,3.6],[0,3.8]], '#3d4a52', x, 5.5, 0, {seg:8}); }
  b.box(6, 6, 6.5, C.brick, 0, 0, 0); b.roof(7, 7, 2, '#3d4a52', 0, 6, 0);
  return 9.5;
}

// ---- 各景點的造型 ----
const LANDMARK_BUILDERS = {
  // 大阪
  '大阪城天守閣': b => jpCastle(b, 5, C.white, '#3f8f7a'),
  '道頓堀・固力果跑跑人': b => { water(b, 30, 4); neonBlock(b, 6, 11, 6);
    b.sph(2.2, '#e0412b', 0, 12, 4, {sy:.55}); for (let i=0;i<4;i++) for (const s of [-1,1]) b.box(3, .4, .4, '#e0412b', s*2.4, 11.8 - i*.5, 4 + (i-1.5)*.7, {rz:s*.4});
    for (const s of [-1,1]) b.sph(.9, '#e0412b', s*2.6, 13.3, 4.8, {sy:.7}); return 14; },
  '心齋橋筋商店街': b => arcade(b, 30, 6, '#9fd0ff', 5),
  '美國村': b => { neonBlock(b, 4, 21, 4); b.box(2, 1.2, 2, C.stone, 0, 9, 0); b.cyl(.7, .9, 4, '#5fb39a', 0, 10.2, 0, {seg:8}); b.sph(.7, '#5fb39a', 0, 14.6, 0); b.cyl(.15,.15,1.6,'#5fb39a',.8,14,0,{rz:-.3}); b.sph(.35,'#ffd23f',1.2,15.6,0,{glow:true}); return 16; },
  '法善寺橫丁': b => { pad(b, 14, 10, '#2c2a26'); oldStreet(b, 4, 31, '#2e2622'); b.box(3, 2, 2.4, '#3a6b3a', 0, .4, 0); b.sph(1.2, '#3e8a3e', 0, 3.2, 0, {seg:8}); for (let i=-3;i<=3;i++) lantern(b, i*1.2, 4.5, 2, .4, '#ffcf6b'); return 7; },
  '黑門市場': b => { stalls(b, 10, 2.6, 41); for (let i=0;i<=12;i++) b.tor(4.5, .18, '#cfe8ff', -14 + i*28/12, 4, 0, {ry:Math.PI/2, seg:12, sy:.5}); b.box(28, .25, .25, '#cfe8ff', 0, 6.2, 0, {glow:true}); b.box(3, 1.4, .3, '#ffffff', 0, 4.6, 4.6, {glow:true}); return 6; },
  '日本橋電器街 Den Den Town': b => { neonBlock(b, 6, 51, 5); return 13; },
  '新世界・通天閣': b => { for (const x of [-3,3]) for (const z of [-3,3]) b.box(1.2, 6, 1.2, C.steel, x, 0, z);
    b.box(7.5, 1.2, 7.5, C.steel, 0, 6, 0); b.cyl(2.4, 3.2, 14, '#c8ced6', 0, 7.2, 0, {seg:8});
    b.cyl(3.6, 3.2, 3.5, '#9aa6b2', 0, 20, 0, {seg:8}); b.cyl(3.7, 3.7, .6, NEON[1], 0, 21.6, 0, {glow:true, seg:8});
    b.cyl(.3, .5, 4, C.steel, 0, 23.5, 0, {seg:6}); stalls(b, 6, 2.4, 61, true, 9); return 27.5; },
  '阿倍野 HARUKAS 300 展望台': b => { skyscraper(b, 9, 14, '#7fa9c9'); skyscraper(b, 7.5, 12, '#8fb8d6', 0, -.6); b.box(7, 10, 5.5, '#9cc4e0', 0, 26, -1); return 36; },
  '四天王寺': b => { pad(b, 18, 18, '#3a3a32'); pagoda(b, -3, 0, 5, 5, 3, C.ver, '#2f3a48'); hall(b, 7, 5, 3, C.ver, '#2f3a48', 5, 3, .6); return 24; },
  '梅田藍天大廈・空中庭園': b => { for (const x of [-4,4]) b.box(5, 32, 6, '#a9c4d8', x, 0, 0);
    b.box(13, 3, 6, '#a9c4d8', 0, 32, 0); b.tor(5, .5, '#e9f2fa', 0, 30, 0, {rx:Math.PI/2}); b.tor(5.4, .2, NEON[2], 0, 33.2, 0, {rx:Math.PI/2, glow:true}); return 36; },
  '天神橋筋商店街': b => arcade(b, 34, 6, '#ffd59a', 7),
  '大阪生活今昔館': b => { pad(b, 16, 12, '#2c2a26'); oldStreet(b, 5, 71, '#4a3a2c'); return 6; },
  '中之島・中央公會堂': b => { water(b, 30, 5, 0, 7); b.box(16, 6, 8, C.brick, 0, 0, 0); for (let i=-3;i<=3;i++) b.box(1, 6, .3, C.cream, i*2.3, 0, 4.05);
    b.box(17, .8, 9, C.cream, 0, 6, 0); b.sph(4, '#4f8a7e', 0, 6.8, 0, {seg:14, sy:.8}); b.cyl(.3,.3,2,C.gold,0,9.8,0); return 12; },
  '海遊館': b => { water(b, 30, 4, 0, 8); b.box(14, 9, 12, C.navy, 0, 0, 0); b.box(10, 5, 9, '#d64b2d', -1, 9, 0); b.box(6, 4, 6, '#2f8fd4', 2, 14, 0);
    for (let i=0;i<5;i++) b.box(14.1, .3, 12.1, '#ffffff', 0, 1.5+i*1.5, 0);
    const w = b.sub(0, 20, 0); w.sph(2.2, '#5f7f9f', 0, 0, 0, {sx:2.4, sy:.8, seg:12}); for (let i=0;i<10;i++) w.sph(.25, '#ffffff', -3+i*.7, .5, 1.5);
    w.box(.3, 2, 2, '#5f7f9f', -5, 0, 0); w.anim = (g, t) => { g.rotation.y = t*.3; g.position.y = 20 + Math.sin(t)*.6; }; return 23; },
  '天保山大摩天輪': b => ferris(b, 10),
  '日本環球影城 USJ': b => { pad(b, 26, 22, '#203a2e');
    const r = rng(81); for (let i=0;i<60;i++){ const a = i/60*Math.PI*4, R = 8, h = 3 + Math.sin(i/60*Math.PI*6)*3 + 3;
      const x = Math.cos(a)*R*(1 - i/150), z = Math.sin(a)*R*(1 - i/150);
      b.box(1.3, .35, .8, i%7 ? C.yellow : C.red, x, h, z, {ry:-a}); if (i%5===0) b.cyl(.15,.15,h,C.steel,x,0,z,{seg:5}); }
    b.tor(4, .4, '#3fd0ff', -6, 8, -6, {seg:24, ry:.6}); b.cyl(.3,.3,4,C.steel,-6,0,-6,{seg:5});
    b.box(6, 7, 4, '#6b4fa0', 8, 0, -7); b.cone(3, 4, '#a4325c', 8, 7, -7, {seg:4}); return 13; },
  '鶴橋燒肉・韓國城': b => { stalls(b, 8, 2.8, 91, true); const s = b.sub(0, 4, 0); for (let i=0;i<4;i++) s.sph(1+i*.3, '#c8ccd2', Math.sin(i)*1.5, i*1.4, 0, {seg:8}); s.anim = (g, t) => { g.position.y = 4 + (t*.7 % 2); }; return 9; },
  '臨空城 Premium Outlets': b => { for (let i=0;i<5;i++) b.box(5, 3, 5, '#f0ebe0', -12+i*6, 0, (i%2)*4); for (let i=0;i<6;i++){ b.cyl(.1,.1,6,C.steel,-15+i*6,0,-4,{seg:4}); b.box(.1, 1.2, 1.8, NEON[i], -15+i*6, 4.6, -3.1, {glow:true}); } return 7; },
  '關西國際機場': b => airport(b),
  // 京都
  '伏見稻荷大社（千本鳥居）': b => { mountain(b, 9, 7, '#3e7f45');
    for (let i=0;i<30;i++){ const a = i*.27, R = 13 - i*.16; torii(b, Math.cos(a)*R, Math.sin(a)*R, 2.6, -a); }
    torii(b, 0, 15, 8, 0); return 10; },
  '清水寺': b => { mountain(b, 6, 15, '#3e7f45');
    for (let i=-3;i<=3;i++) for (let j=0;j<3;j++) b.box(.5, 6 + j*.6, .5, C.wood, i*1.6, 0, 6 - j*1.8);
    b.box(12, .6, 6, C.wood, 0, 6.6, 4.5); hall(b, 9, 7, 3, C.wood, '#5b4a3a', 0, -3, 6.6);
    pagoda(b, -9, -4, 3, 3.5, 2.6, C.ver, '#3a3532'); return 16; },
  '八坂神社・祇園': b => { pad(b, 16, 12, '#2c2a26'); b.box(12, 1, 4, C.stone, 0, 0, 0); b.box(10, 4, 3, C.ver, 0, 1, 0); b.roof(13, 6, 2.2, '#2f3a48', 0, 5, 0);
    b.box(7, 2, 2.5, C.ver, 0, 7, 0); b.roof(10, 5, 2, '#2f3a48', 0, 9, 0); for (let i=-4;i<=4;i++) lantern(b, i*1.4, 4, 2, .45, '#ffd9a0'); return 11; },
  '錦市場': b => arcade(b, 30, 5, '#ffb3c7', 13),
  '嵐山竹林小徑': b => { pad(b, 16, 16, '#2f4a2a'); const r = rng(101);
    for (let i=0;i<60;i++){ const x = (r()-.5)*14, z = (r()-.5)*14; if (Math.abs(x) < 1.2) continue; const h = 9 + r()*6; b.cyl(.18, .22, h, r() > .5 ? '#7cbf5a' : '#5ea648', x, 0, z, {seg:5}); b.cone(1, 3, '#8fd16a', x, h - 1.5, z, {seg:5}); }
    b.box(2, .2, 16, C.sand, 0, .4, 0); return 15; },
  '渡月橋': b => { water(b, 14, 34, 0, 0); mountain(b, 12, 9, '#5d8f4a', false, -10, -10); b.box(30, .8, 2.4, C.wood, 0, 2.2, 10, {});
    for (let i=-7;i<=7;i++) b.box(.4, 2.2, .4, C.woodD, i*2, 0, 10); for (let i=-7;i<=7;i++) b.box(.2, 1, .2, C.woodD, i*2, 3, 11.1); b.box(30, .2, .2, C.woodD, 0, 3.9, 11.1); return 10; },
  '京都車站・京都塔': b => { b.box(16, 9, 9, '#e6e8ea', 0, 0, 0); b.cyl(1.5, 2.6, 9, C.white, 0, 9, 0, {seg:12}); b.cyl(3, 1.6, 2.2, C.white, 0, 18, 0, {seg:12});
    b.cyl(3.05, 3.05, .5, '#ff5a3c', 0, 18.8, 0, {glow:true, seg:12}); b.cyl(.6, 1.2, 4, C.white, 0, 20.2, 0, {seg:10}); b.sph(.5, '#ff3a3a', 0, 24.4, 0, {glow:true}); return 25; },
  // 奈良
  '奈良公園（餵鹿）': b => { park(b, 111, false); deer(b, -3, 2, .4); deer(b, 2, -1, 2.2); deer(b, 4, 4, -.8); deer(b, -1, -5, 1.4); return 6; },
  '東大寺大佛殿': b => { b.box(30, 1, 22, C.stone, 0, 0, 0); b.box(24, 7, 16, C.wood, 0, 1, 0); for (let i=-4;i<=4;i++) b.box(.8, 7, .8, '#3a2a1e', i*3, 1, 8);
    b.box(10, 2, .3, C.white, 0, 6, 8.1); b.roof(30, 21, 6, '#2c2f36', 0, 8, 0); b.box(26, 1.2, 1.4, '#2c2f36', 0, 13.8, 0);
    for (const s of [-1,1]) b.cone(.7, 2.8, C.gold, s*12.5, 13.6, 0, {seg:6, rz:s*.4}); return 17; },
  '春日大社': b => { pad(b, 20, 14, '#2a3a2a'); b.box(18, 3, 10, C.white, 0, 0, 0); b.box(18, 3.1, .5, C.ver, 0, 0, 5); b.roof(20, 12, 2.4, '#5a4a38', 0, 3, 0);
    for (let i=0;i<14;i++) lantern(b, -8 + i*1.25, 3.2, 5.5, .5, '#ffcc66'); for (let i=0;i<8;i++){ b.cyl(.3,.4,2,C.stone,-8+i*2.3,0,8.5,{seg:6}); b.box(.9,.9,.9,'#ffd27a',-8+i*2.3,2,8.5,{glow:true}); } trees(b, 8, 4, 113, 5, 9); return 8; },
  // 神戶
  '神戶 Harborland・umie': b => { water(b, 30, 10, 0, 8); b.lathe([[3,0],[1.6,5],[1.2,10],[1.6,15],[3,20],[0,20]], '#d8332b', -6, 0, 0, {seg:16});
    b.cyl(3.2, 3.2, 2, C.white, -6, 20, 0, {seg:16}); b.cyl(.4, .5, 3, C.white, -6, 22, 0); ferris(b, 6, 8, -2); return 25; },
  '北野異人館': b => { pad(b, 16, 12, '#2c3a2c'); westernHouse(b, 0, 0, '#d9c4a0', '#7a4b3a'); trees(b, 5, 3, 121, 4, 6); return 10; },
  '南京町（神戶中華街）': b => { stalls(b, 6, 2.6, 131, true, -5); return chineseGate(b, 11, 8); },
  // 東京
  '淺草寺・雷門': b => { b.box(10, 1, 4, C.stone, 0, 0, 8); b.box(10, 5, 3, C.ver, 0, 1, 8); b.roof(13, 5.5, 2.4, C.roofD, 0, 6, 8);
    b.cyl(1.8, 1.8, 3.2, '#e0322b', 0, 1.6, 9.6, {glow:true, seg:12}); b.cyl(1.9,1.9,.3,C.black,0,1.4,9.6,{seg:12}); b.cyl(1.9,1.9,.3,C.black,0,4.8,9.6,{seg:12});
    hall(b, 10, 7, 4, C.ver, C.roofD, 0, -6, 1); pagoda(b, 9, -4, 5, 3.6, 2.6, C.ver, C.roofD); stalls(b, 5, 2.2, 141, false, 2.5); return 22; },
  '東京晴空塔': b => { const H = 52; for (let i=0;i<12;i++){ const t = i/12, r = 4.6*(1-t)+.9; b.cyl(r*.94, r, H/12, i%2 ? '#e9f1f8' : '#cfe0ee', 0, i*H/12, 0, {seg: i < 3 ? 3 : 12}); }
    b.cyl(2.6, 2.4, 2, C.glassD, 0, H*.62, 0, {seg:16}); b.cyl(2.65,2.65,.3,'#9fe7ff',0,H*.64,0,{glow:true, seg:16});
    b.cyl(1.7, 1.6, 1.4, C.glassD, 0, H*.8, 0, {seg:16}); b.cyl(1.75,1.75,.25,'#c9a6ff',0,H*.81,0,{glow:true,seg:16});
    b.cyl(.3, .6, 10, '#e9f1f8', 0, H, 0, {seg:6}); b.sph(.4, '#ff4040', 0, H+10, 0, {glow:true}); return H + 10.5; },
  '上野公園・阿美橫丁': b => { park(b, 151, true); panda(b, -6, -5, 1.1); stalls(b, 5, 2.2, 152, true, 9); return 6; },
  '秋葉原電器街': b => { neonBlock(b, 7, 161, 6); return 14; },
  '東京車站・丸之內': b => stationBrick(b),
  '皇居外苑・二重橋': b => { water(b, 24, 6, 0, 3); b.box(26, 3.5, 4, C.stone, 0, 0, -3);
    for (const a of [-1,1]){ b.box(5, 1, 3, C.stone, a*3.2, 1.4, 3); } b.tor(1.6, .5, C.stone, -3.2, 1.4, 3, {seg:10}); b.tor(1.6, .5, C.stone, 3.2, 1.4, 3, {seg:10});
    b.box(7, 3, 4, C.white, 4, 3.5, -3); b.roof(9, 6, 1.8, C.roofD, 4, 6.5, -3); b.box(4.5, 2, 3, C.white, 4, 8, -3); b.roof(6.5, 4.5, 1.5, C.roofD, 4, 10, -3); trees(b, 6, 4, 171, 4.5, 8); return 12; },
  '銀座': b => { b.lathe([[5,0],[5,9],[0,9]], '#c9c1b2', 0, 0, 0, {seg:12}); b.cyl(2.4, 2.8, 4, '#c9c1b2', 0, 9, 0, {seg:12});
    b.cyl(2.2,2.2,.3,'#fff7d6',0,10.8,2.2,{glow:true, rx:Math.PI/2, seg:16}); b.sph(2.4, '#5c6b6e', 0, 13, 0, {seg:12, sy:.6});
    for (const x of [-11,11]) skyscraper(b, 6, 12, '#b6c3cf', x, -2); return 16; },
  '築地場外市場': b => { stalls(b, 10, 2.5, 181); for (let i=0;i<4;i++) b.sph(.7, '#ff7a6b', -6+i*4, 2.2, 0, {sx:2, sy:.6}); return 5; },
  '豐洲市場': b => { b.box(24, 5, 12, '#eef1f4', 0, 0, 0); b.box(24.2, .4, 12.2, '#2e8fd8', 0, 5, 0); water(b, 30, 4, 0, 9);
    b.sph(1.6, '#3b4b66', 0, 6.6, 0, {sx:3, sy:.8}); b.cone(1.2, 1.6, '#3b4b66', -5.2, 5.8, 0, {rz:Math.PI/2}); return 9; },
  'teamLab Planets': b => { b.box(16, 6, 12, '#1c1e2b', 0, 0, 0); const s = b.sub(0, 6, 0);
    const r = rng(191); for (let i=0;i<12;i++) s.sph(.8 + r()*1.2, NEON[i%6], (r()-.5)*12, .8 + r()*5, (r()-.5)*8, {glow:true, seg:10});
    s.anim = (g, t) => { g.children.forEach((m,i) => m.scale.setScalar(1)); g.rotation.y = t*.25; }; return 13; },
  '台場・獨角獸鋼彈': b => { water(b, 30, 6, 0, 10); return robot(b); },
  '東京鐵塔': b => latticeTower(b, 30, '#e8452c', '#f4f4f4'),
  '六本木之丘・森美術館': b => { skyscraper(b, 10, 34, '#8aa3b8'); b.cyl(5.6, 5.6, 3, '#6c879e', 0, 34, 0, {seg:10}); b.cyl(5.7,5.7,.4,'#9fe7ff',0,35.8,0,{glow:true,seg:10}); return 38; },
  '澀谷十字路口・SHIBUYA SKY': b => { pad(b, 26, 26, '#2a2d36'); for (let i=-5;i<=5;i++){ b.box(1, .1, 10, '#f2f2f2', i*1.6, .45, 0, {ry:Math.PI/4}); b.box(1, .1, 10, '#f2f2f2', i*1.6, .45, 0, {ry:-Math.PI/4}); }
    b.box(8, 42, 8, '#7d8fa3', 9, 0, -9); b.box(8.6, .5, 8.6, '#9fe7ff', 9, 42, -9, {glow:true});
    for (const [x,z] of [[-9,-9],[-9,9],[9,9]]){ b.box(7, 10, 7, '#4a5061', x, 0, z); b.box(5, 3, .2, NEON[(x+z+30)%6|0], x, 6, z + (z<0?3.6:-3.6), {glow:true}); } return 43; },
  '原宿竹下通': b => { arcade(b, 26, 4, '#ffd1ea', 201); b.tor(5, .5, '#ff8fc8', 0, 0, 6, {seg:20}); b.tor(5, .5, '#9be7ff', 0, 0, -6, {seg:20}); b.cone(1, 3, '#f7d58f', 8, 6, 0); b.sph(1.2, C.pink, 8, 9, 0); return 10; },
  '明治神宮': b => { trees(b, 22, 12, 211, 6, 3); torii(b, 0, 10, 12, 0, '#8a6a4a'); hall(b, 10, 6, 3, '#8a6a4a', '#3d5a3d', 0, -4, .8);
    for (let i=0;i<6;i++) b.cyl(.8,.8,1.6,['#e0412b','#f2f2f2','#2b59c3'][i%3], 8 + (i%3)*1.7, i < 3 ? 0 : 1.6, 6); return 13; },
  '表參道': b => { pad(b, 30, 14, '#2a2d36'); for (let i=-6;i<=6;i++){ tree(b, i*2.2, 3, 5); tree(b, i*2.2, -3, 5); }
    b.box(8, 8, 5, '#c7ccd2', -8, 0, -9); b.box(7, 10, 5, '#e2d6c2', 6, 0, -9); b.box(6, 6, 5, C.glass, 0, 0, 9); return 10; },
  '新宿御苑': b => { park(b, 221, true); b.lathe([[4,0],[4,2],[2.5,4],[0,4.5]], '#cfe9ff', -6, 0, -5, {seg:10}); return 6; },
  '東京都廳展望室': b => { b.box(16, 14, 9, '#c9ced6', 0, 0, 0); for (const x of [-4,4]){ b.box(6, 22, 8, '#c9ced6', x, 14, 0); b.box(4.5, 6, 6.5, '#b7bec8', x, 36, 0, {ry:Math.PI/4}); b.box(6.2,.4,8.2,'#9fe7ff',x,34.6,0,{glow:true}); }
    for (let i=0;i<12;i++) b.box(16.1, .2, 9.1, '#596474', 0, 1+i*1.1, 0); return 42; },
  '新宿歌舞伎町・回憶橫丁': b => { neonBlock(b, 6, 231, 7); b.box(12, 1.6, .5, '#ff2f4f', 0, 7, 5, {glow:true}); for (const x of [-6,6]) b.box(.6, 7, .6, '#ff2f4f', x, 0, 5); for (let i=-5;i<=5;i++) lantern(b, i*1.1, 5.4, 6, .4, '#ff6b4a'); return 15; },
  '池袋太陽城': b => { skyscraper(b, 9, 38, '#9aa7b6'); b.box(18, 8, 12, '#b9c2cc', 0, 0, 8);
    b.sph(1.6, C.black, 6, 9.8, 8, {sy:1.3}); b.sph(1.2, C.white, 6, 9.6, 9.1, {sy:1.2}); b.sph(.9, C.black, 6, 12.4, 8); b.cone(.35, .9, C.orange, 6, 12.1, 8.9, {rx:Math.PI/2}); return 39; },
  '中野百老匯': b => { b.box(20, 10, 10, '#b4aa9a', 0, 0, 0); b.box(20.2, 1.2, .3, '#ffd23f', 0, 3, 5.1, {glow:true}); arcade(b, 18, 4, '#cfe8ff', 241); b.sph(1.5, '#c98a4b', 0, 10, 0); b.sph(.7, '#c98a4b', -1, 11.6, 0); b.sph(.7, '#c98a4b', 1, 11.6, 0); return 12; },
  '吉祥寺・井之頭公園': b => { park(b, 251, true); for (let i=0;i<3;i++){ const x = i*2.4, z = 1; b.box(1.6, .6, 1.2, C.white, x, .4, z); b.cyl(.15,.25,1.4,C.white,x+.6,.8,z,{rz:-.3}); b.sph(.3,C.white,x+.9,2.1,z); b.cone(.12,.4,C.orange,x+1.2,2,z,{rz:-Math.PI/2}); } return 6; },
  '三鷹之森吉卜力美術館': b => { pad(b, 18, 14, '#2f4a2a'); b.box(10, 6, 8, '#f3c9a0', 0, 0, 0); b.cyl(2.6, 2.6, 9, '#f6e3b8', 5, 0, 3, {seg:12}); b.cone(3, 3, '#3e8f6a', 5, 9, 3, {seg:12});
    for (let i=0;i<5;i++) b.box(1, 1.2, .1, '#ffe7a8', -3.5+i*1.8, 2.6, 4.05, {glow:true}); trees(b, 6, 4, 261, 4.5, 7); return 12; },
  '下北澤': b => { neonBlock(b, 5, 271, 3); return 10; },
  '谷中銀座（谷根千）': b => { oldStreet(b, 6, 281, '#4b3b30'); b.sph(.7, C.orange, 0, 3.9, 0, {sy:.8}); b.sph(.45, C.orange, .7, 4.5, 0); b.cone(.2,.4,C.orange,.55,4.9,0); b.cone(.2,.4,C.orange,.95,4.9,0); return 6; },
  '柴又帝釋天': b => { pad(b, 16, 14, '#2c2a26'); b.box(8, 4, 3, C.wood, 0, 0, 5); b.roof(11, 5, 2.4, '#2f3a48', 0, 4, 5); hall(b, 10, 7, 3.5, C.wood, '#2f3a48', 0, -3, 1); return 11; },
  '東京迪士尼樂園': b => { pad(b, 22, 22, '#2b3a52'); const c = b.sub(0, 0, 0);
    c.cyl(6, 6, .8, '#f2d7a0', 0, 0, 0, {seg:20}); for (let i=0;i<10;i++){ const a = i/10*Math.PI*2; c.cyl(.12,.12,5,C.gold,Math.cos(a)*4.5,.8,Math.sin(a)*4.5,{seg:5}); c.box(1.6,1,.6,[C.white,'#f5b04d','#c59bff'][i%3],Math.cos(a)*4.5,2.4,Math.sin(a)*4.5,{ry:-a}); }
    c.cone(7, 3.5, '#e8524f', 0, 5.8, 0, {seg:12}); c.sph(.5, C.gold, 0, 9.6, 0); c.anim = (g, t) => { g.rotation.y = t*.4; };
    for (let i=0;i<8;i++) b.sph(.35, NEON[i%6], Math.cos(i)*9, 1, Math.sin(i)*9, {glow:true}); return 10.5; },
  '東京迪士尼海洋': b => { water(b, 26, 22); b.cone(9, 12, '#7a4a36', 0, 0, -3, {seg:10}); b.cone(3, 3, '#ff5a2c', 0, 9.5, -3, {seg:10, glow:true});
    b.box(9, 2, 3, '#7a4b2a', 0, .5, 8); b.cyl(.2,.2,7,C.woodD,0,2.5,8,{seg:5}); b.box(.1, 4, 4, C.white, 0, 4, 8); return 13; },
  '成田機場': b => airport(b), '羽田機場': b => airport(b),
  '橫濱港未來・紅磚倉庫': b => { water(b, 32, 8, 0, 9); ferris(b, 9, -7, 0); skyscraper(b, 7, 40, '#c6ccd4', 9, -4, 3); b.box(10, 4, 4, C.brick, 3, 0, 6); return 41; },
  '橫濱中華街': b => { stalls(b, 6, 2.6, 291, true, -5); return chineseGate(b, 11, 8, C.red, '#2f8f5b'); },
  '鎌倉・鶴岡八幡宮': b => { b.box(12, 3, 10, C.stone, 0, 0, -3); for (let i=0;i<5;i++) b.box(6, .6, 1, C.stone, 0, i*.6, 2.5 + i*-.9);
    hall(b, 10, 6, 3, C.ver, C.roofD, 0, -4, 3); torii(b, 0, 9, 8, 0); trees(b, 6, 4, 301, 5, 9); return 11; },
  '鎌倉大佛（高德院）': b => buddha(b),
  '江之島': b => { water(b, 30, 30); b.cone(11, 7, '#4f8f4a', 0, 0, 0, {seg:10}); b.cyl(.8, 1.4, 9, C.white, 0, 6.5, 0, {seg:8}); b.cyl(1.8, 1.2, 1.6, '#cfe0ee', 0, 15.5, 0, {seg:10});
    b.cyl(1.85,1.85,.3,'#fff0a0',0,16.4,0,{glow:true,seg:10}); b.box(1.4, .4, 18, C.sand, 0, .3, 18); return 17.5; },
  '川越小江戶': b => { oldStreet(b, 6, 311, '#2a2522', '#1e2228'); b.box(2.4, 12, 2.4, C.woodD, 0, 0, -9); b.roof(3.6, 3.6, 1.2, '#2a2e34', 0, 4, -9); b.roof(3.4, 3.4, 1.2, '#2a2e34', 0, 8, -9); b.roof(3.2, 3.2, 1.6, '#2a2e34', 0, 12, -9); return 14; },
  '高尾山': b => { mountain(b, 14, 14, '#4c8f45'); trees(b, 14, 10, 321, 4, 3); b.box(.2, .2, 18, C.steel, -6, 7, 0, {rx:-.6}); b.box(1.2, 1, 1.6, C.red, -6, 7, 0); return 15; },
  '箱根（小田原轉乘）': b => { onsen(b); b.cone(10, 12, '#5b7f9b', 0, 0, -16, {seg:12}); b.cone(3.5, 4, '#f4f6f8', 0, 8, -16, {seg:12}); water(b, 14, 6, -8, -6); return 12; },
  // 台北
  '台北101・信義商圈': b => { b.box(10, 5, 10, '#6f9a8d', 0, 0, 0); let y = 5;
    for (let i=0;i<8;i++){ b.cyl(3.4, 4.2, 4.6, '#5f8f84', 0, y, 0, {seg:4}); b.cyl(4.25, 4.25, .3, '#bff5d8', 0, y+.1, 0, {seg:4, glow:true}); y += 4.6; }
    b.box(5, 3, 5, '#5f8f84', 0, y, 0); b.cyl(.4, .7, 8, '#cfd8d4', 0, y+3, 0, {seg:6}); b.sph(.4, '#ff4040', 0, y+11, 0, {glow:true}); return y + 11.5; },
  '象山步道': b => { b.cone(12, 12, '#3f7f3c', 0, 0, 0, {seg:7}); trees(b, 10, 9, 331, 3.5, 2);
    for (let i=0;i<4;i++) b.box(2.6, 1.6, 2, '#8a8478', -2 + i*1.6, 9 + i*.3, 2 - i*.8, {ry:i}); b.box(.6, 1.4, .6, C.red, 0, 12, 0); return 13; },
  '中正紀念堂': b => { b.box(22, 1, 22, '#f4f4f4', 0, 0, 0); for (let i=0;i<6;i++) b.box(5, .7, 1.4, '#e8e8e8', 0, 1 + i*.7, 8 - i*1.2);
    b.box(12, 3, 12, C.white, 0, 1, 0); b.box(10, 7, 10, C.white, 0, 4, 0); b.cone(7.6, 3, '#2a5cb8', 0, 11, 0, {seg:8}); b.cone(6, 3, '#2a5cb8', 0, 13.5, 0, {seg:8}); b.sph(.6, C.gold, 0, 16.8, 0); return 17.5; },
  '西門町': b => { neonBlock(b, 6, 341, 5); b.cyl(4, 4, 5, C.brick, -10, 0, 8, {seg:8}); b.cone(4.3, 2, '#3d3d3d', -10, 5, 8, {seg:8}); b.box(4, 5, 5, C.brick, -5.5, 0, 8); return 13; },
  '龍山寺・剝皮寮': b => twTemple(b),
  '大稻埕・迪化街': b => { for (let i=0;i<7;i++){ const x = -15 + i*5; b.box(4.6, 7, 4, ['#b5654a','#d9c4a0','#c9775a'][i%3], x, 0, -3); b.box(4.6, 2.4, .5, '#efe3c8', x, 7, -1.1); b.lathe([[2.3,0],[1.6,.9],[0,1.4]], '#efe3c8', x, 9.4, -1.1, {seg:6, sz:.2}); }
    water(b, 34, 5, 0, 7); b.sph(2.4, '#ff8a3d', 12, 2, 12, {glow:true}); return 11; },
  '寧夏夜市': b => { stalls(b, 12, 2.4, 351, true); return 5; },
  '臨江街（通化）夜市': b => { stalls(b, 12, 2.4, 357, true); b.box(10, 1.6, .4, '#ffd23f', 0, 5, 5, {glow:true}); for (const x of [-5,5]) b.box(.5, 5, .5, C.red, x, 0, 5); return 7; },
  '士林夜市': b => { b.box(18, 5, 10, '#d9d1c2', 0, 0, -6); b.box(18.2, 1.2, .3, '#ffcf3f', 0, 5, -0.9, {glow:true}); stalls(b, 9, 2.4, 361, true, 4); return 7; },
  '國立故宮博物院': b => { trees(b, 8, 5, 371, 5, 13); b.box(22, 2, 12, C.cream, 0, 0, 0); b.box(18, 5, 9, '#f2ead6', 0, 2, 0); b.roof(22, 12, 3, '#2f7f5f', 0, 7, 0);
    b.box(9, 3, 6, '#f2ead6', 0, 9, 0); b.roof(12, 8, 2.4, '#2f7f5f', 0, 12, 0); for (let i=-3;i<=3;i++) b.box(.6, 5, .6, C.red, i*2.4, 2, 4.6); return 14.5; },
  '北投溫泉・地熱谷': b => { const h = onsen(b, true, '#7fe0c8'); trees(b, 8, 4, 381, 4, 8); return h; },
  '淡水老街・漁人碼頭': b => { water(b, 34, 16, 0, 4); b.box(30, 2, 5, '#b49a7a', 0, 0, -9); oldStreet(b, 6, 391, '#7a5a44', '#4a3a30');
    b.box(14, .6, 1.6, C.white, 6, 3, 6); b.cyl(.2,.3,7,C.white,6,0,6,{seg:5}); b.box(.15, .15, 9, C.white, 6, 5, 6, {rx:.9}); b.box(.15, .15, 9, C.white, 6, 5, 6, {rx:-.9});
    b.sph(3.5, '#ff7a3c', -10, 4, 14, {glow:true}); return 9; },
  '貓空纜車': b => { b.cone(10, 9, '#3f8a3f', 8, 0, -6, {seg:8}); for (let i=0;i<4;i++) b.box(10 - i*2, .6, 2, '#5aa84f', 8, i*1.8, 2 - i*1.4);
    b.box(.2, .2, 30, C.steel, -2, 7, 0, {ry:Math.PI/2.4, rx:-.18}); for (let i=-2;i<=2;i++){ b.box(1.4, 1.4, 1.2, ['#3fa9f5','#f54d3f','#ffd23f'][(i+3)%3], i*4.5, 5.8 + i*.9, i*1.2); }
    for (const x of [-10,0,10]) b.cyl(.3,.4,8 + x*.15,C.steel,x,0,x*.25,{seg:5}); return 10; },
  '台北市立動物園': b => { park(b, 401, true); panda(b, -5, 4, 1.3); panda(b, 3, -5, .9); return 7; },
  '饒河街夜市': b => { stalls(b, 10, 2.4, 411, true, 12); b.box(12, 2, .4, '#ff5a3c', 0, 6, 7, {glow:true}); for (const x of [-6,6]) b.box(.6, 6, .6, C.red, x, 0, 7); twTemple(b); return 12; },
  '華山1914文創園區': b => { for (let i=0;i<4;i++) b.box(6, 5, 9, C.brick, -9 + i*6.5, 0, 0); b.roof(28, 10, 2, '#5a5a5a', 0, 5, 0); b.cyl(.9, 1.3, 14, C.brick, 12, 0, 6, {seg:8}); for (let i=0;i<5;i++) b.sph(.7, NEON[i], -8 + i*4, .8, 6, {glow:true}); return 14; },
  '松山文創園區': b => { b.box(24, 4.5, 10, '#d6c9a8', 0, 0, 0); b.roof(26, 11, 2.2, '#6b6b6b', 0, 4.5, 0); b.cyl(1, 1.6, 16, C.brick, 13, 0, -4, {seg:8}); water(b, 12, 5, -4, 9); return 16; },
  '國父紀念館': b => { b.box(24, 1, 18, C.white, 0, 0, 0); b.box(18, 7, 13, '#f3ead6', 0, 1, 0); for (let i=-7;i<=7;i++) b.box(.7, 7, .7, '#c9b48a', i*1.25, 1, 6.6);
    b.roof(23, 17, 3.2, '#f0b53a', 0, 8, 0); b.box(14, .8, .8, '#f0b53a', 0, 10.6, 8.8, {rx:.6}); return 12; },
  '永康街': b => { oldStreet(b, 5, 421, '#6a5446', '#3d3a36'); b.cyl(2.4, 1.4, 2, C.white, 0, 6, 0, {seg:14}); b.sph(2.4, '#ffb432', 0, 8.2, 0, {seg:12, sy:.8}); for (let i=0;i<6;i++) b.box(.8,.8,.8,'#ff9a1f',Math.cos(i)*1.4,9.6,Math.sin(i)*1.4); return 11; },
  '大安森林公園': b => park(b, 431, true),
  '台北車站・地下街': b => { b.box(28, 7, 20, '#e8dcc0', 0, 0, 0); b.roof(31, 23, 4, '#b3542e', 0, 7, 0); for (let i=-4;i<=4;i++) b.box(1.6, 5, .2, '#9fd0ff', i*3, 1, 10.05, {glow:true}); return 11; },
  '碧潭風景區': b => { water(b, 36, 14); b.cone(8, 9, '#3f7f3c', -12, 0, -10, {seg:8}); for (const x of [-12, 12]) b.box(1.2, 10, 1.2, C.red, x, 0, 0);
    for (let i=0;i<=16;i++){ const x = -12 + i*1.5, y = 10 - Math.sin(i/16*Math.PI)*6; b.box(.2, y - 3.6, .2, C.red, x, 3.6, 0); b.box(1.6, .3, .3, C.red, x, y, 0); }
    b.box(24, .5, 2, '#d9cfc0', 0, 3.4, 0); for (let i=0;i<3;i++){ b.box(1.8, .6, 1.2, C.white, -4 + i*4, .4, 5); b.sph(.5, C.white, -3.4 + i*4, 1.6, 5); } return 11; },
  '板橋林家花園': b => { pad(b, 20, 16, '#2c3a2c'); water(b, 10, 6, -3, 3); b.box(4, 3, 4, C.red, 5, 0, -3); b.roof(6, 6, 2.4, '#2e2e2e', 5, 3, -3); b.cyl(.2, .3, 3, C.red, -3, 0, 3, {seg:6});
    b.cone(3, 2, '#2e2e2e', -3, 3, 3, {seg:6}); trees(b, 8, 4, 441, 4, 6); return 7; },
  '桃園國際機場': b => airport(b),
  // 台中
  '宮原眼科': b => { b.box(16, 7, 10, C.brick, 0, 0, 0); for (let i=-3;i<=3;i++) b.box(1.4, 3, .2, '#ffe7a8', i*2.2, 1.5, 5.05, {glow:true});
    b.box(16.4, 1, 10.4, '#e9dcc0', 0, 7, 0); b.lathe([[3,0],[3,1],[0,3]], '#5b6b6e', 5, 8, 0, {seg:8});
    b.cone(1.6, 3, '#f7e3c0', -4, 8, 6, {seg:10}); b.sph(1.6, '#ff9db5', -4, 11.6, 6); b.sph(1.2, '#fff3d6', -4, 13.2, 6); return 15; },
  '綠空鐵道・台中驛': b => { b.box(18, 6, 7, C.brick, 0, 0, -6); b.box(18.2, .6, 7.2, C.cream, 0, 3, -6); b.box(5, 4, 5, C.brick, 0, 6, -6); b.roof(6.5, 6.5, 3, '#4b5a64', 0, 10, -6);
    b.cyl(.9,.9,.3,C.white,0,8,-3.4,{rx:Math.PI/2}); for (let i=-7;i<=7;i++) b.box(.6, 5, .6, C.steel, i*2.2, 0, 5);
    b.box(32, .8, 4, '#6b7b6b', 0, 5, 5); for (let i=-7;i<=7;i++) tree(b, i*2.2, 5.2, 2.6); return 13; },
  '台中公園（湖心亭）': b => { park(b, 501, false); water(b, 16, 10, 0, 0); for (const x of [-2.6, 2.6]){ b.box(4, 2.6, 4, C.white, x, 1, 0); b.roof(5.5, 5.5, 3, '#b8653a', x, 3.6, 0); }
    b.box(10, .8, 4, '#d9cfc0', 0, .3, 0); for (let i=0;i<3;i++){ b.box(1.8, .5, .9, ['#f54d3f','#3fa9f5','#ffd23f'][i], -5 + i*4, .3, 4); } return 7; },
  '第二市場': b => { b.cyl(6, 6, 6, '#d9c4a0', 0, 0, 0, {seg:6}); b.cone(6.8, 3, '#7a4b3a', 0, 6, 0, {seg:6}); b.cyl(1.4, 1.4, 4, '#d9c4a0', 0, 9, 0, {seg:6}); b.cone(1.8, 1.8, '#7a4b3a', 0, 13, 0, {seg:6});
    stalls(b, 6, 2.4, 511, false, 9); return 15; },
  '一中街': b => { neonBlock(b, 6, 521, 4); b.cyl(1.2, 1, 3.6, '#f3ddb4', 0, 0, 9, {seg:12}); for (let i=0;i<10;i++) b.sph(.25, '#3a2618', Math.cos(i)*.6, .5 + (i%3)*.3, 9 + Math.sin(i)*.6); b.cyl(.15,.15,2.6,'#ff6b9a',.4,3.4,9,{seg:5}); return 12; },
  '台中國家歌劇院': b => { b.box(22, 12, 14, '#f4f4f2', 0, 0, 0); for (let i=0;i<5;i++) for (let j=0;j<2;j++) b.sph(2.4, '#1c2638', -8 + i*4, 3 + j*5, 7.1, {seg:10, sz:.3});
    for (let i=0;i<4;i++) b.sph(.9, '#ffe9b0', -6 + i*4, 5.5, 7.4, {glow:true, sz:.3}); b.box(22, .5, 14, '#5fae64', 0, 12, 0); return 13; },
  '秋紅谷景觀生態公園': b => { b.box(24, .2, 18, '#244a2c', 0, 0, 0); water(b, 12, 7, 0, 0); b.box(14, .5, 1.6, C.white, 0, 1.4, 0); b.tor(7, .25, C.white, 0, 1.4, 0, {seg:20, sx:1, sy:.25});
    trees(b, 10, 9, 531, 4, 6); for (const [x,z,h] of [[-14,-12,26],[-6,-14,32],[6,-13,28],[14,-11,22]]) skyscraper(b, 5, h, '#7d90a6', x, z); return 33; },
  '新光三越・大遠百': b => { b.box(14, 14, 12, '#d7d2c8', -6, 0, 0); b.box(14.2, 1.4, .3, '#ffe36b', -6, 11, 6.05, {glow:true}); skyscraper(b, 9, 20, '#8fa6bb', 8, -2); b.box(9.2,1.2,.3,'#ff6b9a',8,16,2.6,{glow:true}); return 21; },
  '逢甲夜市': b => { stalls(b, 12, 2.4, 541, true); stalls(b, 8, 2.4, 542, true, 9); neonBlock(b, 4, 543, 6); return 13; },
  '文心森林公園': b => { park(b, 551, true); b.lathe([[0,0],[5,0],[5.2,1],[4,4],[1.5,6],[0,6.4]], C.white, -5, 0, -3, {seg:16, sx:1, sz:.6}); return 7; },
  '豐樂雕塑公園': b => { park(b, 561, false); b.tor(2.4, .6, '#e84a3c', -4, 3, 0, {seg:16}); b.box(1, 6, 1, '#3a6fd8', 2, 0, -3, {rz:.3}); b.sph(1.6, '#ffd23f', 4, 1.6, 4); b.cone(1.2, 5, C.steel, -1, 0, 5, {seg:4}); return 7; },
  '水安宮': b => twTemple(b),
  '豐原廟東夜市': b => { twTemple(b); stalls(b, 8, 2.4, 571, true, 10); return 12; },
  '彰化八卦山大佛': b => { mountain(b, 6, 16, '#4f8a45'); const B = '#3a3d42'; b.cyl(5, 5.5, 2, C.stone, 0, 6, 0, {seg:12});
    b.sph(4, B, 0, 10, 0, {seg:12, sy:.65}); b.sph(3.1, B, 0, 13.2, 0, {seg:12, sy:1.15}); b.sph(1.8, B, 0, 17.2, 0, {seg:10}); b.sph(.8, B, 0, 18.9, 0, {seg:8});
    b.box(12, .4, 1.2, C.steel, 6, 5, 6, {ry:.6}); return 20; },
  '高鐵台中站': b => { b.box(26, 6, 10, '#dfe6ec', 0, 0, 0); b.lathe([[0,0],[13,0],[12,3],[0,4]], '#9fb4c8', 0, 6, 0, {seg:4, sz:.45, ry:Math.PI/4});
    const t = b.sub(0, 2, 9); t.cyl(1, 1, 22, C.white, 0, 0, -11, {rx:Math.PI/2}); t.cone(1, 4, C.white, 0, 0, 11, {rx:Math.PI/2, sy:1}); t.box(2.05, .4, 22, '#ff8a2c', 0, -.3, 0);
    t.anim = (g, tt) => { g.position.x = Math.sin(tt*.35)*4; }; return 11; },
};
const LANDMARK_FALLBACK = b => { pad(b, 10, 10); b.box(6, 6, 6, '#8ca0b8', 0, 0, 0); return 7; };

function buildLandmark(sp){
  const b = new MB();
  const f = LANDMARK_BUILDERS[sp.n] || LANDMARK_FALLBACK;
  let h = 10;
  try{ h = f(b, sp) || 10; }catch(e){ console.warn('landmark', sp.n, e); }
  const grp = mbToGroup(b);
  grp.scale.setScalar(MODEL_U);
  grp.userData.top = h * MODEL_U;
  return grp;
}
