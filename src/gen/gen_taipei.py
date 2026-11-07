#!/usr/bin/env python3
"""從 repeat/northern-taiwan-metro-stations 產生台北捷運（CITY 物件）。"""
import json, math, re, collections, sys
SRC = sys.argv[1]; OUT = sys.argv[2]
feat = json.load(open(SRC))['features']

def dist(a, b):
    la = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111.0, (a[1] - b[1]) * 111.32 * math.cos(la))
def num(code):
    m = re.match(r'([A-Z]+)(\d+)([A-Za-z]?)', code); return (int(m.group(2)), m.group(3))

by = collections.defaultdict(dict)
for f in feat:
    p = f['properties']
    by[p['路線編號']][p['車站編號']] = dict(code=p['車站編號'], name=p['中文站名'], en=p['英譯站名'], lat=p['緯度'], lon=p['經度'])

stations = {}
def sid(x):
    k = 'T_' + x['name']
    if k not in stations: stations[k] = [x['name'], x['en'], x['lat'], x['lon'], x['name'] + ' ' + x['en'] + ' ' + x['code']]
    else: stations[k][4] += ' ' + x['code']
    return k

def seq_of(line, codes):
    return [by[line][c] for c in codes]

def stops_from(seq, v=34, dwell=.6):
    out = []
    for i, x in enumerate(seq):
        if i == 0: out.append([sid(x)])
        else:
            d = dist((seq[i-1]['lat'], seq[i-1]['lon']), (x['lat'], x['lon']))
            out.append([sid(x), max(1.5, round((dwell + d / v * 60) * 2) / 2)])
    return out

def main_codes(line, branch_from=None):
    cs = sorted(by[line], key=num)
    return cs

LINES = []
def add(id, name, en, color, badge, wait, codes_line, codes, tip, dirs, v=34, extra_op='台北捷運'):
    seq = seq_of(codes_line, codes)
    LINES.append(dict(id=id, name=name, en=en, op=extra_op, color=color, badge=badge, wait=wait, tip=tip, loop=False,
                      dir=dirs, stops=stops_from(seq, v)))

def rng(line, a, b, prefix=None):
    p = prefix or line
    return [f'{p}{i:02d}' for i in range(a, b + 1)]

ez = '刷悠遊卡／一卡通即可，手機 NFC 或信用卡感應也可以進站。'
add('BR', '文湖線', 'Wenhu Line', '#C48C31', 'BR', 4, 'BR', rng('BR', 1, 24),
    '高架無人駕駛中運量捷運；動物園（貓空纜車）、松山機場、內湖。' + ez, ['南港展覽館方面', '動物園方面'], v=30)
add('R', '淡水信義線', 'Tamsui-Xinyi Line', '#E3002C', 'R', 4, 'R', [c for c in rng('R', 2, 28)],
    '象山、101、中正紀念堂、台北車站、士林夜市（劍潭）、北投、淡水。' + ez, ['淡水方面', '象山方面'], v=36)
add('Rb', '新北投支線', 'Xinbeitou Branch', '#F79AA6', 'R', 8, 'R', ['R22', 'R22A'],
    '北投站轉乘，2 站就到新北投溫泉區。', ['新北投方面', '北投方面'])
add('G', '松山新店線', 'Songshan-Xindian Line', '#008659', 'G', 4, 'G', ['G01', 'G02', 'G03'] + rng('G', 4, 19),
    '西門町、北門（大稻埕）、小巨蛋、松山（饒河夜市）、公館、新店碧潭。' + ez, ['松山方面', '新店方面'], v=34)
add('Gb', '小碧潭支線', 'Xiaobitan Branch', '#7DC49C', 'G', 10, 'G', ['G03', 'G03A'],
    '七張站轉乘。', ['小碧潭方面', '七張方面'])
add('O', '中和新蘆線', 'Zhonghe-Xinlu Line', '#F8B61C', 'O', 4, 'O', rng('O', 1, 21),
    '東門（永康街）、忠孝新生（華山）、行天宮、民權西路、新莊。往蘆洲的列車在大橋頭分岔，搭車前看終點站。' + ez, ['迴龍方面', '南勢角方面'], v=34)
add('Ob', '中和新蘆線（蘆洲支線）', 'Zhonghe-Xinlu Line (Luzhou)', '#F8B61C', 'O', 6, 'O', ['O12'] + [f'O{i}' for i in range(50, 55)],
    '在大橋頭分岔往蘆洲；南勢角出發有直達的「往蘆洲」列車。', ['蘆洲方面', '大橋頭方面'], v=34)
add('BL', '板南線', 'Bannan Line', '#0070BD', 'BL', 4, 'BL', rng('BL', 1, 23),
    '台北車站、西門、龍山寺、忠孝復興（SOGO）、國父紀念館、市政府（信義區）、南港。' + ez, ['南港展覽館方面', '頂埔方面'], v=36)
add('Y', '環狀線', 'Circular Line', '#FFC800', 'Y', 6, 'Y', rng('Y', 7, 20),
    '目前只有新北段（大坪林～新北產業園區），新北產業園區可轉機場捷運。' + ez, ['新北產業園區方面', '大坪林方面'], v=34)
a_codes = sorted(by['A'], key=num)
add('A', '機場捷運（普通車）', 'Taoyuan Airport MRT (Commuter)', '#8246AF', 'A', 8, 'A', a_codes,
    '藍色普通車每站停；去機場建議搭紫色直達車。台北車站機捷站在台北車站西側（地下街 Y 區），轉乘約走 10 分鐘。', ['環北方面', '台北車站方面'], v=55, extra_op='桃園捷運')
# 直達車
exp = [('A1', 0), ('A3', 11), ('A8', 11), ('A12', 13), ('A13', 3)]
st = []
for c, m in exp:
    x = by['A'][c]
    st.append([sid(x)] if not st else [sid(x), m])
LINES.append(dict(id='AX', name='機場捷運（直達車）', en='Taoyuan Airport MRT (Express)', op='桃園捷運', color='#6A2C91', badge='A',
                  wait=8, tip='紫色直達車：台北車站→第一航廈約 35 分、第二航廈約 38 分；台北車站可預辦登機（部分航空）。',
                  loop=False, dir=['機場第二航廈方面', '台北車站方面'], stops=st))

# 步行轉乘：不同站名但距離 < 450m；機捷台北車站 ↔ 捷運台北車站已同名合併，但實際要走一段 → 額外加站內轉乘時間在提示說明
WALK = []
ids = list(stations)
for i, a in enumerate(ids):
    for b in ids[i+1:]:
        d = dist(stations[a][2:4], stations[b][2:4])
        if d < 0.45: WALK.append([a, b, max(3, round(d * 1000 / 70) + 2)])

def S(n): return 'T_' + n
SP = [
    ('台北101・信義商圈', '台北', '台北101/世貿', 25.0340, 121.5645, '4號出口', 2, 2.5, '台北101觀景台', '觀景台、百貨與信義區夜景。'),
    ('象山步道', '台北', '象山', 25.0273, 121.5767, '2號出口', 10, 1.5, '象山親山步道', '爬約 20 分鐘就能拍到 101 與台北夜景。'),
    ('中正紀念堂', '台北', '中正紀念堂', 25.0346, 121.5218, '5號出口', 3, 1, '中正紀念堂', '整點衛兵交接、自由廣場牌樓。'),
    ('西門町', '台北', '西門', 25.0421, 121.5076, '6號出口', 1, 2, '西門町', '年輕人購物街、阿宗麵線、紅樓。'),
    ('龍山寺・剝皮寮', '台北', '龍山寺', 25.0372, 121.4999, '1號出口', 2, 1, '艋舺龍山寺', '香火鼎盛的古剎，附近有剝皮寮老街與華西街夜市。'),
    ('大稻埕・迪化街', '台北', '北門', 25.0557, 121.5100, '3號出口', 10, 2, '迪化街', '南北貨老街，傍晚到大稻埕碼頭看夕陽。'),
    ('寧夏夜市', '台北', '雙連', 25.0560, 121.5155, '1號出口', 8, 1.5, '寧夏夜市', '小吃集中，蚵仔煎、雞肉飯、芋丸。'),
    ('士林夜市', '台北', '劍潭', 25.0880, 121.5241, '1號出口', 3, 2, '士林夜市', '台北最大夜市；從劍潭站下車比士林站近。'),
    ('國立故宮博物院', '台北', '士林', 25.1024, 121.5485, '1號出口（轉公車）', 15, 3, '國立故宮博物院', '從士林站轉公車（紅30、255、304 等）約 15 分。'),
    ('北投溫泉・地熱谷', '台北', '新北投', 25.1367, 121.5085, '', 8, 3, '北投地熱谷', '溫泉博物館、圖書館、泡湯。'),
    ('淡水老街・漁人碼頭', '新北', '淡水', 25.1693, 121.4400, '', 5, 3, '淡水老街', '看夕陽、吃阿給與魚丸，可搭船到漁人碼頭。'),
    ('貓空纜車', '台北', '動物園', 24.9958, 121.5759, '2號出口', 5, 3, '貓空纜車動物園站', '搭纜車上貓空喝茶；也可順遊台北市立動物園。'),
    ('台北市立動物園', '台北', '動物園', 24.9983, 121.5810, '1號出口', 3, 3, '臺北市立動物園', '貓熊館、企鵝館，園區很大要穿好走的鞋。'),
    ('饒河街夜市', '台北', '松山', 25.0510, 121.5775, '5號出口', 2, 1.5, '饒河街觀光夜市', '胡椒餅、藥燉排骨；旁邊是松山慈祐宮。'),
    ('華山1914文創園區', '台北', '忠孝新生', 25.0441, 121.5294, '1號出口', 5, 1.5, '華山1914文化創意產業園區', '老酒廠改建，常有展覽與市集。'),
    ('松山文創園區', '台北', '國父紀念館', 25.0438, 121.5606, '5號出口', 5, 1.5, '松山文創園區', '菸廠改建，誠品生活松菸、展覽。'),
    ('國父紀念館', '台北', '國父紀念館', 25.0400, 121.5602, '4號出口', 2, 1, '國父紀念館', '衛兵交接與中山公園。'),
    ('永康街', '台北', '東門', 25.0330, 121.5297, '5號出口', 2, 1.5, '永康街', '鼎泰豐本店、芒果冰、小巷咖啡。'),
    ('大安森林公園', '台北', '大安森林公園', 25.0300, 121.5357, '', 1, 1, '大安森林公園', '台北的中央公園。'),
    ('臨江街（通化）夜市', '台北', '信義安和', 25.0300, 121.5543, '4號出口', 5, 1.5, '臨江街觀光夜市', '在地人的夜市，離 101 不遠。'),
    ('台北車站・地下街', '台北', '台北車站', 25.0478, 121.5170, '', 1, 1, '台北車站', '地下街連通捷運、台鐵、高鐵、機捷。'),
    ('碧潭風景區', '新北', '新店', 24.9566, 121.5370, '', 3, 2, '碧潭風景區', '吊橋與天鵝船，傍晚河岸很舒服。'),
    ('板橋林家花園', '新北', '府中', 25.0109, 121.4593, '1號出口', 8, 1.5, '林本源園邸', '台灣最完整的傳統園林。'),
    ('桃園國際機場', '桃園', '機場第一航廈', 25.0798, 121.2342, '', 2, 2, '桃園國際機場第一航廈', '第一、二航廈各有機捷站；確認航空公司在哪個航廈。'),
]
spots = []
for n, a, st, y, x, ex, w, h, q, d in SP:
    sk = S(st)
    if sk not in stations: raise SystemExit('missing ' + st)
    spots.append({'n': n, 'h': h, 'y': y, 'x': x, 'a': a, 'st': sk, 'ex': ex, 'w': w, 'q': q, 'd': d})

HUBS = [S(n) for n in ['台北車站', '西門', '中山', '忠孝復興', '台北101/世貿', '市政府', '民權西路', '古亭', '南港展覽館', '松山機場', '淡水', '動物園', '板橋', '機場第一航廈', '新店', '北投']]
city = {'id': 'taipei', 'name': '台北', 'title': '台北捷運 3D 導航', 'sub': 'Taipei Metro · Taoyuan Airport MRT', 'lat0': 25.05, 'lon0': 121.53,
        'view': 14, 'ST': stations, 'LINES': LINES, 'WALK': WALK, 'SPOTS': spots, 'HUBS': HUBS, 'BAY': [],
        'spotAreas': ['台北', '新北', '桃園'], 'card': '悠遊卡'}
js = 'CITIES.taipei = ' + json.dumps(city, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(OUT, 'w').write(js)
print('stations', len(stations), 'lines', len(LINES), 'walk', len(WALK), 'spots', len(spots), 'bytes', len(js))
for L in LINES: print(L['id'], ' > '.join(stations[s[0]][0] for s in L['stops'])[:200])
