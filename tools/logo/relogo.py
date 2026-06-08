"""统一 OSL Logo（修正版）：从未污染的原图重新处理。

修正要点（针对上一版误伤内容的问题）：
- 上一版把右上角「绿色数据标签/表头」误判为旧 Logo 并一起用背景矩形盖掉 → 遮挡内容。
- 本版用连通域只锁定「最贴右上极角」的那个绿色块（= 旧模型自绘 Logo），
  仅覆盖该块的紧致 bbox，绝不触碰其它绿色内容（标签、绿列、绿框等）。
- 覆盖填充色取该 bbox 紧邻区域的局部背景中位数。

Logo 规格（按用户最新要求）：
- 宽 = 画宽 8%（= 原 10% 的 80%），约 164px@2048
- 距顶 / 右各 60px
- 位置固定一致（同一素材 + 同一规则）。

输入：~/Downloads 原图（只读）；输出：output/branded/（覆盖旧产物，从原图重做）。
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

# 复用抽取出的确定性纯逻辑（字母块合并、Logo 尺寸/坐标计算），与属性化测试共享同一实现。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from logo_logic import (  # noqa: E402
    merge_residual_logo,
    logo_size,
    logo_placement,
    LOGO_WIDTH_RATIO,
    MARGIN,
)

D = os.path.expanduser("~/Downloads")
LOGO = "assets/brand/OSL_logo.png"
OUT_DIR = "output/branded"
os.makedirs(OUT_DIR, exist_ok=True)

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

logo = Image.open(LOGO).convert("RGBA")


def locate_old_logo(a):
    """定位完整的旧 Logo「OSL」bbox。

    旧 Logo 的 O/S/L 字母在像素上常是分离连通块；只覆盖最贴角的一个会漏掉其余字母
    （表现为「OS」残留并与新 Logo 重叠）。本函数：
      1) 在右上区域(y<360, x>1380)找出所有绿色连通块；
      2) 调用共享纯逻辑 merge_residual_logo（种子贴角 + 合并同带相邻字母块），
         从而把整组 OSL 合并；y 带不同的正文标签（如 $1.5Q）不会被并入；
      3) 返回合并后的紧致 bbox。返回 None 表示未发现。
    """
    h, w = a.shape[:2]
    sy, sx = 360, 1380
    sub = a[0:sy, sx:w].astype(int)
    green = np.abs(sub - BRAND).sum(axis=2) < 95
    if green.sum() == 0:
        return None
    dil = ndimage.binary_dilation(green, iterations=6)
    lab, n = ndimage.label(dil)

    comps = []
    for i in range(1, n + 1):
        ys, xs = np.where((lab == i) & green)
        if len(xs) < 80:
            continue
        gx0, gx1 = sx + int(xs.min()), sx + int(xs.max())
        gy0, gy1 = int(ys.min()), int(ys.max())
        comps.append((gx0, gy0, gx1, gy1))
    if not comps:
        return None

    # 字母块合并的确定性逻辑下沉到 logo_logic.merge_residual_logo（与 Property 15 测试共享）。
    return merge_residual_logo(comps, w)


def cover_region(a, bbox):
    """用 bbox 紧邻的局部背景中位数覆盖该 bbox（带少量 padding）。"""
    h, w = a.shape[:2]
    x0, y0, x1, y1 = bbox
    pad = 16
    x0 = max(x0 - pad, 0); y0 = max(y0 - pad, 0)
    x1 = min(x1 + pad + 1, w); y1 = min(y1 + pad + 1, h)
    # 背景采样：优先取 bbox 下方窄带；不足则取最右上极角条带
    below = a[min(y1 + 4, h - 1):min(y1 + 26, h), x0:x1]
    samp = below if below.size else a[0:6, w - 60:w]
    fill = np.median(samp.reshape(-1, 3), axis=0).round().astype(np.uint8)
    a[y0:y1, x0:x1] = fill
    return (x0, y0, x1, y1, fill.tolist())


report = []
for f in FILES:
    p = os.path.join(D, f)
    if not os.path.exists(p):
        report.append((f, "MISSING", None)); continue
    im = Image.open(p).convert("RGB")
    w, h = im.size
    a = np.asarray(im).copy()

    bbox = locate_old_logo(a)
    covered = cover_region(a, bbox) if bbox else None

    base = Image.fromarray(a).convert("RGBA")
    target_w = logo_size(w)
    scale = target_w / logo.width
    target_h = round(logo.height * scale)
    logo_resized = logo.resize((target_w, target_h), Image.LANCZOS)
    x, y = logo_placement(w)
    base.alpha_composite(logo_resized, (x, y))

    out_path = os.path.join(OUT_DIR, f)
    base.convert("RGB").save(out_path, "PNG")
    report.append((f, f"logo {target_w}x{target_h} @({x},{y})", covered))

print("Logo 规格：宽=画宽8% 约 {}px@2048, 距顶/右 {}px".format(round(2048 * LOGO_WIDTH_RATIO), MARGIN))
for f, info, covered in report:
    print(f"- {f[:46]:48} {info}")
    if covered:
        print(f"    覆盖旧Logo: x[{covered[0]}:{covered[2]}] y[{covered[1]}:{covered[3]}] fill={covered[4]}")
print("输出目录:", OUT_DIR)
