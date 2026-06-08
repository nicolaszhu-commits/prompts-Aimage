/**
 * 统一风格全覆盖应用属性化测试（Property 6）
 *
 * Feature: markdown-image-prompt-pipeline, Property 6: 存在 Style_Guide 时全部条目应用统一风格
 *   对于任意提示词集合，当 `styles/` 下存在 Style_Guide（styleApplied 为真）时，集合中
 *   **每一条**提示词的描述都应包含该统一风格的约束（不存在遗漏未应用风格的条目）。
 *
 * Validates: Requirements 3.6
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 6 这一条属性（一个属性 = 一个属性化测试）。
 *
 * 验证思路（全覆盖 + 非平凡）：
 *   - 核心断言：styleApplied=true 时渲染并解析，断言每条解析描述都包含
 *     UNIFIED_STYLE_MARKER（统一风格标记），无任何遗漏。
 *   - 非平凡佐证：对同一组提示词在 styleApplied=false 时渲染，断言描述中不含该标记，
 *     以证明标记是「因应用风格而被追加」而非字段本身恒含——使属性非空洞。
 *
 * 生成器约束（保证往返可靠、避免破坏 Markdown 解析与标记判定）：
 *   - 字段文本仅取「中文 + 字母数字 + 中文标点」安全字符，单行、非空、首尾无空白；
 *   - 额外排除字段文本中出现 UNIFIED_STYLE_MARKER 子串，确保「styleApplied=false
 *     时不含标记」这一非平凡断言成立。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  renderDocument,
  parsePrompts,
  UNIFIED_STYLE_MARKER,
  type ImagePrompt,
  type PromptDocument,
} from "../src/document.js";
import {
  SEGMENT_CLASSIFICATION_VALUES,
  SegmentClassification,
  type SegmentClassification as SegmentClassificationType,
} from "../src/classification.js";

/**
 * 单个「安全字符」生成器：CJK 中文 + 字母数字 + 中文标点，
 * 不含空白/换行/`#`/`-`，避免构成小节标题或分隔线，保证 render→parse 往返。
 * 不含 UNIFIED_STYLE_MARKER 的任一汉字（「统」「一」「风」「格」）以外的特殊处理，
 * 由下方 safeText 的过滤统一保证文本整体不含该标记子串。
 */
const safeChar: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0x4e00, max: 0x9fff }).map((cp) => String.fromCodePoint(cp)),
  fc.constantFrom(
    "a", "B", "c", "Z", "q", "x", "0", "1", "5", "9",
    "图", "表", "数", "据", "逻", "辑", "趋", "势", "概", "念",
    "，", "。", "、", "：", "（", "）", "《", "》",
  ),
);

/**
 * 安全文本生成器：单行、非空、首尾无空白，且不含 UNIFIED_STYLE_MARKER 子串。
 * 排除标记子串，保证 styleApplied=false 时描述不含标记（属性非平凡）。
 */
const safeText: fc.Arbitrary<string> = fc
  .array(safeChar, { minLength: 1, maxLength: 24 })
  .map((cs) => cs.join("").trim())
  .filter(
    (s) =>
      s.length > 0 &&
      s !== "---" &&
      !s.includes("\n") &&
      !s.includes(UNIFIED_STYLE_MARKER),
  );

/** 段落分类生成器：合法枚举值之一。 */
const classificationArb = fc.constantFrom(
  ...SEGMENT_CLASSIFICATION_VALUES,
) as fc.Arbitrary<SegmentClassificationType>;

/** ImagePrompt 生成器：三字段非空安全文本、合法分类、有界 order。 */
const imagePromptArb: fc.Arbitrary<ImagePrompt> = fc.record({
  segmentRef: safeText,
  imageType: safeText,
  description: safeText,
  classification: classificationArb,
  order: fc.integer({ min: 0, max: 50 }),
});

describe("Property 6: 存在 Style_Guide 时全部条目应用统一风格 (Requirements 3.6)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 6: 存在 Style_Guide 时全部条目应用统一风格
  it("styleApplied=true 时每条描述都含统一风格标记，且 styleApplied=false 时均不含（非平凡）", () => {
    fc.assert(
      fc.property(
        fc.array(imagePromptArb, { minLength: 1, maxLength: 15 }),
        (prompts) => {
          // 核心断言：应用统一风格时，全部条目描述都含统一风格标记，无遗漏。
          const appliedDoc: PromptDocument = {
            articleName: "测试文章",
            styleApplied: true,
            prompts,
          };
          const appliedParsed = parsePrompts(renderDocument(appliedDoc));
          expect(appliedParsed.length).toBe(prompts.length);
          for (const entry of appliedParsed) {
            expect(entry.description.includes(UNIFIED_STYLE_MARKER)).toBe(true);
          }

          // 非平凡佐证：未应用风格时，描述均不含统一风格标记
          //（因生成器已排除字段文本自带该标记）。
          const plainDoc: PromptDocument = {
            articleName: "测试文章",
            styleApplied: false,
            prompts,
          };
          const plainParsed = parsePrompts(renderDocument(plainDoc));
          expect(plainParsed.length).toBe(prompts.length);
          for (const entry of plainParsed) {
            expect(entry.description.includes(UNIFIED_STYLE_MARKER)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // 锚定具体示例，作为属性的可读佐证（非额外属性）。
  it("示例：应用风格后两条描述均包含统一风格标记", () => {
    const prompts: ImagePrompt[] = [
      {
        segmentRef: "引言",
        imageType: "数据可视化 — 量化对比图",
        description: "对比两年市场规模的柱状图",
        classification: SegmentClassification.DATA_RICH,
        order: 1,
      },
      {
        segmentRef: "结论",
        imageType: "概念表达 — 概念思维导图",
        description: "围绕核心论点的分支思维导图",
        classification: SegmentClassification.LOGIC,
        order: 2,
      },
    ];

    const parsed = parsePrompts(
      renderDocument({ articleName: "AI趋势", styleApplied: true, prompts }),
    );
    expect(parsed).toHaveLength(2);
    for (const entry of parsed) {
      expect(entry.description).toContain(UNIFIED_STYLE_MARKER);
    }
  });
});
