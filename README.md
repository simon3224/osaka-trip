# 電車 3D 導航（大阪・東京・台北・台中）

手機用的電車路線規劃＋3D 乘車動畫＋多天行程小工具。

- 開啟：https://simon3224.github.io/osaka-trip/ （`#osaka`、`#tokyo`、`#taipei`、`#taichung` 可直接指定城市）
- `index.html` 是可直接部署的單一檔案；`src/` 是原始碼，`python3 src/build.py` 重新組合。
- 車站資料來源：東京 [piuccio/open-data-jp-railway-stations](https://github.com/piuccio/open-data-jp-railway-stations)（駅データ.jp）、台北 [repeat/northern-taiwan-metro-stations](https://github.com/repeat/northern-taiwan-metro-stations)、台中 [repeat/taichung-metro-stations](https://github.com/repeat/taichung-metro-stations)、台鐵 [repeat/taiwan-railway-stations](https://github.com/repeat/taiwan-railway-stations)（TDX）。
- 行車時間為依距離與班次估算，非即時時刻表。
