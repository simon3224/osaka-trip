// ====== 多天行程 ======
const SPOT_BY = {}; SPOTS.forEach((s,i) => SPOT_BY[s.n] = i);
const WD = '日一二三四五六';
let trips = [], otherTrips = [], curTripId = null, curDay = 0, openLeg = -1;
const tripCity = o => (o && o.city) || 'osaka';
const routeCache = new Map();
function routeOf(a, b){ if (!a || !b || a === b) return null; const k = a+'|'+b; if (!routeCache.has(k)) routeCache.set(k, planRoute(a, b, false)); return routeCache.get(k); }
const legMin = (a, b) => { if (!a || !b || a === b) return 0; const r = routeOf(a, b); return r ? r.total : 999; };
const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const isoDate = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function defaultStart(){ const d = new Date(); d.setDate(d.getDate()+14); return isoDate(d); }
const mkDay = () => ({t:'09:00', from:null, end:'home', stops:[]});
function newTrip(name){ return {id:uid(), city:CITY_ID, name:name||`我的${CITY.name}行程`, start:defaultStart(), home:homeId||null, days:[mkDay(),mkDay(),mkDay(),mkDay()], wish:[], updated:Date.now()}; }
function curTrip(){
  let t = trips.find(x => x.id === curTripId);
  if (!t){ t = trips[0]; if (!t){ t = newTrip(); trips.push(t); } curTripId = t.id; }
  return t;
}
function dayDateLabel(t, k){
  if (!t.start) return '';
  const d = new Date(t.start + 'T00:00:00'); if (isNaN(d)) return '';
  d.setDate(d.getDate()+k); return `${d.getMonth()+1}/${d.getDate()}(${WD[d.getDay()]})`;
}
const stopSt = s => s.s != null ? (SPOT_BY[s.s] != null ? SPOTS[SPOT_BY[s.s]].st : null) : s.st;
const stopName = s => s.s != null ? s.s : (ST[s.st] ? ST[s.st][0] + '站' : '?');
const stopHours = s => s.h != null ? s.h : (s.s != null && SPOT_BY[s.s] != null ? SPOTS[SPOT_BY[s.s]].h : 1);
const dayStart = (t, d) => d.from || t.home;
const dayEnd = (t, d) => d.end === 'none' ? null : (d.end === 'home' || !d.end) ? t.home : d.end;
const toMin = s => { const [h,m] = (s||'09:00').split(':').map(Number); return (h||0)*60 + (m||0); };
const fmtMin = m => { m = Math.round(m); return String(Math.floor(m/60)%24).padStart(2,'0') + ':' + String(((m%60)+60)%60).padStart(2,'0'); };
function spotDayOf(n){ return curTrip().days.findIndex(d => d.stops.some(s => s.s === n)); }

function sanitizeTrip(o){
  if (!o || typeof o !== 'object') return null;
  const t = {
    id: typeof o.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(o.id) ? o.id : uid(), city: CITY_ID,
    name: String(o.name || '行程').slice(0,60),
    start: /^\d{4}-\d{2}-\d{2}$/.test(o.start || '') ? o.start : '',
    home: ST[o.home] ? o.home : null, wish:[], days:[], updated: +o.updated || Date.now()
  };
  t.wish = (Array.isArray(o.wish) ? o.wish : []).filter(n => SPOT_BY[n] != null);
  for (const d of (Array.isArray(o.days) ? o.days : []).slice(0,30)){
    if (!d || typeof d !== 'object') continue;
    const nd = {t: /^\d{2}:\d{2}$/.test(d.t || '') ? d.t : '09:00', from: ST[d.from] ? d.from : null,
      end: (d.end === 'home' || d.end === 'none' || ST[d.end]) ? d.end : 'home', stops:[]};
    for (const s of (Array.isArray(d.stops) ? d.stops : []).slice(0,40)){
      if (!s) continue;
      const h = s.h != null ? clamp(+s.h || 1, 0.25, 14) : null;
      if (s.s != null && SPOT_BY[s.s] != null) nd.stops.push(h != null ? {s:s.s, h} : {s:s.s});
      else if (ST[s.st]) nd.stops.push(h != null ? {st:s.st, h} : {st:s.st});
    }
    t.days.push(nd);
  }
  if (!t.days.length) t.days.push(mkDay());
  return t;
}

function saveLocal(){ store.set('trips', [...otherTrips, ...trips]); store.set('curTrip', curTripId); }
function touch(t, opts={}){
  t.updated = Date.now(); saveLocal(); cloudQueue(t);
  if (opts.quiet) return;
  renderTrip(); refreshSpotMarkers();
  if ($('#tab-spots').classList.contains('on')) renderSpots();
}
function toggleWish(n){
  const t = curTrip(), i = t.wish.indexOf(n);
  if (i >= 0) t.wish.splice(i,1); else { t.wish.push(n); toast('⭐ 已加入想去：' + n); }
  touch(t);
}
function addSpotToDay(n, k){
  const t = curTrip(); k = clamp(k|0, 0, t.days.length-1);
  t.days.forEach(d => d.stops = d.stops.filter(s => s.s !== n));
  t.days[k].stops.push({s:n}); t.wish = t.wish.filter(x => x !== n);
  curDay = k; openLeg = -1; toast(`已排入第 ${k+1} 天：${n}`); touch(t);
}
function addStationToDay(id, k){
  const t = curTrip(); k = clamp(k|0, 0, t.days.length-1);
  t.days[k].stops.push({st:id}); curDay = k; openLeg = -1; toast(`已排入第 ${k+1} 天：${ST[id][0]}站`); touch(t);
}
function syncHome(id){ const t = curTrip(); if (t.home !== id){ t.home = id; touch(t); } }

// 一天的時間表
function dayPlan(t, k){
  const d = t.days[k]; const legs = [], items = [];
  let prev = dayStart(t, d), tm = toMin(d.t);
  const start = {st:prev, time:tm};
  d.stops.forEach(s => {
    const st = stopSt(s), r = routeOf(prev, st);
    const m = prev && st && prev !== st ? (r ? r.total : 0) : 0;
    legs.push({from:prev, to:st, r, min:m});
    tm += m; const arr = tm; tm += Math.round(stopHours(s)*60);
    items.push({s, st, arr, dep:tm}); prev = st;
  });
  const end = dayEnd(t, d); let back = null;
  if (end && (d.stops.length || d.from)){
    const r = routeOf(prev, end), m = prev && prev !== end ? (r ? r.total : 0) : 0;
    back = {from:prev, to:end, r, min:m}; tm += m;
  }
  const travel = legs.reduce((a,l) => a + l.min, 0) + (back ? back.min : 0);
  const stay = d.stops.reduce((a,s) => a + stopHours(s), 0);
  return {d, start, legs, items, back, endTime:tm, travel, stay};
}

// 最佳順序（≤8 個景點窮舉，其餘最近鄰 + 2-opt）
function optimizeDay(t, k, silent){
  const d = t.days[k], n = d.stops.length;
  if (n < 2){ if (!silent) toast('至少要有 2 個地點才需要排序'); return; }
  const s0 = dayStart(t, d), e0 = dayEnd(t, d);
  const sts = d.stops.map(stopSt);
  const S = sts.map(x => s0 ? legMin(s0, x) : 0), E = sts.map(x => e0 ? legMin(x, e0) : 0);
  const C = sts.map(a => sts.map(b => legMin(a, b)));
  const cost = o => { let c = S[o[0]]; for (let i=1;i<o.length;i++) c += C[o[i-1]][o[i]]; return c + E[o[o.length-1]]; };
  let best = [...Array(n).keys()], bc = cost(best);
  const before = bc;
  if (n <= 8){
    const a = best.slice(), c = new Array(n).fill(0); let i = 0;
    while (i < n){
      if (c[i] < i){
        if (i % 2 === 0) [a[0], a[i]] = [a[i], a[0]]; else [a[c[i]], a[i]] = [a[i], a[c[i]]];
        const v = cost(a); if (v < bc){ bc = v; best = a.slice(); }
        c[i]++; i = 0;
      } else { c[i] = 0; i++; }
    }
  } else {
    const used = new Set(), o = []; let cur = null;
    for (let step=0; step<n; step++){
      let bi = -1, bv = 1e9;
      for (let j=0;j<n;j++) if (!used.has(j)){ const v = cur == null ? S[j] : C[cur][j]; if (v < bv){ bv = v; bi = j; } }
      used.add(bi); o.push(bi); cur = bi;
    }
    best = o; bc = cost(o);
    let improved = true;
    while (improved){
      improved = false;
      for (let i=0;i<n-1;i++) for (let j=i+1;j<n;j++){
        const cand = best.slice(0,i).concat(best.slice(i,j+1).reverse(), best.slice(j+1));
        const v = cost(cand); if (v < bc - 0.01){ bc = v; best = cand; improved = true; }
      }
    }
  }
  d.stops = best.map(i => d.stops[i]);
  if (silent) return;
  toast(bc < before ? `已重新排序：交通時間 ${before} 分 → ${bc} 分` : '目前順序已經是最省交通時間的了');
  openLeg = -1; touch(t);
}

// 自動分配到各天
function autoArrange(t){
  if (!t.home){ toast('請先設定住宿車站'); pickHome(() => autoArrange(curTrip())); return; }
  const pool = [...new Set([...t.days.flatMap(d => d.stops.filter(s => s.s != null).map(s => s.s)), ...t.wish])];
  if (!pool.length){ toast('先在「景點」頁或 3D 地圖把想去的地方加 ⭐'); return; }
  t.days.forEach(d => d.stops = d.stops.filter(s => s.s == null));
  const sp = pool.map(n => SPOTS[SPOT_BY[n]]);
  const CAP = 10*60, groups = [];
  sp.filter(s => s.h >= 6).forEach(s => groups.push([s]));
  const rest = sp.filter(s => s.h < 6);
  for (const a of CITY.spotAreas){
    const left = rest.filter(s => s.a === a);
    while (left.length){
      left.sort((x,y) => legMin(t.home, y.st) - legMin(t.home, x.st));
      const g = [left.shift()];
      let load = legMin(t.home, g[0].st)*2 + g[0].h*60;
      while (left.length){
        let bi = -1, bv = 1e9;
        left.forEach((s,i) => { const v = Math.min(...g.map(x => legMin(x.st, s.st))); if (v < bv){ bv = v; bi = i; } });
        const s = left[bi], add = bv + s.h*60 + 10;
        if (load + add > CAP) break;
        g.push(s); load += add; left.splice(bi,1);
      }
      groups.push(g);
    }
  }
  // 天數不夠時，合併最輕的兩組（同區、合計不超過上限太多）
  const load = g => g.reduce((a,x) => a + x.h*60, 0) + 2*legMin(t.home, g[0].st) + (g.length-1)*20;
  while (groups.length > t.days.length){
    let best = null;
    for (let i=0;i<groups.length;i++) for (let j=i+1;j<groups.length;j++){
      const a = groups[i], b = groups[j];
      if (a[0].h >= 6 || b[0].h >= 6 || a[0].a !== b[0].a) continue;
      const L2 = load(a.concat(b));
      if (L2 <= CAP*1.12 && (!best || L2 < best.L)) best = {i, j, L:L2};
    }
    if (!best) break;
    groups[best.i] = groups[best.i].concat(groups[best.j]); groups.splice(best.j, 1);
  }
  // 把主要城市市區的天排前面、樂園／外縣市往後，避免抵達日太累
  const A0 = CITY.spotAreas[0];
  groups.sort((x,y) => (x[0].a === A0 && x[0].h < 6 ? 0 : 1) - (y[0].a === A0 && y[0].h < 6 ? 0 : 1));
  const leftover = [];
  groups.forEach((g,i) => { if (i < t.days.length) t.days[i].stops.push(...g.map(s => ({s:s.n}))); else leftover.push(...g.map(s => s.n)); });
  t.wish = leftover;
  t.days.forEach((d,k) => { if (d.stops.length > 1) optimizeDay(t, k, true); });
  curDay = 0; openLeg = -1; touch(t); viewDay();
  const used = Math.min(groups.length, t.days.length);
  toast(leftover.length ? `排好 ${used} 天；還有 ${leftover.length} 個景點排不下，留在想去清單（可增加天數）` : `已自動排好 ${used} 天的行程，各天也排好了最佳順序`, 5000);
}

// ---- 3D ----
function dayMarks(t, P){
  return P.items.map((it,i) => {
    if (it.s.s != null){ const sp = SPOTS[SPOT_BY[it.s.s]]; return {y:sp.y, x:sp.x, label:`${i+1} ${sp.n}`}; }
    return {y:ST[it.st][2], x:ST[it.st][3], label:`${i+1} ${ST[it.st][0]}`};
  });
}
function viewDay(){
  if (ride.active) return;
  const t = curTrip(), P = dayPlan(t, curDay);
  const legs = [...P.legs.map(l => l.r), P.back && P.back.r].filter(Boolean);
  curRoute = null;
  if (!legs.length && !P.items.length){ buildRoute3D(null); return; }
  buildRoute3D(null, {legs, marks:dayMarks(t, P), home:dayStart(t, P.d)});
}
function getLeg(k){ const P = dayPlan(curTrip(), curDay); return k === 'b' ? P.back : P.legs[+k]; }
function legSpot(k){
  if (k === 'b') return null;
  const it = curTrip().days[curDay].stops[+k];
  return it && it.s != null ? SPOTS[SPOT_BY[it.s]] : null;
}
function showLeg(k){
  const l = getLeg(k); if (!l || !l.r) return;
  curRoute = Object.assign({}, l.r, {spot:legSpot(k)});
  buildRoute3D(curRoute);
}
function rideLeg(k){
  k = String(k); const l = getLeg(k); if (!l || !l.r){ toast('這段不需要搭車'); return; }
  startRide(Object.assign({}, l.r, {spot:legSpot(k)}));
}
function dayRideList(){
  const t = curTrip(), P = dayPlan(t, curDay);
  const ls = [...P.legs.map((l,i) => [l, String(i)]), ...(P.back ? [[P.back,'b']] : [])].filter(([l]) => l.r);
  if (!ls.length) return `<div class="card"><p class="mut" style="margin:0">在「行程」頁排好第 ${curDay+1} 天後，這裡可以直接選一段開始導航。</p></div>`;
  return `<div class="card"><b>🗓️ 第 ${curDay+1} 天 ${dayDateLabel(t,curDay)} 的交通</b>${ls.map(([l,k]) =>
    `<button class="leg" data-rideleg="${k}"><span class="lt">${esc(ST[l.from][0])} → ${esc(ST[l.to][0])}</span><span>約 ${l.r.total} 分</span><span class="chev">🚃</span></button>`).join('')}</div>`;
}

// ---- 行程頁 UI ----
function stepsCompact(r){
  return r.steps.map(s => {
    if (s.type === 'walk') return `<div class="sc">🚶 步行到 ${esc(ST[s.b][0])}（約${s.min}分）</div>`;
    if (s.type === 'xfer') return `<div class="sc">🔁 在 ${esc(ST[s.at][0])} 站內換乘</div>`;
    const L = LMAP[s.line], n = s.stations.length - 1;
    return `<div class="sc">${badge(L)} <b>${esc(L.name)}</b> 往 ${esc(s.dirLabel)}<br><span class="mut">${esc(ST[s.stations[0]][0])} → ${esc(ST[s.stations[n]][0])} · ${n} 站 · 約 ${s.total} 分</span></div>`;
  }).join('');
}
function legRow(l, k){
  if (!l.from || !l.to) return `<div class="leg none">— 請先設定住宿車站 —</div>`;
  if (l.from === l.to || !l.r) return `<div class="leg same">🚶 同一站附近，步行即可</div>`;
  const r = l.r, open = openLeg === String(k);
  const bs = r.steps.filter(s => s.type === 'ride').map(s => badge(LMAP[s.line])).join('<span class="sa">›</span>');
  let h = `<button class="leg" data-leg="${k}"><span class="lt">${bs}</span><span>約 ${r.total} 分${r.transfers ? ` · 轉 ${r.transfers}` : ''}</span><span class="chev">${open ? '▾' : '▸'}</span></button>`;
  if (open) h += `<div class="legd">${stepsCompact(r)}
    <div class="row"><button class="sec" data-leg3d="${k}">🗺️ 3D 顯示</button><button class="primary" data-legride="${k}">🚃 開始導航</button></div>
    <a class="ext" href="${gmapsTransit(r.from, r.to)}" target="_blank" rel="noopener">Google 地圖即時班次 ↗</a></div>`;
  return h;
}
function stationRow(kind, st, time, label){
  return `<div class="stop se"><span class="num ${kind}">${kind === 'start' ? '起' : '終'}</span><div class="sb"><b>${st ? esc(ST[st][0]) + '站' : '未設定'}</b><div class="mut">${time} · ${label}</div></div></div>`;
}
function stopRow(it, i, t){
  const s = it.s, sp = s.s != null ? SPOTS[SPOT_BY[s.s]] : null, hv = stopHours(s);
  const hs = [0.5,1,1.5,2,2.5,3,4,5,6,8,10]; if (!hs.includes(hv)) hs.push(hv);
  return `<div class="stop"><span class="num">${i+1}</span><div class="sb">
    <b>${esc(stopName(s))}</b>
    <div class="mut">${fmtMin(it.arr)}–${fmtMin(it.dep)} · ${esc(ST[it.st][0])}站${sp && sp.ex ? ' ' + esc(sp.ex) : ''}${sp ? ` · 步行${sp.w}分` : ''}</div>
    <div class="sctl"><button data-up="${i}" aria-label="上移">↑</button><button data-dn="${i}" aria-label="下移">↓</button>
      <select data-hrs="${i}">${hs.sort((a,b)=>a-b).map(v => `<option value="${v}" ${v === hv ? 'selected' : ''}>停 ${v}h</option>`).join('')}</select>
      <select data-mv="${i}">${t.days.map((d,k) => `<option value="${k}" ${k === curDay ? 'selected' : ''}>第${k+1}天</option>`).join('')}</select>
      ${sp ? `<button data-info="${SPOT_BY[s.s]}" aria-label="資訊">ⓘ</button>` : ''}<button data-del="${i}" aria-label="移除">✕</button></div>
  </div></div>`;
}

function renderTrip(){
  const el = $('#tripBox'); if (!el) return;
  const t = curTrip(); curDay = clamp(curDay, 0, t.days.length-1);
  const P = dayPlan(t, curDay), d = t.days[curDay];
  let h = `<div class="card">
    <div class="trip-top"><select id="tripSel" class="sel">${trips.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}${cloud.ids.has(x.id) ? ' ☁️' : ''}</option>`).join('')}</select>
      <button class="sec mini" id="tripNew">＋ 新行程</button></div>
    <div class="fld"><label>名稱</label><input id="tripName" value="${esc(t.name)}" maxlength="60"></div>
    <div class="fld2"><div class="fld"><label>出發日</label><input type="date" id="tripStart" value="${t.start}"></div>
      <div class="fld"><label>天數</label><div class="stepper"><button id="dMinus">−</button><b>${t.days.length}</b><button id="dPlus">＋</button></div></div></div>
    <div class="fld"><label>住宿車站</label><button class="sec left" id="tripHome">${t.home ? '🏨 ' + esc(ST[t.home][0]) + ' <small>' + esc(ST[t.home][1]) + '</small>' : '🏨 設定住宿車站'}</button></div>
    <div class="cloudline" id="cloudLine">${esc(cloud.status)}</div>
  </div>`;
  h += `<div class="card"><div class="hrow"><b>⭐ 想去清單</b><span class="mut">${t.wish.length} 個尚未排入</span></div>`;
  h += t.wish.length
    ? `<div class="wish">${t.wish.map((n,i) => `<div class="wi"><span>${esc(n)}</span><select class="sel sm" data-wday="${i}"><option value="">排入…</option>${t.days.map((x,k) => `<option value="${k}">第${k+1}天</option>`).join('')}</select><button class="x" data-wdel="${i}" aria-label="移除">✕</button></div>`).join('')}</div>`
    : `<div class="mut">在「景點」頁或 3D 地圖點景點，按 ☆ 加入想去。</div>`;
  h += `<div class="row"><button class="primary" id="autoArr">🪄 自動排入各天</button></div>
    <div class="note">依區域與距離分天（京都、奈良、神戶各自一天，USJ 單獨一天），每天再排出最省交通時間的順序。會重新安排所有景點，你手動加的車站會保留。</div></div>`;
  h += `<div class="daytabs">${t.days.map((x,k) => `<button class="chip ${k === curDay ? 'on' : ''}" data-day="${k}">第${k+1}天<small>${dayDateLabel(t,k)}</small>${x.stops.length ? `<i>${x.stops.length}</i>` : ''}</button>`).join('')}</div>`;
  h += `<div class="card day"><div class="hrow"><b>第 ${curDay+1} 天 ${dayDateLabel(t, curDay)}</b><label class="tm">出發 <input type="time" id="dayT" value="${d.t}"></label></div><div class="tl2">`;
  h += stationRow('start', P.start.st, fmtMin(P.start.time), d.from ? '起點（自訂）' : '🏨 從住宿出發');
  P.items.forEach((it,i) => { h += legRow(P.legs[i], i); h += stopRow(it, i, t); });
  if (P.back){ h += legRow(P.back, 'b'); h += stationRow('end', P.back.to, fmtMin(P.endTime), d.end === 'home' || !d.end ? '🏨 回到住宿' : '結束'); }
  h += `</div>`;
  if (!d.stops.length) h += `<div class="mut" style="margin:8px 0">這天還沒有安排：按「＋景點」，或從想去清單排入。</div>`;
  else h += `<div class="sumline">🚃 交通約 <b>${P.travel}</b> 分 · 📍 停留 <b>${+P.stay.toFixed(1)}</b> 小時 · 預計 <b>${fmtMin(P.endTime)}</b> 結束${P.endTime > toMin('21:30') ? ' <span class="warnc">⚠️ 有點滿</span>' : ''}</div>`;
  const endOpt = d.end && d.end !== 'home' && d.end !== 'none' ? `<option value="${d.end}">結束：${esc(ST[d.end][0])}</option>` : '';
  h += `<div class="row"><button class="sec" id="addSpot">＋ 景點</button><button class="sec" id="addSt">＋ 車站</button></div>
    <div class="row"><button class="sec" id="optDay">🧭 最佳順序</button><button class="sec" id="viewDay">🗺️ 整天 3D</button></div>
    <div class="row"><button class="sec" id="dayFrom">起點：${esc(d.from ? ST[d.from][0] : '住宿')}</button>
      <select class="sel" id="dayEnd"><option value="home">結束：回住宿</option><option value="none">結束：不回住宿</option>${endOpt}<option value="pick">結束：指定車站…</option></select></div></div>`;
  h += `<div class="card"><b>💾 儲存與分享</b>
    <div class="row"><button class="sec" id="shText">📋 文字行程</button><button class="sec" id="shCode">🔗 ${IN_FRAME ? '分享碼' : '分享連結'}</button></div>
    <div class="row"><button class="sec" id="exFile">📤 匯出檔案</button><button class="sec" id="imFile">📥 匯入</button></div>
    <div class="row"><button class="sec danger" id="tripDel">🗑️ 刪除這個行程</button></div>
    <input type="file" id="imInput" accept=".json,application/json" hidden>
    <p class="note">${cloud.db ? '行程會自動存到 Claude 雲端（關掉也不會不見）。在 claude.ai 用「分享」把這個頁面分享給同行的人，對方登入後就能看到你的行程。' : '行程會自動存在這支手機的瀏覽器。'}「匯出檔案」可存到 iCloud／Google 雲端硬碟備份，換手機再匯入；「文字行程」適合貼到 LINE；「${IN_FRAME ? '分享碼' : '分享連結'}」可讓對方一鍵匯入整份行程。</p></div>`;
  el.innerHTML = h;
  $('#dayEnd').value = d.end || 'home';
}

function moveStop(i, dir){
  const t = curTrip(), st = t.days[curDay].stops, j = i + dir;
  if (j < 0 || j >= st.length) return;
  [st[i], st[j]] = [st[j], st[i]]; openLeg = -1; touch(t); viewDay();
}
function pickHome(after){
  openPicker('設定住宿車站', id => { homeId = id; store.set('home', id); syncHome(id); renderOD(); after && after(); });
}
function confirmPop(msg, okText, fn){
  openPop(`<div class="pop-h"><b>${esc(msg)}</b></div><div class="row"><button class="sec" data-c="0">取消</button><button class="primary" data-c="1">${esc(okText)}</button></div>`);
  $('#popBody').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; closePop(); if (b.dataset.c === '1') fn(); };
}

function bindTrip(){
  const el = $('#tripBox');
  el.onclick = e => {
    const g = s => e.target.closest(s); let b;
    const t = curTrip(), d = t.days[curDay];
    if ((b = g('[data-day]'))){ curDay = +b.dataset.day; openLeg = -1; renderTrip(); viewDay(); return; }
    if ((b = g('[data-leg]'))){ const k = b.dataset.leg; openLeg = openLeg === k ? -1 : k; renderTrip(); if (openLeg !== -1) showLeg(k); else viewDay(); return; }
    if ((b = g('[data-leg3d]'))){ showLeg(b.dataset.leg3d); $('#panel').scrollTo({top:0, behavior:'smooth'}); return; }
    if ((b = g('[data-legride]'))){ rideLeg(b.dataset.legride); return; }
    if ((b = g('[data-up]'))){ moveStop(+b.dataset.up, -1); return; }
    if ((b = g('[data-dn]'))){ moveStop(+b.dataset.dn, 1); return; }
    if ((b = g('[data-info]'))){ showSpotPop(+b.dataset.info); return; }
    if ((b = g('[data-del]'))){
      const s = d.stops.splice(+b.dataset.del, 1)[0];
      if (s && s.s != null && !t.wish.includes(s.s)){ t.wish.push(s.s); toast('已移回想去清單：' + s.s); }
      openLeg = -1; touch(t); viewDay(); return;
    }
    if ((b = g('[data-wdel]'))){ t.wish.splice(+b.dataset.wdel, 1); touch(t); return; }
    const id = e.target.closest('button') && e.target.closest('button').id;
    switch (id){
      case 'tripNew': { const nt = newTrip('新行程 ' + (trips.length+1)); trips.push(nt); curTripId = nt.id; curDay = 0; touch(nt); viewDay(); toast('已建立新行程，可在「名稱」改名'); break; }
      case 'dMinus': if (t.days.length > 1){ const last = t.days.pop(); last.stops.forEach(s => { if (s.s != null && !t.wish.includes(s.s)) t.wish.push(s.s); }); touch(t); } break;
      case 'dPlus': if (t.days.length < 21){ t.days.push(mkDay()); touch(t); } break;
      case 'tripHome': pickHome(() => viewDay()); break;
      case 'autoArr': autoArrange(t); break;
      case 'addSpot': openSpotPicker(`加入景點到第 ${curDay+1} 天`, n => { addSpotToDay(n, curDay); viewDay(); }); break;
      case 'addSt': openPicker(`加入車站到第 ${curDay+1} 天（購物、吃飯…）`, sid => { addStationToDay(sid, curDay); viewDay(); }); break;
      case 'optDay': optimizeDay(t, curDay); viewDay(); break;
      case 'viewDay': viewDay(); $('#panel').scrollTo({top:0, behavior:'smooth'}); break;
      case 'dayFrom': openPicker(`第 ${curDay+1} 天的起點（例：抵達日從関西空港出發）`, sid => { d.from = sid === t.home ? null : sid; openLeg = -1; touch(t); viewDay(); }); break;
      case 'shText': shareText(); break;
      case 'shCode': shareCode(); break;
      case 'exFile': exportFile(t); break;
      case 'imFile': importPop(); break;
      case 'tripDel': confirmPop(`刪除「${t.name}」？雲端上的也會一起刪除。`, '刪除', () => {
          trips = trips.filter(x => x.id !== t.id); cloudDelete(t.id); curTripId = null; curDay = 0;
          const nt = curTrip(); saveLocal(); if (!nt.updated) touch(nt); renderTrip(); refreshSpotMarkers(); viewDay(); toast('已刪除'); });
        break;
    }
  };
  el.onchange = e => {
    const x = e.target, t = curTrip(), d = t.days[curDay];
    if (x.id === 'tripSel'){ curTripId = x.value; curDay = 0; openLeg = -1; const nt = curTrip(); if (nt.home){ homeId = nt.home; store.set('home', homeId); renderOD(); } saveLocal(); renderTrip(); refreshSpotMarkers(); viewDay(); return; }
    if (x.id === 'tripName'){ t.name = x.value.trim() || '我的行程'; touch(t); return; }
    if (x.id === 'tripStart'){ t.start = x.value; touch(t); return; }
    if (x.id === 'dayT'){ d.t = x.value || '09:00'; touch(t); return; }
    if (x.id === 'dayEnd'){
      if (x.value === 'pick'){ openPicker(`第 ${curDay+1} 天結束在哪一站？`, sid => { d.end = sid === t.home ? 'home' : sid; openLeg = -1; touch(t); viewDay(); }); renderTrip(); return; }
      d.end = x.value; openLeg = -1; touch(t); viewDay(); return;
    }
    if (x.dataset.hrs != null){ const s = d.stops[+x.dataset.hrs]; const v = +x.value; const def = s.s != null ? SPOTS[SPOT_BY[s.s]].h : 1; if (v === def) delete s.h; else s.h = v; touch(t); return; }
    if (x.dataset.mv != null){ const k = +x.value; if (k !== curDay){ const s = d.stops.splice(+x.dataset.mv, 1)[0]; t.days[k].stops.push(s); toast(`已移到第 ${k+1} 天`); openLeg = -1; touch(t); viewDay(); } return; }
    if (x.dataset.wday != null && x.value !== ''){ addSpotToDay(t.wish[+x.dataset.wday], +x.value); viewDay(); return; }
  };
  $('#tripBox').addEventListener('change', e => { if (e.target.id === 'imInput') readImportFile(e.target); });
}

// 景點選擇器（共用車站選擇器的畫面）
function openSpotPicker(title, cb){
  pickCb = cb; pickMode = 'spot'; $('#pkTitle').textContent = title; $('#pkSearch').value = '';
  renderPicker(''); $('#picker').classList.add('open');
}
function renderSpotPicker(q){
  q = q.trim().toLowerCase();
  const t = curTrip(), wish = new Set(t.wish);
  let h = '';
  for (const a of CITY.spotAreas){
    const list = SPOTS.filter(s => s.a === a && (!q || s.n.toLowerCase().includes(q) || s.d.toLowerCase().includes(q) || ST[s.st][0].includes(q) || ST[s.st][1].toLowerCase().includes(q)));
    if (!list.length) continue;
    h += `<div class="pk-g">${a}</div>` + list.map(s => {
      const dd = spotDayOf(s.n);
      return `<button class="pk-i" data-spot="${esc(s.n)}"><span><b>${wish.has(s.n) ? '⭐ ' : ''}${esc(s.n)}</b><small>${esc(ST[s.st][0])}站 · 停留約 ${s.h}h${dd >= 0 ? ' · 已在第' + (dd+1) + '天' : ''}</small></span></button>`;
    }).join('');
  }
  $('#pkList').innerHTML = h || '<div class="empty">找不到景點</div>';
}

// ---- 分享 / 匯出 / 匯入 ----
const legText = r => r.steps.filter(s => s.type === 'ride').map(s => `${LMAP[s.line].name}（${ST[s.stations[0]][0]}→${ST[s.stations[s.stations.length-1]][0]}）`).join(' ⇒ ');
function tripText(t){
  let s = `【${t.name}】${t.start ? t.start.replace(/-/g,'/') + ' 起 ' : ''}${t.days.length} 天${t.home ? ' · 住宿：' + ST[t.home][0] + '站' : ''}\n`;
  t.days.forEach((d,k) => {
    const P = dayPlan(t, k);
    s += `\n■ 第${k+1}天 ${dayDateLabel(t,k)}\n`;
    if (!d.stops.length){ s += '（尚未安排）\n'; return; }
    s += `${fmtMin(P.start.time)} 從 ${P.start.st ? ST[P.start.st][0] + '站' : '?'} 出發\n`;
    P.items.forEach((it,i) => {
      const l = P.legs[i];
      if (l.r) s += `　🚃 ${legText(l.r)} 約${l.r.total}分\n`;
      s += `${fmtMin(it.arr)} ${i+1}. ${stopName(it.s)}（停留 ${stopHours(it.s)}h）\n`;
    });
    if (P.back){ if (P.back.r) s += `　🚃 ${legText(P.back.r)} 約${P.back.r.total}分\n`; s += `${fmtMin(P.endTime)} 抵達 ${ST[P.back.to][0]}站\n`; }
  });
  if (t.wish.length) s += `\n⭐ 想去但還沒排：${t.wish.join('、')}\n`;
  return s + `\n（${CITY.title}產生；時間為估算，以實際班次為準）`;
}
const b64u = u8 => { let s = ''; for (let i=0;i<u8.length;i+=0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i+0x8000)); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
const unb64u = s => { s = s.replace(/-/g,'+').replace(/_/g,'/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i=0;i<b.length;i++) u[i] = b.charCodeAt(i); return u; };
async function encodeTrip(t){
  const bytes = new TextEncoder().encode(JSON.stringify(t));
  if (window.CompressionStream){
    try{ const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer(); return 'Z' + b64u(new Uint8Array(buf)); }catch(e){}
  }
  return 'J' + b64u(bytes);
}
async function decodeTrip(code){
  code = String(code).trim().replace(/^.*#trip=/, '').replace(/\s+/g, '');
  const kind = code[0], bytes = unb64u(code.slice(1));
  if (kind === 'Z'){
    if (!window.DecompressionStream) throw new Error('此瀏覽器版本太舊，無法解開分享碼');
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buf));
  }
  if (kind === 'J') return JSON.parse(new TextDecoder().decode(bytes));
  throw new Error('分享碼格式不正確');
}
function copyBox(title, text, note, shareData){
  openPop(`<div class="pop-h"><b>${esc(title)}</b></div>
    <textarea class="cbox" readonly>${esc(text)}</textarea>
    ${note ? `<p class="note">${note}</p>` : ''}
    <div class="row"><button class="primary" data-cp="1">📋 複製</button>${shareData && navigator.share && !IN_FRAME ? '<button class="sec" data-cp="2">📤 分享…</button>' : ''}</div>`);
  $('#popBody').onclick = async e => {
    const b = e.target.closest('[data-cp]'); if (!b) return;
    if (b.dataset.cp === '1'){
      try{ await navigator.clipboard.writeText(text); toast('已複製'); }
      catch(err){ const ta = $('#popBody .cbox'); ta.focus(); ta.select(); toast('請長按文字選取後手動複製'); }
    } else { try{ await navigator.share(shareData); }catch(err){} }
  };
}
function shareText(){ const t = curTrip(), s = tripText(t); copyBox('文字行程（可貼到 LINE）', s, '', {title:t.name, text:s}); }
async function shareCode(){
  const t = curTrip(), code = await encodeTrip(t);
  if (IN_FRAME){
    copyBox('分享碼', code, '對方在這個工具的「行程 → 📥 匯入 → 貼上分享碼」即可匯入整份行程。若對方也能開啟這個 Claude 頁面，雲端上的行程會直接出現。', null);
  } else {
    const url = location.origin + location.pathname + '#trip=' + code;
    copyBox('分享連結', url, '對方點開連結就會詢問是否匯入這份行程。', {title:t.name, text:`${t.name}（大阪電車 3D 導航）`, url});
  }
}
async function exportFile(t){
  const data = JSON.stringify({app:'train-3d-trip', v:2, trip:t}, null, 1);
  const fn = (t.name || 'trip').replace(/[\\/:*?"<>|#]/g, '_') + '.json';
  if (cloud.dl){
    try{ await cloud.dl.save({filename:fn, data}); toast('已匯出：' + fn); return; }
    catch(e){ if (e && e.code === 'declined') return; if (!(e && /unavailable|not_granted|capability/.test(e.code||''))){ toast('匯出失敗：' + ((e && e.message) || e)); return; } }
  }
  try{
    const file = new File([data], fn, {type:'application/json'});
    if (!IN_FRAME && navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], title:t.name}); return; }
  }catch(e){ if (e && e.name === 'AbortError') return; }
  try{
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], {type:'application/json'})); a.download = fn;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('已下載：' + fn);
  }catch(e){ copyBox('無法下載，請複製下面內容存成 .json', data, '', null); }
}
function importTripObj(obj, label){
  const raw = obj && obj.trip ? obj.trip : obj;
  if (raw && typeof raw === 'object' && tripCity(raw) !== CITY_ID && CITIES[tripCity(raw)]){
    const c = tripCity(raw);
    otherTrips = otherTrips.filter(x => x.id !== raw.id); otherTrips.push(Object.assign({}, raw, {city:c, updated:Date.now()}));
    saveLocal(); cloudQueueRaw(otherTrips[otherTrips.length-1]);
    confirmPop(`這是${CITIES[c].name}的行程「${raw.name || ''}」，已存好。要切換到${CITIES[c].name}查看嗎？`, '切換', () => switchCity(c));
    return;
  }
  const t = sanitizeTrip(raw);
  if (!t){ toast('檔案內容不是行程'); return; }
  const i = trips.findIndex(x => x.id === t.id);
  if (i >= 0) trips[i] = t; else trips.push(t);
  curTripId = t.id; curDay = 0; openLeg = -1;
  if (t.home){ homeId = t.home; store.set('home', homeId); renderOD(); }
  touch(t); viewDay(); switchTab('trip');
  toast(`已${i >= 0 ? '更新' : '匯入'}行程：${t.name}${label ? '（' + label + '）' : ''}`);
}
function importPop(){
  openPop(`<div class="pop-h"><b>匯入行程</b></div>
    <div class="row"><button class="primary" data-im="file">📂 選擇 .json 檔案</button></div>
    <div class="mut" style="margin-top:12px">或貼上分享碼／分享連結：</div>
    <textarea class="cbox" id="imCode" placeholder="Z… 或 https://…#trip=…"></textarea>
    <div class="row"><button class="sec" data-im="code">匯入分享碼</button></div>`);
  $('#popBody').onclick = async e => {
    const b = e.target.closest('[data-im]'); if (!b) return;
    if (b.dataset.im === 'file'){ closePop(); $('#imInput').click(); }
    else { try{ importTripObj(await decodeTrip($('#imCode').value), '分享碼'); closePop(); }catch(err){ toast('無法讀取分享碼：' + err.message); } }
  };
}
function readImportFile(input){
  const f = input.files && input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try{ importTripObj(JSON.parse(rd.result), f.name); }catch(e){ toast('檔案格式錯誤，無法匯入'); } input.value = ''; };
  rd.readAsText(f);
}
async function checkHashImport(){
  if (!location.hash.startsWith('#trip=')) return;
  try{
    const obj = await decodeTrip(location.hash);
    if (!obj || typeof obj !== 'object') return;
    const c = CITIES[tripCity(obj)] || CITY;
    confirmPop(`收到分享的${c.name}行程「${String(obj.name || '').slice(0,60)}」（${Array.isArray(obj.days) ? obj.days.length : '?'} 天），要匯入嗎？`, '匯入', () => importTripObj(obj, '分享連結'));
  }catch(e){ toast('分享連結無法讀取：' + e.message); }
  try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
}

// ---- 雲端（Claude 頁面的 db） ----
const cloud = {db:null, dl:null, status:'雲端：檢查中…', ro:false, ok:false, ids:new Set(), timers:{}, busy:new Set(), again:new Set(), pushed:false};
function renderCloud(){ const el = $('#cloudLine'); if (el) el.textContent = cloud.status; }
async function initCloud(){
  const C = window.claude;
  if (!(C && typeof C.use === 'function')){
    cloud.status = IN_FRAME ? '雲端：此環境不可用，資料先存在本機' : '💾 資料存在這支手機；備份請用「匯出檔案」或「分享連結」';
    renderCloud(); return;
  }
  C.use('downloads').then(d => { cloud.dl = d; }).catch(() => {});
  try{ cloud.db = await C.use('db'); }catch(e){ cloud.db = null; }
  if (!cloud.db){ cloud.status = '雲端：需要登入 Claude 才能同步，目前存在本機'; renderCloud(); renderTrip(); return; }
  cloud.status = '☁️ 連線雲端中…'; renderCloud(); renderTrip();
  const timer = setTimeout(() => { if (!cloud.ok){ cloud.status = '☁️ 雲端暫時連不上，資料先存在本機，連上後會自動同步'; renderCloud(); } }, 10000);
  cloud.db.collection('trips').onSnapshot(snap => {
    let changed = false;
    for (const doc of snap.docs){
      const body = doc.data(); cloud.ids.add(doc.id);
      if (body && body.trip && tripCity(body.trip) !== CITY_ID){
        const o = otherTrips.find(x => x.id === doc.id);
        if (!o){ otherTrips.push(Object.assign({}, body.trip, {id:doc.id})); changed = true; }
        else if ((body.trip.updated||0) > (o.updated||0)){ Object.assign(o, body.trip); changed = true; }
        continue;
      }
      const t = sanitizeTrip(body && body.trip);
      if (!t) continue; t.id = doc.id; cloud.ids.add(doc.id);
      const loc = trips.find(x => x.id === t.id);
      if (!loc){ trips.push(t); changed = true; }
      else if ((t.updated||0) > (loc.updated||0)){ Object.assign(loc, t); changed = true; }
    }
    for (const ch of snap.docChanges()) if (ch.type === 'removed'){ cloud.ids.delete(ch.doc.id); if (!ch.doc.metadata.hasPendingWrites){ trips = trips.filter(x => x.id !== ch.doc.id); otherTrips = otherTrips.filter(x => x.id !== ch.doc.id); changed = true; } }
    if (!snap.metadata.fromCache){
      clearTimeout(timer); cloud.ok = true;
      if (!cloud.busy.size) cloud.status = cloud.ro ? '☁️ 唯讀：可以看雲端行程，但無法修改' : '☁️ 已連線雲端，修改會自動儲存';
      if (!cloud.pushed){ cloud.pushed = true; for (const t of trips) if (!cloud.ids.has(t.id) && (t.wish.length || t.days.some(d => d.stops.length))) cloudQueue(t); for (const t of otherTrips) if (!cloud.ids.has(t.id)) cloudQueueRaw(t); }
    }
    if (changed){ saveLocal(); renderTrip(); refreshSpotMarkers(); if (!ride.active && $('#tab-trip').classList.contains('on')) viewDay(); }
    renderCloud();
  }, err => { clearTimeout(timer); cloud.status = '☁️ 雲端連線中斷，資料先存在本機'; renderCloud(); });
}
function cloudQueue(t){
  if (!cloud.db || cloud.ro) return;
  clearTimeout(cloud.timers[t.id]);
  cloud.timers[t.id] = setTimeout(() => cloudWrite(t.id), 1200);
}
function cloudQueueRaw(t){ if (t && t.id) cloudQueue(t); }
async function cloudWrite(id){
  if (cloud.busy.has(id)){ cloud.again.add(id); return; }
  const t = trips.find(x => x.id === id) || otherTrips.find(x => x.id === id); if (!t) return;
  cloud.busy.add(id); cloud.status = '☁️ 儲存中…'; renderCloud();
  try{
    await cloud.db.collection('trips').doc(id).set({name:t.name, city:tripCity(t), updated:t.updated, trip:JSON.parse(JSON.stringify(t))});
    cloud.ids.add(id); cloud.status = '☁️ 已存到雲端 ' + hhmm(new Date());
  }catch(e){
    const c = e && e.code;
    if (c === 'invalid_argument'){ cloud.ro = true; cloud.status = '☁️ 唯讀：可以看雲端行程，修改只存在這支手機'; }
    else if (c === 'quota_exceeded') cloud.status = '☁️ 雲端空間已滿，請刪除舊行程';
    else if (c === 'unavailable'){ cloud.status = '☁️ 暫時無法儲存，稍後自動重試'; setTimeout(() => cloudQueue(t), 4000 + Math.random()*3000); }
    else cloud.status = '☁️ 儲存失敗，資料仍在本機';
  }
  cloud.busy.delete(id); renderCloud();
  if (cloud.again.has(id)){ cloud.again.delete(id); cloudWrite(id); }
}
async function cloudDelete(id){
  cloud.ids.delete(id);
  if (!cloud.db || cloud.ro) return;
  try{ await cloud.db.collection('trips').doc(id).delete(); }catch(e){}
}

function initTrips(){
  const all = store.get('trips', []) || [];
  otherTrips = all.filter(x => x && tripCity(x) !== CITY_ID);
  trips = all.filter(x => x && tripCity(x) === CITY_ID).map(sanitizeTrip).filter(Boolean);
  curTripId = store.get('curTrip', null);
  const t = curTrip();
  if (t.home && !homeId){ homeId = t.home; store.set('home', homeId); }
  else if (!t.home && homeId) t.home = homeId;
  bindTrip(); renderTrip(); refreshSpotMarkers();
  initCloud(); checkHashImport();
}
