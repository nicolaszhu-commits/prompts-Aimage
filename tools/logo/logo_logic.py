"""Logo 后期合成的确定性纯逻辑（不依赖 PIL / scipy / 文件 I/O）。

把 relogo.py 中两处确定性逻辑抽取为可独立测试的纯函数，供脚本与属性化测试共用：
  1) merge_residual_logo(blocks, width)：残留旧 Logo 的字母块合并 bbox 选择
     —— 从最贴右上极角的种子块出发，迭代合并「垂直带重叠 + 水平间距很小」的相邻
     字母块得到完整「OSL」bbox；y 带明显不同的合法内容块不会被并入（Property 15，需求 9.5/9.6）。
  2) logo_size(width) / logo_placement(width)：Logo 尺寸与放置坐标计算
     —— 宽 = round(width * 0.08)，坐标 (width - 60 - logoW, 60)（Property 16，需求 9.2/9.3/9.4/9.9）。

设计来源：design.md「Logo 合成参数模型（Logo_Compositing，需求 9）」。
"""
from __future__ import annotations

# ---- 合成参数（与 relogo.py 保持一致；design.md 关键参数表）-----------------
LOGO_WIDTH_RATIO = 0.08   # Logo 宽度占画宽比例（需求 9.2）
MARGIN = 60               # 距顶/右外边距，像素（需求 9.3）

# ---- 残留字母块合并护栏（与 relogo.py 保持一致）-----------------------------
X_GAP = 90        # 字母块合并允许的最大水平间距（letter spacing）
Y_OVL = 0.5       # 合并要求的最小垂直重叠比例（相对种子高度）
MAX_W = 420       # 合并 bbox 最大宽度护栏，防止误并远处内容


# 一个连通块的 bbox 表示为四元组 (x0, y0, x1, y1)。
Block = "tuple[int, int, int, int]"


def corner_distance(block, width: int) -> int:
    """块到右上极角的「贴角距离」：越小越贴右上角。

    与 relogo.py 中 `corner_d = (w - x1) + y0` 一致。
    """
    x0, y0, x1, y1 = block
    return (width - x1) + y0


def merge_residual_logo(blocks, width: int):
    """从最贴右上角的种子块出发，合并属于同一「OSL」字标的相邻字母块。

    合并规则（与 relogo.py.locate_old_logo 的合并段一致）：
      - 种子 = corner_distance 最小的块；
      - 迭代并入满足以下全部条件的块：
          * 垂直重叠 ≥ Y_OVL × 当前 bbox 高度；
          * 水平间距 ≤ X_GAP；
          * 合并后 bbox 宽度 ≤ MAX_W；
      - 直到没有新块可并入为止。

    参数：
      blocks：连通块 bbox 列表，每个为 (x0, y0, x1, y1)。
      width：画布宽度（用于贴角距离计算）。
    返回：
      合并后的紧致 bbox (x0, y0, x1, y1)；blocks 为空时返回 None。

    纯函数：不修改入参、无副作用、无 I/O。
    """
    if not blocks:
        return None

    blocks = [tuple(b) for b in blocks]
    # 种子 = 贴角距离最小者；以索引锁定，避免相等 bbox 的歧义。
    seed_idx = min(range(len(blocks)), key=lambda i: corner_distance(blocks[i], width))
    bx0, by0, bx1, by1 = blocks[seed_idx]
    used_positions = {seed_idx}

    changed = True
    while changed:
        changed = False
        bh = max(by1 - by0, 1)
        for i, c in enumerate(blocks):
            if i in used_positions:
                continue
            cx0, cy0, cx1, cy1 = c
            # 垂直重叠
            ov = min(by1, cy1) - max(by0, cy0)
            if ov < Y_OVL * bh:
                continue
            # 水平间距（块在当前 bbox 左侧、右侧或与之相接）
            if cx1 < bx0:
                gap = bx0 - cx1
            elif cx0 > bx1:
                gap = cx0 - bx1
            else:
                gap = 0
            if gap > X_GAP:
                continue
            # 合并后宽度护栏
            nbx0, nbx1 = min(bx0, cx0), max(bx1, cx1)
            if nbx1 - nbx0 > MAX_W:
                continue
            bx0, by0 = nbx0, min(by0, cy0)
            bx1, by1 = nbx1, max(by1, cy1)
            used_positions.add(i)
            changed = True

    return (bx0, by0, bx1, by1)


def logo_size(width: int):
    """Logo 缩放后尺寸宽度 = round(width * LOGO_WIDTH_RATIO)（需求 9.2）。

    返回缩放后的 Logo 宽度（像素，整数）。
    """
    return round(width * LOGO_WIDTH_RATIO)


def logo_placement(width: int):
    """Logo 放置坐标 (x, y)：距右 MARGIN、距顶 MARGIN（需求 9.3）。

    x = width - MARGIN - logo_size(width)；y = MARGIN。
    对相同 width 恒得相同结果（确定性，需求 9.4/9.9）。
    """
    lw = logo_size(width)
    return (width - MARGIN - lw, MARGIN)
