"""统一 OSL Logo 合成。

把固定的透明底 Logo 素材（assets/brand/OSL_logo.png）以统一规格叠加到一批配图的右上角，
使整批 Logo 尺寸 / 位置 / 字形绝对一致；可选地检测并覆盖模型自绘的残留旧 Logo。

目录约定（清晰的输入 / 输出分离）：
- 输入：output/branded/_nologo/   —— 放「没有 Logo 的原图」（你出图后下载、丢进这里）。
- 输出：output/branded/_logo/      —— 放「已叠加 Logo 的成品」（脚本生成，可直接使用）。
- 两个目录互不覆盖：原图永远只读留在 _nologo/，成品只写 _logo/，可随时安全重跑。

Logo 规格（确定性，来自 logo_logic.py）：
- 宽 = 画宽 8%（LOGO_WIDTH_RATIO），距顶 / 右各 60px（MARGIN）。
- 同一批次所有图使用相同素材、相对尺寸与边距（需求 9.2/9.3/9.4/9.9）。

用法：
  # 最简：处理 _nologo/ 里的全部 PNG，成品写入 _logo/
  python tools/logo/relogo.py

  # 只处理指定文件
  python tools/logo/relogo.py --files cover.png social-share.png

  # 自定义输入 / 输出目录（默认即上面的 _nologo / _logo）
  python tools/logo/relogo.py --in 其它目录 --out 另一个目录
"""
import os
import sys
import argparse
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

# 默认目录：无 Logo 原图（输入）/ 有 Logo 成品（输出）。
DEFAULT_IN_DIR = "output/branded/_nologo"
DEFAULT_OUT_DIR = "output/branded/_logo"
DEFAULT_LOGO = "assets/brand/OSL_logo.png"

BRAND = np.array([179, 255, 56])

# 残留 Logo「贴角护栏」阈值：合并块须紧贴顶边且右缘接近画右边缘，才判为残留旧 Logo。
CORNER_TOP_RATIO = 0.10    # 顶部 10% 带内
CORNER_RIGHT_RATIO = 0.06  # 右缘距画右边缘 ≤ 6%


def locate_old_logo(a):
    """定位右上极角的残留旧 Logo「OSL」bbox；无残留则返回 None。

    1) 在右上检测区（按画幅比例换算自基准 2048 下 y<360,x>1380）找绿色连通块；
    2) 用 merge_residual_logo 从最贴角的种子块合并同带相邻字母块得到完整「OSL」bbox；
    3) 贴角护栏：仅当 bbox 紧贴右上极角时才返回，否则视为合法正文内容，返回 None。
    """
    h, w = a.shape[:2]
    sy = round(h * 360 / 1152)
    sx = round(w * 1380 / 2048)
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
        comps.append((sx + int(xs.min()), int(ys.min()), sx + int(xs.max()), int(ys.max())))
    if not comps:
        return None

    bbox = merge_residual_logo(comps, w)
    # 贴角护栏（需求 9.5/9.6）：避免把画面中部的合法绿色内容误判为残留 Logo。
    x0, y0, x1, y1 = bbox
    near_top = y0 <= round(h * CORNER_TOP_RATIO)
    near_right = (w - x1) <= round(w * CORNER_RIGHT_RATIO)
    if not (near_top and near_right):
        return None
    return bbox


def cover_region(a, bbox):
    """用 bbox 紧邻的局部背景中位数覆盖该 bbox（带少量 padding）。"""
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


def composite_one(src_path, out_path, logo, clear_residual=True):
    """对单张图合成 Logo：可选清除残留旧 Logo → 叠加固定 Logo → 写出。返回报告元组。"""
    im = Image.open(src_path).convert("RGB")
    w, h = im.size
    a = np.asarray(im).copy()

    covered = None
    if clear_residual:
        bbox = locate_old_logo(a)
        if bbox:
            covered = cover_region(a, bbox)

    base = Image.fromarray(a).convert("RGBA")
    target_w = logo_size(w)
    scale = target_w / logo.width
    target_h = round(logo.height * scale)
    logo_resized = logo.resize((target_w, target_h), Image.LANCZOS)
    x, y = logo_placement(w)
    base.alpha_composite(logo_resized, (x, y))
    base.convert("RGB").save(out_path, "PNG")
    return (f"{w}x{h} -> logo {target_w}x{target_h} @({x},{y})", covered)


def resolve_files(in_dir, files):
    """确定要处理的文件名：显式给定则用之，否则取输入目录内全部 PNG（排序、跳过隐藏文件）。"""
    if files:
        return list(files)
    if not os.path.isdir(in_dir):
        return []
    return [n for n in sorted(os.listdir(in_dir))
            if n.lower().endswith(".png") and not n.startswith(".")]


def main(argv=None):
    ap = argparse.ArgumentParser(description="把无 Logo 原图叠加 OSL Logo，输出成品。")
    ap.add_argument("--in", dest="in_dir", default=DEFAULT_IN_DIR,
                    help=f"无 Logo 原图目录（默认 {DEFAULT_IN_DIR}）")
    ap.add_argument("--out", dest="out_dir", default=DEFAULT_OUT_DIR,
                    help=f"成品输出目录（默认 {DEFAULT_OUT_DIR}）")
    ap.add_argument("--files", nargs="*", default=None,
                    help="要处理的文件名（缺省=输入目录内全部 PNG）")
    ap.add_argument("--logo", default=DEFAULT_LOGO, help="Logo 素材路径")
    ap.add_argument("--no-clear-residual", action="store_true",
                    help="跳过残留旧 Logo 检测/覆盖")
    args = ap.parse_args(argv)

    in_dir = os.path.expanduser(args.in_dir)
    out_dir = os.path.expanduser(args.out_dir)

    if not os.path.isdir(in_dir):
        print(f"❌ 输入目录不存在：{in_dir}")
        print(f"   请把「没有 Logo 的原图」放进该目录后再运行。")
        return 1
    os.makedirs(out_dir, exist_ok=True)

    logo = Image.open(os.path.expanduser(args.logo)).convert("RGBA")
    files = resolve_files(in_dir, args.files)
    if not files:
        print(f"⚠️  输入目录没有可处理的 PNG：{in_dir}")
        return 0

    report = []
    for f in files:
        src = os.path.join(in_dir, f)
        out_path = os.path.join(out_dir, f)
        if not os.path.exists(src):
            report.append((f, "MISSING", None)); continue
        info, covered = composite_one(src, out_path, logo, clear_residual=not args.no_clear_residual)
        report.append((f, info, covered))

    print("Logo 规格：宽=画宽{:.0%}, 距顶/右 {}px".format(LOGO_WIDTH_RATIO, MARGIN))
    print(f"输入（无 Logo）：{in_dir}")
    print(f"输出（有 Logo）：{out_dir}")
    for f, info, covered in report:
        print(f"- {f:46} {info}")
        if covered:
            print(f"    覆盖残留Logo: x[{covered[0]}:{covered[2]}] y[{covered[1]}:{covered[3]}] fill={covered[4]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
