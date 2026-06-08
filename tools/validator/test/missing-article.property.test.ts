/**
 * 目标文章缺失触发未找到错误属性化测试（Property 10）
 *
 * Feature: markdown-image-prompt-pipeline, Property 10: 目标文章缺失触发未找到错误
 *   对于任意在 `articles/` 目录下不存在的目标文件名，路径校验都应判定为
 *   「文件未找到」并产生终止信号，而不会进入后续阶段。
 *
 * Validates: Requirements 2.2
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 10 这一条属性（一个属性 = 一个属性化测试）。
 *
 * 测试建模：
 * - 阶段一对目标文章的存在性校验抽象为纯函数 `checkArticleExists(name, existing)`。
 * - 「缺失」分支：目标 ∉ 现存集合 → 返回 found:false、terminate:true，
 *   error 含 ARTICLE_NOT_FOUND_MESSAGE，available 为现存文件（去重、排序）。
 * - 为保证属性非平凡（non-vacuous），同时验证「存在」分支：
 *   目标 ∈ 现存集合 → 返回 found:true、terminate:false（不终止、可进入后续阶段）。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  checkArticleExists,
  ARTICLE_NOT_FOUND_MESSAGE,
} from "../src/safety.js";

/**
 * 单个文件名「主名字符」生成器：覆盖中文、ASCII 字母数字与常见特殊字符。
 * 排除路径分隔符 `/` 与空字符 `\u0000`，贴合「单段合法文件名」语义。
 */
const fileNameChar: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0x4e00, max: 0x9fff }).map((cp) => String.fromCodePoint(cp)),
  fc.constantFrom(
    "a", "B", "z", "Q", "0", "5", "9",
    " ", "-", "_", "(", ")", "+", "=", "&", "%", "#",
    "，", "。", "、", "（", "）", "：",
    "趋", "势", "图", "表",
  ),
);

/** 合法文件名主名生成器：1..20 个字符，排除路径分隔符与空字符。 */
const baseName: fc.Arbitrary<string> = fc
  .array(fileNameChar, { minLength: 1, maxLength: 20 })
  .map((chars) => chars.join(""))
  .filter((s) => s.length > 0 && !s.includes("/") && !s.includes("\u0000"));

/** 以 `.md` 结尾的合法原文章文件名生成器。 */
const mdFileName: fc.Arbitrary<string> = baseName.map((base) => `${base}.md`);

/**
 * 现存文章集合 + 一个保证「不在集合中」的目标文件名。
 *
 * 通过 filter 强制 target ∉ existing，从而精确覆盖「缺失」分支；existing 允许为空
 * （此时 target 必然缺失），也允许含重复（用 Set 归一以反映真实可用清单）。
 */
const missingScenario: fc.Arbitrary<{
  existing: string[];
  target: string;
}> = fc
  .record({
    existing: fc.array(mdFileName, { maxLength: 8 }),
    target: mdFileName,
  })
  .filter(({ existing, target }) => !existing.includes(target));

/**
 * 现存文章集合 + 一个保证「在集合中」的目标文件名（非空集合）。
 * 用于验证属性非平凡：存在时不终止、可进入后续阶段。
 */
const presentScenario: fc.Arbitrary<{
  existing: string[];
  target: string;
}> = fc
  .array(mdFileName, { minLength: 1, maxLength: 8 })
  .chain((existing) =>
    fc
      .constantFrom(...existing)
      .map((target) => ({ existing, target })),
  );

describe("Property 10: 目标文章缺失触发未找到错误 (Requirements 2.2)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 10: 目标文章缺失触发未找到错误
  it("任意不在 articles/ 中的目标 → 校验返回「文件未找到」并终止，列出可用文件", () => {
    fc.assert(
      fc.property(missingScenario, ({ existing, target }) => {
        const result = checkArticleExists(target, existing);

        // (1) 缺失分支判别：found 为 false。
        expect(result.found).toBe(false);

        if (result.found === false) {
          // (2) 产生终止信号：不进入后续阶段。
          expect(result.terminate).toBe(true);

          // (3) 错误信息包含「文件未找到」前缀，且提及缺失的目标名。
          expect(result.error).toContain(ARTICLE_NOT_FOUND_MESSAGE);
          expect(result.error).toContain(target);

          // (4) available 列出现存文件，去重且按字典序排序（确定性输出）。
          const expectedAvailable = [...new Set(existing)].sort();
          expect(result.available).toEqual(expectedAvailable);
          // 目标既然缺失，必不出现在可用清单中。
          expect(result.available).not.toContain(target);
        }
      }),
      { numRuns: 200 },
    );
  });

  // 非平凡性校验：存在时不终止、可继续后续阶段（与缺失分支互补）。
  it("非平凡：目标存在于 articles/ 中 → 返回 found:true 且 terminate:false", () => {
    fc.assert(
      fc.property(presentScenario, ({ existing, target }) => {
        const result = checkArticleExists(target, existing);

        expect(result.found).toBe(true);
        if (result.found === true) {
          expect(result.terminate).toBe(false);
          // 命中的目标名原样回传，供后续阶段使用。
          expect(result.name).toBe(target);
        }
      }),
      { numRuns: 200 },
    );
  });
});
