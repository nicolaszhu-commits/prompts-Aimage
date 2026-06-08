"""Logo 后期合成确定性逻辑的属性化测试（Property 15、Property 16）。

被测对象：tools/logo/logo_logic.py 中抽取的纯函数（不依赖 PIL/scipy/文件 I/O）。
使用成熟的属性化测试库 Hypothesis（与脚本同语言），不自行实现 PBT 框架。

运行：在 tools/logo/ 下，确保已安装 pytest + hypothesis，执行 `pytest test_logo_logic.py`。
"""
import os
import sys

import pytest
from hypothesis import given, settings, strategies as st

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from logo_logic import (
    merge_residual_logo,
    corner_distance,
    logo_size,
    logo_placement,
    X_GAP,
    Y_OVL,
    MARGIN,
    LOGO_WIDTH_RATIO,
)

RUNS = 200  # ≥100 次迭代


# =============================================================================
# Property 15: 残留 Logo 字母块合并正确
# Feature: markdown-image-prompt-pipeline, Property 15: 残留 Logo 字母块合并正确
#   对于「最贴右上角种子块 + 同一垂直带且水平间距≤阈值(X_GAP)的相邻字母块
#   + 一个 y 带明显不同的合法内容块」构成的布局，merge_residual_logo 得到的
#   合并 bbox 覆盖全部 OSL 字母块，且不包含那个 y 带不同的内容块。
# Validates: Requirements 9.5, 9.6
# =============================================================================

WIDTH = 2048  # 画布宽（贴角距离基准）


@st.composite
def osl_layout(draw):
    """构造一个可控布局：
      - 一组共享同一垂直带（y 范围相同/高度重叠充分）的「OSL」字母块，
        自右向左排布、相邻水平间距 ≤ X_GAP；最右块最贴右上角（种子）。
      - 一个 y 带明显不同（远在下方、垂直不重叠）的合法内容块（如数据标签）。
    返回 (blocks, osl_blocks, content_block)。
    """
    # 字母块的统一垂直带
    band_y0 = draw(st.integers(min_value=20, max_value=120))
    band_h = draw(st.integers(min_value=60, max_value=140))
    band_y1 = band_y0 + band_h

    n_letters = draw(st.integers(min_value=1, max_value=4))  # OSL 通常 3 块，放宽到 1–4
    letter_w = draw(st.integers(min_value=20, max_value=70))

    # 最右（种子）块尽量贴右上角：右边界靠近 WIDTH
    right_edge = draw(st.integers(min_value=WIDTH - 60, max_value=WIDTH - 5))

    osl_blocks = []
    cur_x1 = right_edge
    for _ in range(n_letters):
        x1 = cur_x1
        x0 = x1 - letter_w
        # 字母块在同一垂直带内，允许各自略微抖动但保持充分重叠
        jitter_top = draw(st.integers(min_value=0, max_value=max(band_h // 4, 1)))
        jitter_bot = draw(st.integers(min_value=0, max_value=max(band_h // 4, 1)))
        ly0 = band_y0 + jitter_top
        ly1 = band_y1 - jitter_bot
        if ly1 - ly0 < band_h * 0.7:  # 保证彼此垂直重叠充分（> Y_OVL）
            ly0, ly1 = band_y0, band_y1
        osl_blocks.append((x0, ly0, x1, ly1))
        # 下一个块在左侧，水平间距 ≤ X_GAP
        gap = draw(st.integers(min_value=0, max_value=X_GAP))
        cur_x1 = x0 - gap

    # y 带明显不同的合法内容块（远在字母带下方，垂直完全不重叠）
    content_gap = draw(st.integers(min_value=40, max_value=300))
    cy0 = band_y1 + content_gap
    cy1 = cy0 + draw(st.integers(min_value=20, max_value=120))
    # 内容块水平上可与字母带重叠或不重叠，均不应被并入（因 y 带不重叠）
    cx1 = draw(st.integers(min_value=WIDTH - 200, max_value=WIDTH - 5))
    cx0 = cx1 - draw(st.integers(min_value=60, max_value=300))
    content_block = (cx0, cy0, cx1, cy1)

    blocks = list(osl_blocks) + [content_block]
    # 打乱顺序，验证与输入顺序无关
    order = draw(st.permutations(list(range(len(blocks)))))
    shuffled = [blocks[i] for i in order]
    return shuffled, osl_blocks, content_block


@settings(max_examples=RUNS)
@given(osl_layout())
def test_property15_merge_covers_all_letters_excludes_content(data):
    blocks, osl_blocks, content_block = data
    bbox = merge_residual_logo(blocks, WIDTH)
    assert bbox is not None
    bx0, by0, bx1, by1 = bbox

    # (1) 合并 bbox 覆盖全部 OSL 字母块（每个字母块完全落在合并 bbox 内）。
    for (x0, y0, x1, y1) in osl_blocks:
        assert bx0 <= x0 and x1 <= bx1, f"字母块 x 未被覆盖: {(x0, y0, x1, y1)} 不在 {bbox}"
        assert by0 <= y0 and y1 <= by1, f"字母块 y 未被覆盖: {(x0, y0, x1, y1)} 不在 {bbox}"

    # (2) 合并 bbox 不包含那个 y 带不同的内容块（垂直方向不相交即证明未并入）。
    ccx0, ccy0, ccx1, ccy1 = content_block
    vertical_overlap = min(by1, ccy1) - max(by0, ccy0)
    assert vertical_overlap < 0, f"合并 bbox 不应触及 y 带不同的内容块: bbox={bbox} content={content_block}"


@settings(max_examples=RUNS)
@given(osl_layout())
def test_property15_seed_is_corner_nearest(data):
    """佐证：合并结果的右边界来自最贴右上角的种子块（种子选择正确）。"""
    blocks, osl_blocks, content_block = data
    bbox = merge_residual_logo(blocks, WIDTH)
    assert bbox is not None
    # 种子 = 贴角距离最小者；其右边界应等于合并 bbox 的右边界（合并只向左/上下扩展）。
    seed = min(blocks, key=lambda b: corner_distance(b, WIDTH))
    assert bbox[2] == seed[2]


def test_property15_empty_returns_none():
    """边界：空块集合返回 None。"""
    assert merge_residual_logo([], WIDTH) is None


def test_property15_far_letter_beyond_gap_not_merged():
    """边界：水平间距超过 X_GAP 的块不应被并入。"""
    seed = (1980, 60, 2020, 180)            # 贴角种子
    near = (1980 - 40 - X_GAP, 60, 1980 - 40, 180)   # 间距 = X_GAP（含边界，应并入）
    far = (200, 60, 260, 180)               # 远在左侧，间距 ≫ X_GAP（不应并入）
    bbox = merge_residual_logo([seed, near, far], WIDTH)
    assert bbox is not None
    # near 被并入：左边界应到达 near.x0
    assert bbox[0] == near[0]
    # far 未被并入：左边界不应到达 far.x0
    assert bbox[0] > far[2]


# =============================================================================
# Property 16: Logo 合成位置与尺寸确定性
# Feature: markdown-image-prompt-pipeline, Property 16: Logo 合成位置与尺寸确定性
#   对任意宽高画布，logo 宽 = round(width*0.08)，坐标 = (width-60-logoW, 60)，
#   且对相同画布尺寸结果完全一致（确定性、逐字节可复现）。
# Validates: Requirements 9.2, 9.3, 9.4, 9.9
# =============================================================================

@settings(max_examples=RUNS)
@given(
    width=st.integers(min_value=100, max_value=10000),
    height=st.integers(min_value=100, max_value=10000),
)
def test_property16_size_and_placement(width, height):
    lw = logo_size(width)
    x, y = logo_placement(width)

    # 尺寸 = round(width * 0.08)
    assert lw == round(width * LOGO_WIDTH_RATIO)
    # 坐标：距右 MARGIN（x = width - MARGIN - lw）、距顶 MARGIN（y = MARGIN）
    assert x == width - MARGIN - lw
    assert y == MARGIN
    # 高度不影响 Logo 宽度与坐标（仅由 width 决定）
    assert logo_size(width) == lw


@settings(max_examples=RUNS)
@given(width=st.integers(min_value=100, max_value=10000))
def test_property16_determinism(width):
    """同一 width 多次计算结果完全一致（确定性）。"""
    a = (logo_size(width), logo_placement(width))
    b = (logo_size(width), logo_placement(width))
    assert a == b


def test_property16_example_2048():
    """锚定示例：2048 画布 → 宽 164、坐标 (1824, 60)。"""
    assert logo_size(2048) == 164
    assert logo_placement(2048) == (1824, 60)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))
