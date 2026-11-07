#!/usr/bin/env python3
"""從 open-data-jp-railway-stations 產生東京路網（CITY 物件）。"""
import json, math, re, collections, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/jpdata/stations.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data_tokyo.js'
groups = json.load(open(SRC))

BBOX = (35.24, 36.0, 139.10, 140.45)   # lat min/max, lon min/max
RENAME = {
    '羽田空港国際線ビル': '羽田空港第3ターミナル', '羽田空港国際線ターミナル': '羽田空港第3ターミナル',
    '羽田空港国内線ターミナル': '羽田空港第1・第2ターミナル',
    '羽田空港第１ビル': '羽田空港第1ターミナル', '羽田空港第２ビル': '羽田空港第2ターミナル',
}
Z2H = str.maketrans('０１２３４５６７８９', '0123456789')

def clean(n):
    n = RENAME.get(n, n)
    n = re.sub(r'[〈（(].*?[〉）)]', '', n).strip()
    return n.translate(Z2H)

def dist(a, b):
    la = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111.0, (a[1] - b[1]) * 111.32 * math.cos(la))

# ---- station-level data per ekidata line ----
byline = collections.defaultdict(list)
for g in groups:
    for st in g['stations']:
        byline[st['ekidata_line_id']].append({'gid': g['group_code'], 'name': clean(st['name_kanji']),
                                             'raw': st['name_kanji'], 'lat': st['lat'], 'lon': st['lon'],
                                             'code': int(st['ekidata_id'])})

# 線路設定：(ekidata id, 代碼, 名稱, 英文, 營運者, 顏色, 徽章, 候車, 速度km/h, 停站秒, 提示, 方向覆寫)
L = []
def line(eid, lid, name, en, op, color, badge, wait, v, dwell, tip, **kw):
    L.append(dict(eid=eid, id=lid, name=name, en=en, op=op, color=color, badge=badge, wait=wait, v=v, dwell=dwell, tip=tip, **kw))

METRO = '東京Metro'; TOEI = '都營地下鐵'; JR = 'JR東日本'
mt = '東京Metro，刷 Suica／PASMO 即可。'
tt = '都營地下鐵；和東京Metro之間轉乘有時要出站，走橘色轉乘閘門就不會多扣錢。'
line('28001', 'G', '銀座線', 'Ginza Line', METRO, '#FF9500', 'G', 3, 36, .6, '最古老的地鐵：淺草、上野、銀座、表參道、澀谷都在這條線。' + mt)
line('28002', 'M', '丸ノ内線', 'Marunouchi Line', METRO, '#F62E36', 'M', 3, 38, .6, '池袋、東京站、銀座、新宿。' + mt)
line('28003', 'H', '日比谷線', 'Hibiya Line', METRO, '#B5B5AC', 'H', 3, 36, .6, '築地、銀座、六本木、惠比壽、中目黑。' + mt)
line('28004', 'T', '東西線', 'Tozai Line', METRO, '#009BBF', 'T', 3, 42, .6, '東西向橫貫；中野、飯田橋、大手町、日本橋、門前仲町。' + mt)
line('28005', 'C', '千代田線', 'Chiyoda Line', METRO, '#00BB85', 'C', 3, 38, .6, '表參道、明治神宮前、二重橋前（皇居）、根津（谷根千）。' + mt)
line('28006', 'Y', '有楽町線', 'Yurakucho Line', METRO, '#C1A470', 'Y', 4, 40, .6, '池袋、有樂町、月島、豐洲。' + mt)
line('28008', 'Z', '半蔵門線', 'Hanzomon Line', METRO, '#8F76D6', 'Z', 3, 38, .6, '澀谷、表參道、大手町、押上（晴空塔）。' + mt)
line('28009', 'N', '南北線', 'Namboku Line', METRO, '#00AC9B', 'N', 4, 38, .6, '後樂園、四谷、六本木一丁目、目黑。' + mt)
line('28010', 'F', '副都心線', 'Fukutoshin Line', METRO, '#9C5E31', 'F', 4, 40, .6, '池袋、新宿三丁目、明治神宮前、澀谷；直通東急東橫線到橫濱。' + mt)
line('99302', 'A', '浅草線', 'Toei Asakusa Line', TOEI, '#E85298', 'A', 4, 40, .6, '淺草、押上、日本橋、新橋；部分列車直通京急到羽田、京成到成田。' + tt)
line('99303', 'I', '三田線', 'Toei Mita Line', TOEI, '#0079C2', 'I', 4, 38, .6, '日比谷、大手町、神保町、巢鴨。' + tt)
line('99304', 'S', '新宿線', 'Toei Shinjuku Line', TOEI, '#6CBB5A', 'S', 4, 40, .6, '新宿、九段下、神保町、岩本町（秋葉原附近）。' + tt)
line('99305', 'SA', '都電荒川線', 'Toden Arakawa Line', TOEI, '#EE86A7', 'SA', 6, 13, .5, '路面電車（東京櫻電），全線均一票價，慢慢晃很有味道。')
line('11302', 'JY', '山手線', 'Yamanote Line', JR, '#9ACD32', 'JY', 3, 36, .7, '環狀線；外回り（順時針）／内回り（逆時針），看月台的下一站最準。刷 Suica 即可。', loop=True)
line('11312', 'JC', '中央線快速', 'Chuo Line (Rapid)', JR, '#F15A22', 'JC', 4, 50, .8, '東京↔新宿最快約15分；往吉祥寺、三鷹（吉卜力）、高尾。')
line('11313', 'JB', '中央・総武線各停', 'Chuo-Sobu Line', JR, '#FFD400', 'JB', 4, 40, .6, '黃色車廂的各站停車，秋葉原↔新宿方便。')
line('11332', 'JK', '京浜東北線', 'Keihin-Tohoku Line', JR, '#00B2E5', 'JK', 4, 42, .7, '與山手線並行（田端～品川），白天在部分區間跑快速。')
line('11321', 'JA', '埼京線', 'Saikyo Line', JR, '#00AC9A', 'JA', 5, 55, .8, '澀谷↔新宿↔池袋的快捷線；部分列車直通臨海線到台場。')
line('11326', 'JE', '京葉線', 'Keiyo Line', JR, '#C9252F', 'JE', 6, 55, .8, '去迪士尼在舞浜下車。東京站的京葉線月台離其他月台很遠，轉乘要走 10～15 分鐘。')
line('11308', 'JO', '横須賀線', 'Yokosuka Line', JR, '#0067C0', 'JO', 6, 60, .8, '東京・品川直達橫濱、鎌倉（約1小時）。刷 Suica 即可。')
line('11301', 'JT', '東海道線', 'Tokaido Line', JR, '#F68B1E', 'JT', 6, 62, .8, '東京↔橫濱↔小田原（轉箱根）。刷 Suica 即可。', trim_to='小田原')
line('99309', 'TX', 'つくばエクスプレス', 'Tsukuba Express', '首都圏新都市鉄道', '#2E3192', 'TX', 6, 65, .8, '秋葉原出發；淺草站在國際通，離雷門約 600m。')
line('99311', 'U', 'ゆりかもめ', 'Yurikamome', '百合海鷗', '#19A4C5', 'U', 4, 28, .5, '無人駕駛，坐最前排可看彩虹大橋與海景；台場、豐洲、teamLab。')
line('99337', 'R', 'りんかい線', 'Rinkai Line', '東京臨海高速鐵道', '#00418E', 'R', 6, 45, .7, '去台場（東京テレポート）的快捷線，與埼京線直通。')
line('99310', 'MM', 'みなとみらい線', 'Minatomirai Line', '橫濱高速鐵道', '#09357F', 'MM', 5, 35, .6, '橫濱港未來、紅磚倉庫（馬車道／日本大通り）、中華街；與東急東橫線直通。')
line('27001', 'KK', '京急本線', 'Keikyu Main Line', '京急電鐵', '#E5171F', 'KK', 5, 55, .7, '品川↔橫濱；搭「快特」最快。')
line('23001', 'KS', '京成本線', 'Keisei Main Line', '京成電鐵', '#1E50A2', 'KS', 6, 55, .7, '上野↔成田機場的便宜選擇（特急約 75 分）。')
line('23006', 'KA', '京成成田Sky Access（Access特急）', 'Keisei Access Express', '京成電鐵', '#F08300', 'KA', 15, 75, .6, '不用特急券的較快選擇，上野→成田機場約 60 分。', express=True)
line('23002', 'KO', '京成押上線', 'Keisei Oshiage Line', '京成電鐵', '#1E50A2', 'KS', 6, 45, .6, '直通都營淺草線。')
line('23003', 'KN', '京成金町線', 'Keisei Kanamachi Line', '京成電鐵', '#1E50A2', 'KS', 8, 30, .6, '在京成高砂換車，柴又帝釋天在柴又站。')
line('24001', 'KO2', '京王線', 'Keio Line', '京王電鐵', '#DD0077', 'KO', 5, 55, .7, '新宿出發；搭「特急」最快。')
line('24003', 'KO3', '京王高尾線', 'Keio Takao Line', '京王電鐵', '#DD0077', 'KO', 8, 50, .7, '高尾山在終點「高尾山口」。新宿有直通特急約 50 分。')
line('24006', 'IN', '京王井の頭線', 'Keio Inokashira Line', '京王電鐵', '#8C5EBE', 'IN', 4, 38, .5, '澀谷↔下北澤↔吉祥寺，搭「急行」較快。')
line('25001', 'OH', '小田急小田原線', 'Odakyu Odawara Line', '小田急電鐵', '#2288CC', 'OH', 5, 58, .7, '新宿↔下北澤↔小田原；去箱根可在小田原轉箱根登山鐵道。')
line('25002', 'OE', '小田急江ノ島線', 'Odakyu Enoshima Line', '小田急電鐵', '#2288CC', 'OE', 8, 55, .7, '去江之島在片瀬江ノ島下車。')
line('99320', 'EN', '江ノ島電鉄（江之電）', 'Enoden', '江之島電鐵', '#1E8C4E', 'EN', 8, 18, .5, '鎌倉↔長谷（大佛）↔江之島↔藤澤，海景路線；假日很擠。')
line('26001', 'TY', '東急東横線', 'Tokyu Toyoko Line', '東急電鐵', '#DA0442', 'TY', 5, 50, .7, '澀谷↔中目黑↔自由之丘↔橫濱，直通港未來線。')
line('26003', 'DT', '東急田園都市線', 'Tokyu Den-en-toshi Line', '東急電鐵', '#20A288', 'DT', 5, 45, .7, '澀谷出發，二子玉川等住宅區；直通半藏門線。')
line('22001', 'SI', '西武池袋線', 'Seibu Ikebukuro Line', '西武鐵道', '#2B4C9C', 'SI', 6, 55, .7, '池袋出發，往秩父方向。')
line('22007', 'SS', '西武新宿線', 'Seibu Shinjuku Line', '西武鐵道', '#00A0DE', 'SS', 6, 55, .7, '西武新宿站離 JR 新宿站約 5～10 分鐘；終點本川越＝川越小江戶。')
line('21002', 'TS', '東武スカイツリーライン', 'Tobu Skytree Line', '東武鐵道', '#0F6CC3', 'TS', 6, 55, .7, '淺草↔晴空塔↔北千住；往日光的特急也從淺草出發。', trim_to='東武動物公園')
line('21001', 'TJ', '東武東上線', 'Tobu Tojo Line', '東武鐵道', '#004098', 'TJ', 6, 60, .7, '池袋↔川越（約 30 分），去小江戶最方便。', trim_to='川越市')
line('99336', 'MO', '東京モノレール', 'Tokyo Monorail', '東京單軌電車', '#1E90FF', 'MO', 5, 50, .5, '濱松町↔羽田機場約 15～20 分；搭「空港快速」最快。',
     order=['浜松町', '天王洲アイル', '大井競馬場前', '流通センター', '昭和島', '整備場', '天空橋', '羽田空港第3ターミナル', '新整備場', '羽田空港第1ターミナル', '羽田空港第2ターミナル'])
line('27002', 'KH', '京急空港線', 'Keikyu Airport Line', '京急電鐵', '#E5171F', 'KK', 5, 45, .6, '京急蒲田轉往羽田；品川有直達的「エアポート快特」。',
     order=['京急蒲田', '糀谷', '大鳥居', '穴守稲荷', '天空橋', '羽田空港第3ターミナル', '羽田空港第1・第2ターミナル'])

# 東京都營大江戶線：6 字形，拆成直線段 + 環狀段
OEDO_TAIL = ['光が丘', '練馬春日町', '豊島園', '練馬', '新江古田', '落合南長崎', '中井', '東中野', '中野坂上', '西新宿五丁目', '都庁前']
OEDO_LOOP = ['都庁前', '新宿西口', '東新宿', '若松河田', '牛込柳町', '牛込神楽坂', '飯田橋', '春日', '本郷三丁目', '上野御徒町', '新御徒町', '蔵前', '両国', '森下',
             '清澄白河', '門前仲町', '月島', '勝どき', '築地市場', '汐留', '大門', '赤羽橋', '麻布十番', '六本木', '青山一丁目', '国立競技場', '代々木', '新宿']
line('99301', 'E', '大江戸線', 'Toei Oedo Line', TOEI, '#B6007A', 'E', 4, 40, .6, '練馬・中野方向的直線段，在都廳前接環狀段。' + tt, order=OEDO_TAIL)
line('99301', 'E2', '大江戸線（環状部）', 'Toei Oedo Line (Loop)', TOEI, '#B6007A', 'E', 4, 40, .6, '環狀段：六本木、大門（東京鐵塔）、築地市場、兩國、新宿西口。' + tt, order=OEDO_LOOP, loop=True)

# 新站補充（資料較舊）
EXTRA = {
    'JY': [('高輪ゲートウェイ', 35.6355, 139.7407, '品川')],
    'JK': [('高輪ゲートウェイ', 35.6355, 139.7407, '品川')],
    'H':  [('虎ノ門ヒルズ', 35.6668, 139.7488, '神谷町')],
}

BRANCH_JUNCTION = {'M': '中野坂上'}
stations = {}     # sid -> [name, en, lat, lon, alias]
gid_members = collections.defaultdict(list)
KEYS = {}
def sid_of(key):
    if key not in KEYS: KEYS[key] = 's%d' % len(KEYS)
    return KEYS[key]

out_lines = []
def mk_stop_list(seq, cfg):
    stops = []
    for i, x in enumerate(seq):
        sid = x['sid']
        if i == 0: stops.append([sid])
        else:
            d = dist((seq[i-1]['lat'], seq[i-1]['lon']), (x['lat'], x['lon']))
            m = cfg['dwell'] + d / cfg['v'] * 60
            stops.append([sid, max(1, round(m * 2) / 2)])
    return stops

def register(x):
    sid = sid_of(x['gid'] + '|' + x['name'])
    x['sid'] = sid
    gid_members[sid].append(x)
    return x

synthetic = 0
for cfg in L:
    raw = sorted(byline[cfg['eid']], key=lambda x: x['code'])
    if not raw: print('NO DATA', cfg['eid']); continue
    if 'order' in cfg:
        pick = []
        for nm in cfg['order']:
            c = [x for x in raw if x['name'] == nm]
            if not c: print('MISSING', cfg['id'], nm); continue
            pick.append(dict(c[0]))
        raw = pick
    seq = []
    for x in raw:
        if not (BBOX[0] <= x['lat'] <= BBOX[1] and BBOX[2] <= x['lon'] <= BBOX[3]): continue
        if seq and seq[-1]['gid'] == x['gid'] and seq[-1]['name'] == x['name']: continue
        seq.append(dict(x))
        if cfg.get('trim_to') and x['name'] == cfg['trim_to']: break
    for nm, la, lo, after in EXTRA.get(cfg['id'], []):
        k = next(i for i, x in enumerate(seq) if x['name'] == after)
        # 放在 after 與其相鄰站之間（取距離較近的一側）
        synthetic += 1
        ins = {'gid': 'x%d' % synthetic, 'name': nm, 'raw': nm, 'lat': la, 'lon': lo, 'code': 0}
        nb = [j for j in (k-1, k+1) if 0 <= j < len(seq)]
        j = min(nb, key=lambda j: dist((seq[j]['lat'], seq[j]['lon']), (la, lo)))
        seq.insert(max(k, j), ins)
    for x in seq:
        x['gid'] = 'x_' + x['name'] if x['gid'].startswith('x') else x['gid']
    # 依距離切段（分支）
    segs = [[seq[0]]]
    lim = 40 if cfg.get('express') else (5.0 if cfg['v'] < 50 else 12.0)
    for x in seq[1:]:
        if dist((segs[-1][-1]['lat'], segs[-1][-1]['lon']), (x['lat'], x['lon'])) > lim: segs.append([x])
        else: segs[-1].append(x)
    if len(segs) > 1 and cfg['id'] not in BRANCH_JUNCTION:
        main = segs[0]
        for seg in segs[1:]:
            for x in seg:   # 順序錯置的車站：用最小繞路插回主線
                best = min(range(1, len(main)), key=lambda k: dist((main[k-1]['lat'], main[k-1]['lon']), (x['lat'], x['lon'])) + dist((x['lat'], x['lon']), (main[k]['lat'], main[k]['lon'])) - dist((main[k-1]['lat'], main[k-1]['lon']), (main[k]['lat'], main[k]['lon'])))
                main.insert(best, x)
        segs = [main]
    for si, seg in enumerate(segs):
        if si > 0:
            prev = [y for s2 in segs[:si] for y in s2]
            jn = BRANCH_JUNCTION.get(cfg['id'])
            j = next((y for y in prev if y['name'] == jn), None) or min(prev, key=lambda y: dist((y['lat'], y['lon']), (seg[0]['lat'], seg[0]['lon'])))
            if dist((j['lat'], j['lon']), (seg[0]['lat'], seg[0]['lon'])) < 4: seg.insert(0, dict(j))
        if len(seg) < 2: continue
        for x in seg: register(x)
        lid = cfg['id'] + ('' if si == 0 else 'b%d' % si)
        nm = cfg['name'] + ('' if si == 0 else '（支線）')
        first, last = seg[0]['name'], seg[-1]['name']
        out_lines.append({'id': lid, 'name': nm, 'en': cfg['en'], 'op': cfg['op'], 'color': cfg['color'], 'badge': cfg['badge'],
                          'wait': cfg['wait'], 'tip': cfg['tip'], 'loop': bool(cfg.get('loop')) and si == 0,
                          'dir': [last + '方面', first + '方面'] if not cfg.get('loop') else ['外回り', '内回り'],
                          'stops': mk_stop_list(seg, cfg), '_cfg': cfg})

# 合併同名且相近（<400m）的車站群組（例：羽田第3ターミナル 京急／單軌）
by_name = collections.defaultdict(list)
for sid, mem in gid_members.items():
    by_name[mem[0]['name']].append(sid)
alias = {}
for nm, sids in by_name.items():
    for a in sids:
        for b in sids:
            if a < b and a not in alias and b not in alias:
                pa = gid_members[a][0]; pb = gid_members[b][0]
                if dist((pa['lat'], pa['lon']), (pb['lat'], pb['lon'])) < 0.4: alias[b] = a
def canon(s):
    while s in alias: s = alias[s]
    return s
for Lx in out_lines:
    for st in Lx['stops']: st[0] = canon(st[0])
merged = collections.defaultdict(list)
for sid, mem in gid_members.items(): merged[canon(sid)].extend(mem)

for sid, mem in merged.items():
    names = []
    for x in mem:
        if x['name'] not in names: names.append(x['name'])
    disp = '・'.join(names[:2])
    lat = sum(x['lat'] for x in mem) / len(mem); lon = sum(x['lon'] for x in mem) / len(mem)
    al = ' '.join(sorted(set(x['raw'] for x in mem) | set(names)))
    stations[sid] = [disp, '', round(lat, 5), round(lon, 5), al]

# 快速／特急（手動）
def S(name, near=None):
    c = [sid for sid, v in stations.items() if name in v[4].split(' ') or v[0] == name]
    if not c: raise SystemExit('express station missing: ' + name)
    if near and len(c) > 1: c.sort(key=lambda s: dist((stations[s][2], stations[s][3]), near))
    return c[0]
EXP = [
    dict(id='NEX', name='成田エクスプレス（N\'EX）', en='Narita Express', op=JR, color='#B31E23', badge='NEX', wait=20,
         tip='全車指定席，需特急券；外國旅客可買 N\'EX 來回優惠票。東京站約 53 分到成田機場。',
         dir=['成田空港方面', '新宿・池袋方面'],
         seq=[('池袋', 0), ('新宿', 6), ('渋谷', 7), ('品川', 11), ('東京', 8), ('空港第2ビル', 52), ('成田空港', 3)]),
    dict(id='SL', name='京成スカイライナー', en='Keisei Skyliner', op='京成電鐵', color='#004EA2', badge='SL', wait=20,
         tip='全車指定席，需特急券；日暮里→成田機場最快約 36 分。',
         dir=['成田空港方面', '京成上野方面'],
         seq=[('京成上野', 0), ('日暮里', 2), ('空港第2ビル', 36), ('成田空港', 3)]),
    dict(id='KKX', name='京急エアポート快特', en='Keikyu Airport Limited Express', op='京急電鐵', color='#E5171F', badge='KK', wait=8,
         tip='品川→羽田機場約 15 分，刷 Suica 即可；部分列車從都營淺草線直通。',
         dir=['羽田空港方面', '品川方面'],
         seq=[('品川', 0), ('京急蒲田', 8), ('羽田空港第3ターミナル', 6), ('羽田空港第1・第2ターミナル', 2)]),
    dict(id='KKL', name='京急快特（品川〜横浜）', en='Keikyu Limited Express', op='京急電鐵', color='#E5171F', badge='KK', wait=6,
         tip='品川→橫濱約 17 分，刷 Suica 即可。',
         dir=['横浜方面', '品川方面'],
         seq=[('品川', 0), ('京急蒲田', 8), ('京急川崎', 3), ('横浜', 8)]),
    dict(id='KOX', name='京王特急（新宿〜高尾山口）', en='Keio Limited Express', op='京王電鐵', color='#DD0077', badge='KO', wait=10,
         tip='新宿→高尾山口約 50 分，刷 Suica 即可（部分需在北野或高幡不動換車）。',
         dir=['高尾山口方面', '新宿方面'],
         seq=[('新宿', 0), ('明大前', 6), ('調布', 11), ('府中', 6), ('分倍河原', 2), ('聖蹟桜ヶ丘', 4), ('高幡不動', 4), ('北野', 4), ('高尾山口', 13)]),
    dict(id='RC', name='小田急ロマンスカー', en='Odakyu Romancecar', op='小田急電鐵', color='#2288CC', badge='RC', wait=30,
         tip='浪漫特快，全車指定席需特急券；新宿→小田原約 70 分，部分列車直達箱根湯本。',
         dir=['小田原・箱根方面', '新宿方面'],
         seq=[('新宿', 0), ('町田', 30), ('小田原', 40)]),
]
for e in EXP:
    stops = []
    prev = None
    for nm, m in e['seq']:
        sid = S(nm, (stations[prev][2], stations[prev][3]) if prev else None)
        stops.append([sid] if not stops else [sid, m]); prev = sid
    out_lines.append({k: e[k] for k in ['id', 'name', 'en', 'op', 'color', 'badge', 'wait', 'tip', 'dir']} | {'loop': False, 'stops': stops})

# 步行轉乘：同一 ekidata 站群（不同站名）或距離 < 450m
WALK = []
gid_of = {sid: mem[0]['gid'] for sid, mem in merged.items()}
sids = list(stations)
for i, a in enumerate(sids):
    for b in sids[i+1:]:
        d = dist(stations[a][2:4], stations[b][2:4])
        if gid_of.get(a) == gid_of.get(b) and d < 1.2: WALK.append([a, b, max(3, round(d * 1000 / 70) + 2)])
        elif d < 0.45: WALK.append([a, b, max(3, round(d * 1000 / 70) + 2)])

used = {st[0] for Lx in out_lines for st in Lx['stops']}
stations = {k: v for k, v in stations.items() if k in used}
WALK = [w for w in WALK if w[0] in used and w[1] in used]
for Lx in out_lines: Lx.pop('_cfg', None)

# 景點
SP = [
    ('淺草寺・雷門', '東京', '浅草', 35.7125, 139.7965, '雷門出口', 5, 1.5, '浅草寺 雷門', '東京最古老寺院，仲見世通吃人形燒，晚上點燈也很美。'),
    ('東京晴空塔', '東京', '押上', 35.7101, 139.8107, 'B3出口', 3, 2, '東京スカイツリー', '634m 展望台，下方是晴空街道購物商場。'),
    ('上野公園・阿美橫丁', '東京', '上野', 35.7146, 139.7732, '公園口', 3, 2.5, 'アメ横商店街', '博物館、動物園與熱鬧的阿美橫丁市場。'),
    ('秋葉原電器街', '東京', '秋葉原', 35.6984, 139.7731, '電気街口', 2, 2.5, '秋葉原電気街', '動漫、模型、遊戲、電子零件，女僕咖啡。'),
    ('東京車站・丸之內', '東京', '東京', 35.6812, 139.7671, '丸の内口', 1, 1, '東京駅丸の内駅舎', '紅磚車站建築，地下街有拉麵街、動漫商店街。'),
    ('皇居外苑・二重橋', '東京', '二重橋前', 35.6800, 139.7570, '6號出口', 5, 1, '皇居外苑', '皇居前廣場與二重橋，晨跑勝地。'),
    ('銀座', '東京', '銀座', 35.6717, 139.7650, 'A13出口', 1, 2, '銀座四丁目交差点', '高級百貨、GINZA SIX、假日步行者天國。'),
    ('築地場外市場', '東京', '築地', 35.6655, 139.7707, '1號出口', 2, 1.5, '築地場外市場', '玉子燒、海鮮丼、生蠔，早上最熱鬧。'),
    ('豐洲市場', '東京', '市場前', 35.6455, 139.7845, '', 3, 1.5, '豊洲市場', '鮪魚拍賣參觀（需早到）與壽司大和、大和壽司。'),
    ('teamLab Planets', '東京', '新豊洲', 35.6491, 139.7898, '', 1, 2, 'チームラボプラネッツ', '赤腳走進水中的沉浸式數位藝術，需事先購票。'),
    ('台場・獨角獸鋼彈', '東京', '台場', 35.6249, 139.7756, '', 5, 2.5, 'ユニコーンガンダム立像', 'DiverCity 前的實物大鋼彈、彩虹大橋夜景。'),
    ('東京鐵塔', '東京', '赤羽橋', 35.6586, 139.7454, '赤羽橋口', 5, 1, '東京タワー', '紅白鐵塔，晚上點燈；也可從神谷町、御成門走。'),
    ('六本木之丘・森美術館', '東京', '六本木', 35.6604, 139.7292, '1C出口', 3, 2, '六本木ヒルズ', '東京City View 展望台、森美術館、大蜘蛛雕塑。'),
    ('澀谷十字路口・SHIBUYA SKY', '東京', '渋谷', 35.6595, 139.7005, 'ハチ公口', 2, 2, '渋谷スクランブル交差点', '全球最繁忙的十字路口、忠犬八公、頂樓展望台。'),
    ('原宿竹下通', '東京', '原宿', 35.6716, 139.7031, '竹下口', 1, 1.5, '竹下通り', '可麗餅、年輕潮流小店。'),
    ('明治神宮', '東京', '原宿', 35.6764, 139.6993, '表参道口', 10, 1.5, '明治神宮', '森林中的神社，大鳥居與酒樽牆。'),
    ('表參道', '東京', '表参道', 35.6652, 139.7123, 'A2出口', 1, 1.5, '表参道ヒルズ', '櫸木大道、名牌建築與咖啡店。'),
    ('新宿御苑', '東京', '新宿御苑前', 35.6852, 139.7101, '1號出口', 5, 1.5, '新宿御苑', '大型庭園，賞楓、賞櫻名所（需門票）。'),
    ('東京都廳展望室', '東京', '都庁前', 35.6896, 139.6921, 'A4出口', 1, 1, '東京都庁展望室', '免費 202m 展望台，晚上有光雕投影。'),
    ('新宿歌舞伎町・回憶橫丁', '東京', '新宿', 35.6938, 139.7034, '東口', 5, 2, '思い出横丁', '哥吉拉頭、居酒屋小巷，夜生活中心。'),
    ('池袋太陽城', '東京', '池袋', 35.7290, 139.7194, '東口', 10, 2, 'サンシャインシティ', '水族館、展望台、寶可夢中心、乙女路。'),
    ('中野百老匯', '東京', '中野', 35.7088, 139.6656, '北口', 5, 1.5, '中野ブロードウェイ', '二手動漫、模型、玩具的寶庫。'),
    ('吉祥寺・井之頭公園', '東京', '吉祥寺', 35.6996, 139.5730, '公園口', 5, 2, '井の頭恩賜公園', '湖上划船、口琴橫丁，散步到吉卜力美術館約 15 分。'),
    ('三鷹之森吉卜力美術館', '東京', '三鷹', 35.6962, 139.5704, '南口（社區巴士）', 15, 2, '三鷹の森ジブリ美術館', '需事先預約指定時段的門票。'),
    ('下北澤', '東京', '下北沢', 35.6614, 139.6680, '', 1, 2, '下北沢', '古著、唱片行、小劇場與咖啡。'),
    ('谷中銀座（谷根千）', '東京', '日暮里', 35.7276, 139.7660, '西口', 5, 1.5, '谷中銀座商店街', '下町老街，貓咪與夕陽階梯。'),
    ('柴又帝釋天', '東京', '柴又', 35.7584, 139.8770, '', 3, 1.5, '柴又帝釈天', '寅次郎的故鄉，參道老鋪吃草糰子。'),
    ('東京迪士尼樂園', '東京', '舞浜', 35.6329, 139.8804, '南口', 5, 10, '東京ディズニーランド', '建議開園前到；可用 App 抽 DPA／指定時段。'),
    ('東京迪士尼海洋', '東京', '舞浜', 35.6267, 139.8851, '南口（迪士尼度假區線）', 15, 10, '東京ディズニーシー', '從舞浜轉迪士尼度假區線到海洋站，或步行約 15 分。'),
    ('成田機場', '近郊', '成田空港', 35.7720, 140.3929, '', 3, 2, '成田国際空港', '第1航廈：成田空港站；第2、3航廈：空港第2ビル站。'),
    ('羽田機場', '東京', '羽田空港第3ターミナル', 35.5494, 139.7798, '', 2, 2, '羽田空港第3ターミナル', '國際線在第3航廈；國內線第1、2航廈。'),
    ('橫濱港未來・紅磚倉庫', '近郊', 'みなとみらい', 35.4528, 139.6425, '', 10, 3, '横浜赤レンガ倉庫', '摩天輪、杯麵博物館、紅磚倉庫與港邊夜景。'),
    ('橫濱中華街', '近郊', '元町・中華街', 35.4437, 139.6458, '', 3, 1.5, '横浜中華街', '日本最大中華街，肉包與小籠包。'),
    ('鎌倉・鶴岡八幡宮', '近郊', '鎌倉', 35.3259, 139.5565, '東口', 10, 2.5, '鶴岡八幡宮', '小町通吃喝，搭江之電去大佛與江之島。'),
    ('鎌倉大佛（高德院）', '近郊', '長谷', 35.3168, 139.5357, '', 7, 1, '高徳院 鎌倉大仏', '露天大佛，附近有長谷寺。'),
    ('江之島', '近郊', '片瀬江ノ島', 35.2993, 139.4805, '', 15, 3, '江の島', '海景、江島神社、展望燈塔；可搭江之電來回。'),
    ('川越小江戶', '近郊', '川越市', 35.9187, 139.4826, '', 15, 3, '川越 蔵造りの町並み', '藏造老街與時之鐘，菓子屋橫丁；也可從西武本川越站走。'),
    ('高尾山', '近郊', '高尾山口', 35.6325, 139.2697, '', 5, 4, '高尾山', '纜車或步道上山，秋天賞楓、天氣好可見富士山。'),
    ('箱根（小田原轉乘）', '近郊', '小田原', 35.2564, 139.1551, '', 0, 6, '箱根湯本駅', '在小田原轉箱根登山鐵道或巴士；建議買箱根周遊券。'),
]
spots = []
for n, a, st, y, x, ex, w, h, q, d in SP:
    c = [sid for sid, v in stations.items() if st in v[4].split(' ') or st == v[0] or st in v[0].split('・')]
    if not c: raise SystemExit('spot station missing: ' + st)
    nl = collections.Counter(st_[0] for Lx in out_lines for st_ in Lx['stops'])
    c.sort(key=lambda s: dist((stations[s][2], stations[s][3]), (y, x)) - 0.08 * min(nl[s], 4))
    spots.append({'n': n, 'h': h, 'y': y, 'x': x, 'a': a, 'st': c[0], 'ex': ex, 'w': w, 'q': q, 'd': d})

EN = {'東京': 'Tokyo', '新宿': 'Shinjuku', '渋谷': 'Shibuya', '池袋': 'Ikebukuro', '上野': 'Ueno', '浅草': 'Asakusa', '品川': 'Shinagawa',
      '秋葉原': 'Akihabara', '銀座': 'Ginza', '六本木': 'Roppongi', '原宿': 'Harajuku', '表参道': 'Omotesando', '押上': 'Oshiage',
      '舞浜': 'Maihama', '横浜': 'Yokohama', '鎌倉': 'Kamakura', '成田空港': 'Narita Airport', '空港第2ビル': 'Narita T2',
      '羽田空港第3ターミナル': 'Haneda T3', '羽田空港第1・第2ターミナル': 'Haneda T1/T2', '日暮里': 'Nippori', '大手町': 'Otemachi',
      '新橋': 'Shimbashi', '浜松町': 'Hamamatsucho', '中野': 'Nakano', '吉祥寺': 'Kichijoji', '三鷹': 'Mitaka', '下北沢': 'Shimokitazawa',
      '台場': 'Daiba', '豊洲': 'Toyosu', '築地': 'Tsukiji', '小田原': 'Odawara', '北千住': 'Kita-Senju', '恵比寿': 'Ebisu', '目黒': 'Meguro',
      '五反田': 'Gotanda', '有楽町': 'Yurakucho', '神田': 'Kanda', '御茶ノ水': 'Ochanomizu', '飯田橋': 'Iidabashi', '四ツ谷': 'Yotsuya',
      '代々木': 'Yoyogi', '高田馬場': 'Takadanobaba', '巣鴨': 'Sugamo', '京成上野': 'Keisei Ueno', '都庁前': 'Tochomae', '川越市': 'Kawagoeshi'}
for sid, v in stations.items():
    nm = v[0].split('・')[0]
    if nm in EN: v[1] = EN[nm]

HUBS = [S(n) for n in ['東京', '新宿', '渋谷', '池袋', '上野', '浅草', '品川', '秋葉原', '銀座', '押上', '舞浜', '横浜', '成田空港', '羽田空港第3ターミナル', '大手町', '六本木', '鎌倉', '日暮里']]
BAY = [[35.455,139.645],[35.49,139.69],[35.525,139.745],[35.53,139.80],[35.565,139.805],[35.59,139.775],[35.61,139.765],[35.608,139.80],[35.625,139.815],[35.632,139.84],[35.625,139.875],[35.622,139.89],[35.64,139.93],[35.67,139.98],[35.64,140.04],[35.59,140.10],[35.50,140.07],[35.40,139.93],[35.30,139.80],[35.25,139.75],[35.25,139.68],[35.30,139.665],[35.38,139.66],[35.42,139.66]]

city = {'id': 'tokyo', 'name': '東京', 'title': '東京電車 3D 導航', 'sub': 'Tokyo · Yokohama · Kamakura · Narita', 'lat0': 35.68, 'lon0': 139.76,
        'view': 16, 'ST': stations, 'LINES': out_lines, 'WALK': WALK, 'SPOTS': spots, 'HUBS': HUBS, 'BAY': BAY,
        'spotAreas': ['東京', '近郊'], 'card': 'Suica／PASMO'}
js = 'CITIES.tokyo = ' + json.dumps(city, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(OUT, 'w').write(js)
print('stations', len(stations), 'lines', len(out_lines), 'walk', len(WALK), 'spots', len(spots), 'bytes', len(js))
for Lx in out_lines:
    if Lx['id'].endswith(('b1', 'b2', 'b3')): print('branch', Lx['id'], [stations[s[0]][0] for s in Lx['stops']])
