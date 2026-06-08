"""诊断：在每张原图右上区域，用连通域区分「旧 Logo 字标」与「绿色数据标签/表头内容」。
旧 Logo = 最贴近右上极角的绿色连通块；其余绿色块属于正文内容，绝不能覆盖。
仅分析，不修改文件。"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

D = os.path.expanduser("~/Downloads")
FILES = [
    "OSL_Stablecoin_Volume_Projection_2025-2035.png",
    "OSL_Traditional_Wire_vs_Stablecoin_Table.png",
    "OSL_Wire_Card_Stablecoin_3Column_Table.png",
    "OSL_Corridor_Validation_Framework_4Stage_Flow.png",
    "OSL_Stablecoin_Corridor_Flows_World_Map.png",
    "OSL_Cash_On_Off_Ramp_Problem_Diagram.png",
    "OSL_POS_Distribution_Layer_Infographic.png",
    "OSL_Commodity_Stablecoin_Landscape_Table.png",
    "OSL_USDT_vs_USDC_Comparison_Cards.png",
    "OSL_Real_Commerce_Key_Figure_Callout.png",
]
BRAND = np.array([179, 255, 56])

for f in FILES:
    p = os.path.join(D, f)
    im = Image.open(p).convert("RGB")
    a = np.asarray(im).astype(int)
    h, w = a.shape[:2]
    # 搜索区：上半部右侧（y<360, x>1380），足够覆盖 logo 与可能的右侧标签
    sy, sx = 360, 1380
    sub = a[0:sy, sx:w]
    green = np.abs(sub - BRAND).sum(axis=2) < 95
    # 膨胀连接断笔画，再做连通域
    dil = ndimage.binary_dilation(green, iterations=6)
    lab, n = ndimage.label(dil)
    comps = []
    for i in range(1, n + 1):
        ys, xs = np.where((lab == i) & green)
        if len(xs) < 80:
            continue
        gx0, gx1 = sx + xs.min(), sx + xs.max()
        gy0, gy1 = ys.min(), ys.max()
        # 角落贴近度：右上角 (w,0) 的接近程度
        corner_d = (w - gx1) + gy0
        comps.append((corner_d, gx0, gy0, gx1, gy1, len(xs)))
    comps.sort()
    print(f"\n{f}")
    for j, (cd, x0, y0, x1, y1, px) in enumerate(comps[:5]):
        tag = "<= 最可能是 LOGO" if j == 0 else "（内容/标签）"
        print(f"   comp x[{x0}:{x1}] y[{y0}:{y1}] W={x1-x0} H={y1-y0} px={px} cornerD={cd} {tag}")
