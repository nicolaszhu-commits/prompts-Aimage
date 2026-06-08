/**
 * 提示词条目结构完整性属性化测试（Property 5）
 *
 * Feature: markdown-image-prompt-pipeline, Property 5: 提示词条目结构完整（三字段齐全）
 *   对于任意生成并渲染到 Prompt_Document 中的提示词集合，每一条目都应可解析出三项
 *   内容——对应段落/小标题（segmentRef）、图片类型（imageType）、画面/图表描述
 *   （description），且三项均为非空。
 *
 * Validates: Requirements 3.3, 4.4, 5.4
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 5 这一条属性（一个属性 = 一个属性化测试）。
 *
 * 验证思路（render → parse 往返三字段完整性）：
 *   随机生成 ImagePrompt 集合（styleApplied 取任意布尔值），用 renderDocument 渲染为
 *   Markdown，再用 parsePrompts 反向解析；断言「解析条目数 == 提示词数」（完备）且
 *   每个解析条目的三字段均非空（结构完整）。
 *
 * 生成器约束（保证往返可靠、避免破坏 Markdown 解析）：
 *   - 字段文本仅取「中文 + 字母数字 + 中文标点」等安全字符，单行、非空、首尾无空白，
 *     从而不会产生形如 `## n.` 的小节标题行、`---` 分隔线或字段标签行，
 *     使 render→parse 严格往返。
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
 * 单个「安全字符」生成器：刻意覆盖输入空间的关键子集，同时排除会破坏
 * render→parse 往返的字符——
 * - CJK 中文字符（U+4E00–U+9FFF），覆盖「含中文」要求；
 * - ASCII 字母与数字；
 * - 常见中文标点；
 * 不包含空白、换行、`#`、`-` 等，因此拼接结果不会出现前导/尾随空白，
 * 也不会构成小节标题（`## n.`）或分隔线（`---`），保证字段值能严格往返。
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
 * 安全文本生成器：由 1..24 个安全字符拼接而成的单行、非空文本。
 * 由于 `safeChar` 不含空白/换行，`trim()` 为恒等操作；过滤为防御性兜底，
 * 确保结果非空、非 `---`、不含换行，可在 render→parse 中严格往返。
 */
const safeText: fc.Arbitrary<string> = fc
  .array(safeChar, { minLength: 1, maxLength: 24 })
  .map((cs) => cs.join("").trim())
  .filter((s) => s.length > 0 && s !== "---" && !s.includes("\n"));

/** 段落分类生成器：合法枚举值之一。 */
const classificationArb = fc.constantFrom(
  ...SEGMENT_CLASSIFICATION_VALUES,
) as fc.Arbitrary<SegmentClassificationType>;

/**
 * ImagePrompt 生成器：三个对外字段（segmentRef/imageType/description）均为
 * 非空安全文本，classification 为合法枚举值，order 为有界整数。
 */
const imagePromptArb: fc.Arbitrary<ImagePrompt> = fc.record({
  segmentRef: safeText,
  imageType: safeText,
  description: safeText,
  classification: classificationArb,
  order: fc.integer({ min: 0, max: 50 }),
});

describe("Property 5: 提示词条目结构完整（三字段齐全） (Requirements 3.3, 4.4, 5.4)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 5: 提示词条目结构完整（三字段齐全）
  it("渲染后每条目均可解析出三个非空字段，且解析条目数与提示词数一致", () => {
    fc.assert(
      fc.property(
        // 含「空集合」边界（minLength: 0），覆盖无可提取段落的退化情形。
        fc.array(imagePromptArb, { minLength: 0, maxLength: 15 }),
        fc.boolean(),
        (prompts, styleApplied) => {
          const doc: PromptDocument = {
            articleName: "测试文章",
            styleApplied,
            prompts,
          };

          const markdown = renderDocument(doc);
          const parsed = parsePrompts(markdown);

          // 完备：解析出的条目数恰等于输入提示词数（不遗漏、不重复）。
          expect(parsed.length).toBe(prompts.length);

          // 结构完整：每条目三字段均非空。
          for (const entry of parsed) {
            expect(entry.segmentRef.length).toBeGreaterThan(0);
            expect(entry.imageType.length).toBeGreaterThan(0);
            expect(entry.description.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // 锚定具体示例，作为属性的可读佐证（非额外属性）。
  it("示例：两条提示词渲染后解析出齐全的三字段", () => {
    const doc: PromptDocument = {
      articleName: "AI趋势",
      styleApplied: false,
      prompts: [
        {
          segmentRef: "引言",
          imageType: "数据可视化 — 量化对比图",
          description: "对比 2023 与 2024 年的市场规模柱状图",
          classification: SegmentClassification.DATA_RICH,
          order: 1,
        },
        {
          segmentRef: "结论",
          imageType: "概念表达 — 概念思维导图",
          description: "围绕核心论点展开的分支思维导图",
          classification: SegmentClassification.LOGIC,
          order: 2,
        },
      ],
    };

    const parsed = parsePrompts(renderDocument(doc));
    expect(parsed).toEqual([
      {
        segmentRef: "引言",
        imageType: "数据可视化 — 量化对比图",
        description: "对比 2023 与 2024 年的市场规模柱状图",
      },
      {
        segmentRef: "结论",
        imageType: "概念表达 — 概念思维导图",
        description: "围绕核心论点展开的分支思维导图",
      },
    ]);
  });
});
