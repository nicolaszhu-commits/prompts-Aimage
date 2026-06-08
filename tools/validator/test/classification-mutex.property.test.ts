/**
 * 段落分类互斥且完备属性化测试（Property 3）
 *
 * Feature: markdown-image-prompt-pipeline, Property 3: 段落分类互斥且完备
 *   对于任意被处理的段落集合，分类结果都应满足：每个段落恰好被赋予一个分类值，
 *   且该值必属于 `{DATA_RICH, LOGIC}`（互斥且穷尽，不存在未分类或多重分类的段落）。
 *
 * Validates: Requirements 2.5, 2.6
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 3 这一条属性（一个属性 = 一个属性化测试）。
 *
 * 验证思路：
 *   不变量「每段恰好一个枚举内分类」由 `validateClassifications` /
 *   `isSegmentClassifiedExactlyOnce` 判定。属性测试随机生成段落的分类标签列表，
 *   既覆盖「合法」情形（恰好一个枚举成员），也覆盖各类「违例」情形：
 *     - 空列表（未分类）；
 *     - 两个及以上标签（多重分类）；
 *     - 含非枚举字符串（非法分类值）。
 *   断言：`validateClassifications` 返回 true **当且仅当** 每个段落都恰好被赋予
 *   一个合法枚举分类。从而证明「互斥 + 完备」不变量检测的正确性（既不漏报也不误报）。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  SEGMENT_CLASSIFICATION_VALUES,
  isSegmentClassification,
  isSegmentClassifiedExactlyOnce,
  validateClassifications,
  type RawSegmentClassification,
} from "../src/classification.js";

/** 合法枚举分类值生成器（恰好取 `DATA_RICH` / `LOGIC` 之一）。 */
const enumValue: fc.Arbitrary<string> = fc.constantFrom(
  ...SEGMENT_CLASSIFICATION_VALUES,
);

/**
 * 「非枚举字符串」生成器：制造既不是 `DATA_RICH` 也不是 `LOGIC` 的字符串，
 * 用于构造「非法分类值」违例。过滤掉恰好等于枚举成员的样本，避免误判为合法。
 * 同时刻意纳入若干近似/边界值（大小写差异、首尾空格、空串等）。
 */
const nonEnumValue: fc.Arbitrary<string> = fc
  .oneof(
    fc.string(),
    fc.constantFrom(
      "",
      "data_rich",
      "logic",
      "Data_Rich",
      " DATA_RICH",
      "DATA_RICH ",
      "UNKNOWN",
      "OTHER",
      "数据",
    ),
  )
  .filter((s) => !isSegmentClassification(s));

/**
 * 「合法段落」生成器：分类标签列表恰好含一个枚举成员
 * （满足「互斥且完备」不变量）。
 */
const validSegment: fc.Arbitrary<RawSegmentClassification> = fc.record({
  segmentId: fc.string({ minLength: 1, maxLength: 12 }),
  classifications: enumValue.map((v) => [v]),
});

/**
 * 「违例段落」生成器：覆盖三类违反不变量的情形——
 *   (a) 空列表（未分类）；
 *   (b) 两个及以上标签（多重分类，元素可为枚举或非枚举）；
 *   (c) 单个但为非枚举字符串（非法分类值）。
 */
const invalidSegment: fc.Arbitrary<RawSegmentClassification> = fc.record({
  segmentId: fc.string({ minLength: 1, maxLength: 12 }),
  classifications: fc.oneof(
    // (a) 未分类：空列表。
    fc.constant<string[]>([]),
    // (b) 多重分类：长度 >= 2 的任意标签列表（枚举与非枚举混合）。
    fc.array(fc.oneof(enumValue, nonEnumValue), {
      minLength: 2,
      maxLength: 5,
    }),
    // (c) 非法值：单个非枚举字符串。
    nonEnumValue.map((v) => [v]),
  ),
});

describe("Property 3: 段落分类互斥且完备 (Requirements 2.5, 2.6)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 3: 段落分类互斥且完备
  it("validateClassifications 为 true 当且仅当每段恰好被赋予一个枚举内分类", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(validSegment, invalidSegment), {
          maxLength: 20,
        }),
        (segments) => {
          // 参照基准：逐段判定是否「恰好一个枚举内分类」，整体是否全部满足。
          const expected = segments.every((seg) =>
            seg.classifications.length === 1 &&
            isSegmentClassification(seg.classifications[0]),
          );

          // 不变量检测结果必须与参照基准一致（互斥 + 完备，既不漏报也不误报）。
          expect(validateClassifications(segments)).toBe(expected);

          // 逐段守卫：单段判定与「长度为 1 且为枚举成员」严格等价。
          for (const seg of segments) {
            const segOk =
              seg.classifications.length === 1 &&
              isSegmentClassification(seg.classifications[0]);
            expect(isSegmentClassifiedExactlyOnce(seg)).toBe(segOk);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: markdown-image-prompt-pipeline, Property 3: 段落分类互斥且完备
  it("全部为合法段落（每段恰好一个枚举分类）时必为 true", () => {
    fc.assert(
      fc.property(
        fc.array(validSegment, { minLength: 1, maxLength: 20 }),
        (segments) => {
          // 全合法集合：互斥且完备不变量必然成立。
          expect(validateClassifications(segments)).toBe(true);
          // 每段唯一分类值都必属于 {DATA_RICH, LOGIC}。
          for (const seg of segments) {
            expect(seg.classifications).toHaveLength(1);
            expect(isSegmentClassification(seg.classifications[0])).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: markdown-image-prompt-pipeline, Property 3: 段落分类互斥且完备
  it("集合中只要存在至少一个违例段落（未分类/多重/非法值）即为 false", () => {
    fc.assert(
      fc.property(
        fc.array(validSegment, { maxLength: 20 }),
        invalidSegment,
        fc.nat(),
        (validList, badSegment, idx) => {
          // 在任意位置插入一个确定违例的段落。
          const position = validList.length === 0 ? 0 : idx % (validList.length + 1);
          const segments = [
            ...validList.slice(0, position),
            badSegment,
            ...validList.slice(position),
          ];

          // 存在违例段落时，整体不变量必然被判为不满足。
          expect(validateClassifications(segments)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  // 锚定具体示例，作为属性的可读佐证（非额外属性）。
  it("示例：合法 / 未分类 / 多重 / 非法值", () => {
    expect(
      validateClassifications([
        { segmentId: "s1", classifications: ["DATA_RICH"] },
        { segmentId: "s2", classifications: ["LOGIC"] },
      ]),
    ).toBe(true);

    // 未分类（空列表）。
    expect(
      validateClassifications([{ segmentId: "s1", classifications: [] }]),
    ).toBe(false);

    // 多重分类。
    expect(
      validateClassifications([
        { segmentId: "s1", classifications: ["DATA_RICH", "LOGIC"] },
      ]),
    ).toBe(false);

    // 非枚举值。
    expect(
      validateClassifications([
        { segmentId: "s1", classifications: ["UNKNOWN"] },
      ]),
    ).toBe(false);
  });
});
