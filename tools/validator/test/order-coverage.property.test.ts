/**
 * 顺序保持与完备覆盖属性化测试（Property 8）
 *
 * Feature: markdown-image-prompt-pipeline, Property 8: 提示词按原文顺序排列且完备覆盖
 *   对于任意带有原文出现序号（order）的被提取段落集合，渲染后的 Prompt_Document 中
 *   提示词条目的排列顺序都应等于按 order 升序的顺序（与原文行文顺序一致），且条目数量
 *   等于被提取段落数量（既不遗漏也不重复）。
 *
 * Validates: Requirements 4.3
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 8 这一条属性（一个属性 = 一个属性化测试）。
 *
 * 验证思路（顺序保持 + 完备覆盖，含稳定排序）：
 *   - 为每个提示词赋予「唯一」的 segmentRef（以位置下标编码），使 segmentRef ↔ 条目
 *     可追踪、可比较。
 *   - 渲染（renderDocument 按 order 升序、稳定排序）后用 parsePrompts 解析。
 *   - 期望顺序：对入参做「与 renderDocument 一致的稳定排序」（`[...prompts].sort((a,b)
 *     => a.order - b.order)`，JS 引擎数组排序自 ES2019 起稳定），得到期望 segmentRef
 *     序列；断言解析出的 segmentRef 序列与之逐一相等。
 *   - 完备覆盖：解析条目数 == 提示词数，且解析 segmentRef 集合 == 输入 segmentRef 集合
 *     （不遗漏、不重复）。
 *   - order 取值范围刻意偏小（含大量重复），以充分检验「order 相等时保持入参相对先后」
 *     的稳定性约定。
 *
 * 生成器约束（保证往返可靠）：
 *   - segmentRef 由「位置下标 + 安全文本」构成，全局唯一且为单行非空安全字符串；
 *   - imageType/description 同为非空安全文本，避免构成标题/分隔线而破坏往返解析。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  renderDocument,
  parsePrompts,
  type ImagePrompt,
  type PromptDocument,
} from "../src/document.js";
import {
  SEGMENT_CLASSIFICATION_VALUES,
  SegmentClassification,
  type SegmentClassification as SegmentClassificationType,
} from "../src/classification.js";

/**
 * 单个「安全字符」生成器：CJK 中文 + 字母数字 + 中文标点，不含空白/换行/`#`/`-`，
 * 避免构成小节标题（`## n.`）或分隔线（`---`），保证 render→parse 严格往返。
 */
const safeChar: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0x4e00, max: 0x9fff }).map((cp) => String.fromCodePoint(cp)),
  fc.constantFrom(
    "a", "B", "c", "Z", "q", "x", "0", "1", "5", "9",
    "图", "表", "数", "据", "逻", "辑", "趋", "势", "概", "念",
    "，", "。", "、", "：", "（", "）", "《", "》",
  ),
);

/** 安全文本生成器：单行、非空、首尾无空白，可在 render→parse 中严格往返。 */
const safeText: fc.Arbitrary<string> = fc
  .array(safeChar, { minLength: 1, maxLength: 16 })
  .map((cs) => cs.join("").trim())
  .filter((s) => s.length > 0 && s !== "---" && !s.includes("\n"));

/** 段落分类生成器：合法枚举值之一。 */
const classificationArb = fc.constantFrom(
  ...SEGMENT_CLASSIFICATION_VALUES,
) as fc.Arbitrary<SegmentClassificationType>;

/**
 * 「原始字段 + order」生成器：不含 segmentRef（segmentRef 在数组层按位置下标统一
 * 赋予以保证全局唯一）。order 取值范围偏小以制造重复、检验稳定排序。
 */
const promptSeedArb = fc.record({
  imageType: safeText,
  description: safeText,
  classification: classificationArb,
  // 故意收窄取值范围，制造大量 order 重复，检验稳定排序约定。
  order: fc.integer({ min: 0, max: 5 }),
});

/**
 * 提示词集合生成器：先生成若干「种子」，再按位置下标为每条赋予唯一 segmentRef
 * （形如 `seg-{index}-{安全后缀}`），保证 segmentRef 全局唯一、可追踪比较。
 */
const promptsArb: fc.Arbitrary<ImagePrompt[]> = fc
  .array(fc.record({ seed: promptSeedArb, suffix: safeText }), {
    minLength: 1,
    maxLength: 15,
  })
  .map((items) =>
    items.map(({ seed, suffix }, index) => ({
      // 位置下标保证唯一性；suffix 增加多样性。
      segmentRef: `seg-${index}-${suffix}`,
      imageType: seed.imageType,
      description: seed.description,
      classification: seed.classification,
      order: seed.order,
    })),
  );

/**
 * 与 renderDocument 一致的稳定排序：复制后按 order 升序。
 * JS 引擎 Array.prototype.sort 自 ES2019 起为稳定排序，因此 order 相等者保持入参
 * 中的相对先后，与 renderDocument 内部 `sortByOrder` 行为一致。
 */
function stableSortByOrder(prompts: readonly ImagePrompt[]): ImagePrompt[] {
  return [...prompts].sort((a, b) => a.order - b.order);
}

describe("Property 8: 提示词按原文顺序排列且完备覆盖 (Requirements 4.3)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 8: 提示词按原文顺序排列且完备覆盖
  it("解析条目顺序等于 order 升序（稳定），且条目数==段落数、无遗漏无重复", () => {
    fc.assert(
      fc.property(promptsArb, fc.boolean(), (prompts, styleApplied) => {
        const doc: PromptDocument = {
          articleName: "测试文章",
          styleApplied,
          prompts,
        };

        const parsed = parsePrompts(renderDocument(doc));

        // 完备：条目数恰等于段落数（不遗漏、不重复）。
        expect(parsed.length).toBe(prompts.length);

        // 顺序保持：解析出的 segmentRef 序列 == 按 order 升序（稳定）的 segmentRef 序列。
        const expectedRefs = stableSortByOrder(prompts).map((p) => p.segmentRef);
        const actualRefs = parsed.map((p) => p.segmentRef);
        expect(actualRefs).toEqual(expectedRefs);

        // 完备覆盖（集合相等）：解析 segmentRef 集合 == 输入 segmentRef 集合。
        expect(new Set(actualRefs)).toEqual(
          new Set(prompts.map((p) => p.segmentRef)),
        );
        // segmentRef 全局唯一（无重复），佐证「不重复」覆盖。
        expect(new Set(actualRefs).size).toBe(actualRefs.length);

        // 顺序单调性：解析序列对应的 order 为非递减（升序）。
        const refToOrder = new Map(prompts.map((p) => [p.segmentRef, p.order]));
        const actualOrders = actualRefs.map((ref) => refToOrder.get(ref)!);
        for (let k = 1; k < actualOrders.length; k += 1) {
          expect(actualOrders[k - 1]).toBeLessThanOrEqual(actualOrders[k]);
        }
      }),
      { numRuns: 200 },
    );
  });

  // 锚定具体示例：乱序输入按 order 升序渲染，且 order 相等时保持入参先后（稳定）。
  it("示例：乱序输入按 order 升序排列，等值保持入参相对先后", () => {
    const prompts: ImagePrompt[] = [
      {
        segmentRef: "seg-A",
        imageType: "数据可视化 — 量化对比图",
        description: "A 的描述",
        classification: SegmentClassification.DATA_RICH,
        order: 2,
      },
      {
        segmentRef: "seg-B",
        imageType: "概念表达 — 概念思维导图",
        description: "B 的描述",
        classification: SegmentClassification.LOGIC,
        order: 1,
      },
      {
        segmentRef: "seg-C",
        imageType: "概念表达 — 场景插画",
        description: "C 的描述",
        classification: SegmentClassification.LOGIC,
        order: 1,
      },
    ];

    const parsed = parsePrompts(
      renderDocument({ articleName: "AI趋势", styleApplied: false, prompts }),
    );

    // order 升序；order 相等（B、C 同为 1）时保持入参先后（B 在 C 前）。
    expect(parsed.map((p) => p.segmentRef)).toEqual(["seg-B", "seg-C", "seg-A"]);
    expect(parsed).toHaveLength(3);
  });
});
