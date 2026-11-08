#!/usr/bin/env python3
"""台中捷運綠線（repeat/taichung-metro-stations）＋台鐵山線（repeat/taiwan-railway-stations，補新站）"""
import json, math, csv, sys
MRT, TRA, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

def dist(a, b):
    la = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111.0, (a[1] - b[1]) * 111.32 * math.cos(la))

stations = {}
def sid(name, en, lat, lon, alias=''):
    k = 'C_' + name
    if k not in stations: stations[k] = [name, en, lat, lon, (name + ' ' + en + ' ' + alias).strip()]
    else: stations[k][4] += ' ' + alias
    return k

def stops(seq, v, dwell):
    out = []
    for i, (k, la, lo) in enumerate(seq):
        if i == 0: out.append([k])
        else:
            d = dist(seq[i-1][1:], (la, lo)); out.append([k, max(1.5, round((dwell + d / v * 60) * 2) / 2)])
    return out

# 綠線
g = json.load(open(MRT))['features']
g.sort(key=lambda f: (f['properties']['車站編號'] != '103a', f['properties']['車站編號']))
gseq = []
for f in g:
    p = f['properties']; nm = p['中文站名'].replace('臺', '台') if p['中文站名'] == '高鐵臺中站' else p['中文站名']
    gseq.append((sid(nm, p['英譯站名'], p['緯度'], p['經度'], p['車站編號'] + ' 綠線'), p['緯度'], p['經度']))

# 台鐵山線（資料較舊，補 2018 年後新站）
rows = {r['NAME'].replace('站', ''): r for r in csv.DictReader(open(TRA))}
EXTRA = {'栗林': (24.2333, 120.7146, 'Lilin'), '頭家厝': (24.1925, 120.7045, 'Toujiacuo'), '松竹': (24.1790, 120.7023, 'Songzhu'),
         '精武': (24.1495, 120.6935, 'Jingwu'), '五權': (24.1265, 120.6672, 'Wuquan')}
EN = {'后里': 'Houli', '豐原': 'Fengyuan', '潭子': 'Tanzi', '太原': 'Taiyuan', '臺中': 'Taichung', '大慶': 'Daqing', '烏日': 'Wuri',
      '新烏日': 'Xinwuri', '成功': 'Chenggong', '彰化': 'Changhua'}
SHAN = ['后里', '豐原', '栗林', '潭子', '頭家厝', '松竹', '太原', '精武', '臺中', '五權', '大慶', '烏日', '新烏日', '成功', '彰化']
tseq = []
for nm in SHAN:
    if nm in EXTRA: la, lo, en = EXTRA[nm]
    else: r = rows[nm]; la, lo, en = float(r['LAT']), float(r['LNG']), EN[nm]
    disp = '台中' if nm == '臺中' else nm
    tseq.append((sid(disp, en, la, lo, nm + ' 台鐵 火車站'), la, lo))

LINES = [
  dict(id='G', name='台中捷運綠線', en='Taichung MRT Green Line', op='台中捷運', color='#7CC242', badge='G', wait=6, loop=False,
       tip='全線高架、無人駕駛；北屯總站到高鐵台中站約 30 分鐘。刷悠遊卡／一卡通即可。松竹、大慶站可轉台鐵，高鐵台中站連通高鐵與台鐵新烏日站。',
       dir=['高鐵台中站方面', '北屯總站方面'], stops=stops(gseq, 46, .5)),
  dict(id='TRA', name='台鐵山線（區間車）', en='TRA Western Line (Mountain)', op='台灣鐵路', color='#2A4C9C', badge='台鐵', wait=10, loop=False,
       tip='區間車每站停，約 10～20 分一班，刷悠遊卡／一卡通即可。台中車站、宮原眼科、台中公園都在這條線上，捷運沒到。',
       dir=['彰化方面', '豐原・后里方面'], stops=stops(tseq, 52, .8)),
]
WALK = []
ids = list(stations)
for i, a in enumerate(ids):
    for b in ids[i+1:]:
        d = dist(stations[a][2:4], stations[b][2:4])
        if d < 0.45: WALK.append([a, b, max(3, round(d * 1000 / 70) + 2)])

def S(n): return 'C_' + n
SP = [
  ('宮原眼科', '台中', '台中', 24.1376, 120.6838, '', 3, 1, '宮原眼科', '日治時期眼科診所改建的甜點店，冰淇淋與鳳梨酥很有名。'),
  ('綠空鐵道・台中驛', '台中', '台中', 24.1380, 120.6866, '', 2, 1.5, '綠空鐵道1908', '舊台中車站紅磚站房與高架舊鐵道改建的空中步道。'),
  ('台中公園（湖心亭）', '台中', '台中', 24.1443, 120.6852, '', 12, 1, '臺中公園', '百年公園，湖心亭雙亭倒影、划船。'),
  ('第二市場', '台中', '台中', 24.1431, 120.6775, '', 15, 1, '臺中第二市場', '六角樓老市場，早餐與小吃（菜頭粿、麻薏湯）。'),
  ('一中街', '台中', '精武', 24.1490, 120.6851, '', 10, 1.5, '一中商圈', '學生商圈，炸物、珍珠奶茶與平價服飾。'),
  ('台中國家歌劇院', '台中', '市政府', 24.1630, 120.6403, '', 12, 1.5, '臺中國家歌劇院', '伊東豐雄設計的曲牆建築，屋頂空中花園免費參觀。'),
  ('秋紅谷景觀生態公園', '台中', '市政府', 24.1673, 120.6413, '', 15, 1, '秋紅谷景觀生態公園', '下凹式城市綠地，晚上看七期高樓夜景。'),
  ('新光三越・大遠百', '台中', '市政府', 24.1650, 120.6440, '', 12, 2, '新光三越台中中港店', '七期百貨商圈，週末人潮多。'),
  ('逢甲夜市', '台中', '文華高中', 24.1789, 120.6460, '（轉公車／計程車）', 25, 2.5, '逢甲夜市', '台灣最大夜市之一；捷運沒直達，可從文華高中站轉公車或 YouBike。'),
  ('文心森林公園', '台中', '文心森林公園', 24.1440, 120.6470, '', 2, 1, '文心森林公園', '圓滿戶外劇場常有演唱會。'),
  ('豐樂雕塑公園', '台中', '豐樂公園', 24.1335, 120.6466, '', 3, 1, '豐樂雕塑公園', '大草皮與戶外雕塑，散步野餐。'),
  ('水安宮', '台中', '水安宮', 24.1534, 120.6470, '', 3, .5, '南屯水安宮', '南屯在地信仰中心，站名由此而來。'),
  ('豐原廟東夜市', '近郊', '豐原', 24.2537, 120.7240, '', 5, 1.5, '廟東夜市', '慈濟宮旁的老字號小吃街：排骨酥麵、清水排骨麵、肉丸。'),
  ('彰化八卦山大佛', '近郊', '彰化', 24.0784, 120.5490, '（轉公車）', 25, 1.5, '八卦山大佛風景區', '黑色大佛與天空步道，從彰化車站轉公車或步行上山。'),
  ('高鐵台中站', '台中', '高鐵台中站', 24.1121, 120.6157, '', 2, .5, '高鐵台中站', '高鐵、台鐵新烏日站、捷運綠線三鐵共構。'),
]
spots = []
for n, a, st, y, x, ex, w, h, q, d in SP:
    if S(st) not in stations: raise SystemExit('missing ' + st)
    spots.append({'n': n, 'h': h, 'y': y, 'x': x, 'a': a, 'st': S(st), 'ex': ex, 'w': w, 'q': q, 'd': d})
HUBS = [S(n) for n in ['台中', '高鐵台中站', '市政府', '松竹', '大慶', '豐原', '彰化', '北屯總站', '文心森林公園']]
city = {'id': 'taichung', 'name': '台中', 'title': '台中捷運 3D 導航', 'sub': 'Taichung MRT · TRA', 'lat0': 24.15, 'lon0': 120.665,
        'view': 9, 'ST': stations, 'LINES': LINES, 'WALK': WALK, 'SPOTS': spots, 'HUBS': HUBS, 'BAY': [],
        'spotAreas': ['台中', '近郊'], 'card': '悠遊卡'}
open(OUT, 'w').write('CITIES.taichung = ' + json.dumps(city, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('stations', len(stations), 'walk', WALK)
for L in LINES: print(L['id'], ' > '.join(stations[s[0]][0] + (f"({s[1]})" if len(s) > 1 else '') for s in L['stops']))
