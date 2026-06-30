"""诊断：在每张原图右上区域，用连通域区分「旧 Logo 字标」与「绿色数据标签/表头内容」。
旧 Logo = 最贴近右上极角的绿色连通块；其余绿色块属于正文内容，绝不能覆盖。
仅分析，不修改文件。

用法：
  # 诊断某目录下全部 PNG（默认 output/branded/_nologo）
  python tools/logo/diagnose.py

  # 诊断指定目录 / 指定文件
  python tools/logo/diagnose.py --in ~/Downloads --files a.png b.png
"""
import os
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage

DEFAULT_IN_DIR = "output/branded/_nologo"
BRAND = np.array([179, 255, 56])


def resolve_files(in_dir, files):
    if files:
        return list(files)
    if not os.path.isdir(in_dir):
        return []
    return [n for n in sorted(os.listdir(in_dir))
            if n.lower().endswith(".png") and not n.startswith(".")]


def main(argv=None):
    ap = argparse.ArgumentParser(description="诊断右上区域绿色连通块，区分残留 Logo 与正文内容。")
    ap.add_argument("--in", dest="in_dir", default=DEFAULT_IN_DIR,
                    help=f"待诊断图片目录（默认 {DEFAULT_IN_DIR}）")
    ap.add_argument("--files", nargs="*", default=None, help="要诊断的文件名（缺省=目录内全部 PNG）")
    args = ap.parse_args(argv)

    in_dir = os.path.expanduser(args.in_dir)
    if not os.path.isdir(in_dir):
        ap.error(f"目录不存在：{in_dir}")
    files = resolve_files(in_dir, args.files)
    if not files:
        print(f"⚠️  目录没有可诊断的 PNG：{in_dir}")
        return

    for f in files:
        p = os.path.join(in_dir, f)
        if not os.path.exists(p):
            print(f"\n{f}\n   MISSING"); continue
        im = Image.open(p).convert("RGB")
        a = np.asarray(im).astype(int)
        h, w = a.shape[:2]
        # 搜索区按画幅比例换算（基准 2048 下 y<360, x>1380）
        sy = round(h * 360 / 1152)
        sx = round(w * 1380 / 2048)
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
            gx0, gx1 = sx + int(xs.min()), sx + int(xs.max())
            gy0, gy1 = int(ys.min()), int(ys.max())
            # 角落贴近度：右上角 (w,0) 的接近程度
            corner_d = (w - gx1) + gy0
            comps.append((corner_d, gx0, gy0, gx1, gy1, len(xs)))
        comps.sort()
        print(f"\n{f}  ({w}x{h})")
        if not comps:
            print("   右上区域未发现绿色连通块")
            continue
        for j, (cd, x0, y0, x1, y1, px) in enumerate(comps[:5]):
            tag = "<= 最可能是 LOGO" if j == 0 else "（内容/标签）"
            print(f"   comp x[{x0}:{x1}] y[{y0}:{y1}] W={x1-x0} H={y1-y0} px={px} cornerD={cd} {tag}")


if __name__ == "__main__":
    main()
