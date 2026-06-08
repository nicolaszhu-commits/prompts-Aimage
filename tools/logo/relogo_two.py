"""对 output/branded/ 下用户新增的两张图就地应用标准 OSL Logo。

复用同一确定性逻辑（logo_logic.merge_residual_logo / logo_size / logo_placement）
与同一素材（assets/brand/OSL_logo.png）：覆盖右上角残留旧 Logo，再叠加标准 Logo
（宽=画宽 8%、距顶/右 60px），保证与其它成品逐字节一致。原文件就地覆盖写回。
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from logo_logic import merge_residual_logo, logo_size, logo_placement

BR = "output/branded"
LOGO = "assets/brand/OSL_logo.png"
BRAND = np.array([179, 255, 56])

TARGETS = [
    "OSL_POS_Distribution_Layer_Infographic_Text_Corrected.png",
    "OSL_Stablecoin_Corridor_Flows_World_Map_Corrected.png",
]

logo = Image.open(LOGO).convert("RGBA")


def locate_old_logo(a):
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
        comps.append((sx + int(xs.min()), int(ys.min()),
                      sx + int(xs.max()), int(ys.max())))
    if not comps:
        return None
    return merge_residual_logo(comps, w)


def cover_region(a, bbox):
    h, w = a.shape[:2]
    x0, y0, x1, y1 = bbox
    pad = 16
    x0 = max(x0 - pad, 0); y0 = max(y0 - pad, 0)
    x1 = min(x1 + pad + 1, w); y1 = min(y1 + pad + 1, h)
    below = a[min(y1 + 4, h - 1):min(y1 + 26, h), x0:x1]
    samp = below if below.size else a[0:6, w - 60:w]
    fill = np.median(samp.reshape(-1, 3), axis=0).round().astype(np.uint8)
    a[y0:y1, x0:x1] = fill
    return (x0, y0, x1, y1, fill.tolist())


for f in TARGETS:
    p = os.path.join(BR, f)
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
    base.convert("RGB").save(p, "PNG")

    print(f"- {f}")
    print(f"    标准 Logo {target_w}x{target_h} @({x},{y})")
    if covered:
        print(f"    覆盖旧Logo: x[{covered[0]}:{covered[2]}] y[{covered[1]}:{covered[3]}] fill={covered[4]}")
print("完成（就地写回 output/branded/）")
