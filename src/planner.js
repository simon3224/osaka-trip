// ====== 路網建構與路線規劃 ======
const LMAP = {};
const SERVE = {};   // 站 -> [lineId]
const WADJ = {};    // 站 -> [[站, 分]]
(function buildNet(){
  for (const L of LINES){
    LMAP[L.id] = L;
    L.real = []; L.wp = []; L.mins = [];
    let pend = [];
    for (const it of L.stops){
      if (it[0] === '@'){ pend.push([it[1], it[2]]); continue; }
      if (L.real.length){ L.wp.push(pend); L.mins.push(it[1]); }
      pend = [];
      L.real.push(it[0]);
      (SERVE[it[0]] = SERVE[it[0]] || []).push(L.id);
    }
    if (L.loop){ L.wp.push([]); L.mins.push(L.loopMin || L.stops[1][1] || 2); }
    L.idx = {}; L.real.forEach((id,i) => L.idx[id] = i);
  }
  for (const [a,b,m] of WALK){
    (WADJ[a] = WADJ[a] || []).push([b,m]);
    (WADJ[b] = WADJ[b] || []).push([a,m]);
  }
})();

function stName(id){ return ST[id] ? ST[id][0] : id; }

function lineNeighbors(L, st){
  const i = L.idx[st], n = L.real.length, out = [];
  if (i == null) return out;
  if (i < 0) return out;
  if (i + 1 < n) out.push([L.real[i+1], L.mins[i]]);
  else if (L.loop) out.push([L.real[0], L.mins[n-1]]);
  if (i - 1 >= 0) out.push([L.real[i-1], L.mins[i-1]]);
  else if (L.loop) out.push([L.real[n-1], L.mins[n-1]]);
  return out;
}

function planRoute(from, to, fewer){
  if (from === to) return null;
  const XP = fewer ? 12 : 2;
  const dist = new Map(), prev = new Map(), done = new Set();
  const pq = [];   // 二元堆積
  const hpush = it => { pq.push(it); let i = pq.length-1; while (i > 0){ const j = (i-1) >> 1; if (pq[j][0] <= pq[i][0]) break; [pq[i], pq[j]] = [pq[j], pq[i]]; i = j; } };
  const hpop = () => { const top = pq[0], last = pq.pop(); if (pq.length){ pq[0] = last; let i = 0; for(;;){ const l = 2*i+1, r = l+1; let m = i; if (l < pq.length && pq[l][0] < pq[m][0]) m = l; if (r < pq.length && pq[r][0] < pq[m][0]) m = r; if (m === i) break; [pq[i], pq[m]] = [pq[m], pq[i]]; i = m; } } return top; };
  const push = (key, d, p) => {
    if (dist.has(key) && dist.get(key) <= d) return;
    dist.set(key, d); prev.set(key, p); hpush([d, key]);
  };
  for (const lid of (SERVE[from]||[])) push(from+'|'+lid, LMAP[lid].wait, {k:'START', t:'board'});
  for (const [b,w] of (WADJ[from]||[]))
    for (const lid of (SERVE[b]||[])) push(b+'|'+lid, w + LMAP[lid].wait, {k:'START', t:'walk', min:w, a:from, b});
  while (pq.length){
    const [d, key] = hpop();
    if (done.has(key)) continue; done.add(key);
    if (key === 'END') break;
    const bar = key.indexOf('|'), st = key.slice(0, bar), lid = key.slice(bar+1);
    if (st === to) push('END', d, {k:key, t:'arrive'});
    for (const [b,w] of (WADJ[st]||[])) if (b === to) push('END', d + w, {k:key, t:'walkend', min:w, a:st, b});
    const L = LMAP[lid];
    for (const [nb, m] of lineNeighbors(L, st)) push(nb+'|'+lid, d + m, {k:key, t:'ride', min:m});
    for (const l2 of SERVE[st]) if (l2 !== lid) push(st+'|'+l2, d + 3 + LMAP[l2].wait + XP, {k:key, t:'xfer', min:3});
    for (const [b,w] of (WADJ[st]||[]))
      for (const l2 of (SERVE[b]||[])) if (l2 !== lid) push(b+'|'+l2, d + w + LMAP[l2].wait + XP, {k:key, t:'walk', min:w, a:st, b});
  }
  if (!dist.has('END')) return null;
  // 回溯
  const chain = [];
  let k = 'END';
  while (k !== 'START'){ const p = prev.get(k); chain.push({key:k, p}); k = p.k; }
  chain.reverse();
  const steps = [];
  let cur = null;
  for (const {key, p} of chain){
    if (p.t === 'walk' || p.t === 'walkend'){ cur = null; steps.push({type:'walk', a:p.a, b:p.b, min:p.min}); }
    if (p.t === 'xfer'){ cur = null; steps.push({type:'xfer', at:key.split('|')[0], min:p.min}); }
    if (key === 'END') break;
    const [st, lid] = key.split('|');
    if (p.t === 'ride'){
      cur.stations.push(st); cur.mins.push(p.min);
    } else {
      cur = {type:'ride', line:lid, stations:[st], mins:[]};
      steps.push(cur);
    }
  }
  // 去除空的乘車段（理論上不會發生），並決定方向
  const out = steps.filter(s => s.type !== 'ride' || s.stations.length > 1);
  let rides = 0, stops = 0;
  for (const s of out){
    if (s.type !== 'ride') continue;
    const L = LMAP[s.line];
    const i0 = L.real.indexOf(s.stations[0]), i1 = L.real.indexOf(s.stations[1]), n = L.real.length;
    s.fwd = L.loop ? ((i0 + 1) % n === i1) : (i1 > i0);
    s.total = s.mins.reduce((x,y)=>x+y, 0);
    if (L.loop){
      const nx = s.stations[1];
      const j = L.real.indexOf(nx), nx2 = L.real[(j + (s.fwd ? 1 : -1) + n) % n];
      s.dirLabel = stName(nx) + '・' + stName(nx2) + '方面';
    } else s.dirLabel = L.dir[s.fwd ? 0 : 1];
    rides++; stops += s.stations.length - 1;
  }
  // 合併連續的 xfer/walk 雜訊：若 walk 後立刻 xfer（不應發生）忽略
  return {from, to, steps: out, total: Math.round(dist.get('END')), transfers: Math.max(0, rides-1), stops};
}

// 取一段乘車的畫線座標（含轉折點），回傳 [{lat,lon,st|null}]
function ridePolyline(s){
  const L = LMAP[s.line], n = L.real.length, pts = [];
  for (let i=0;i<s.stations.length;i++){
    const id = s.stations[i];
    pts.push({lat:ST[id][2], lon:ST[id][3], st:id});
    if (i+1 < s.stations.length){
      const a = L.real.indexOf(id), b = L.real.indexOf(s.stations[i+1]);
      let w;
      if (s.fwd) w = L.wp[a] || [];
      else w = (L.wp[b] || []).slice().reverse();
      for (const [la,lo] of w) pts.push({lat:la, lon:lo, st:null});
    }
  }
  return pts;
}

function haversine(a1,o1,a2,o2){
  const R=6371, r=Math.PI/180;
  const da=(a2-a1)*r, dn=(o2-o1)*r;
  const h=Math.sin(da/2)**2+Math.cos(a1*r)*Math.cos(a2*r)*Math.sin(dn/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function nearestStations(lat, lon, k=3){
  return Object.keys(ST).map(id => [id, haversine(lat,lon,ST[id][2],ST[id][3])])
    .sort((x,y)=>x[1]-y[1]).slice(0,k);
}

