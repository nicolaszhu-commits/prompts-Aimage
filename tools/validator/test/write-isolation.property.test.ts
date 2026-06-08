/**
 * 原文保护——写入隔离且原文不变属性化测试（Property 9）
 *
 * Feature: markdown-image-prompt-pipeline, Property 9: 原文保护——写入隔离且原文不变
 *   对于任意原文章集合与任意目标文件名，流水线执行所产生的全部写操作目标路径都应
 *   落在 `output/` 前缀下、绝不以 `articles/` 为前缀；且执行前后 `articles/` 目录下
 *   每个文件的内容都应保持完全一致（写操作集合与 `articles/` 不相交）。
 *
 * Validates: Requirements 6.1, 6.2, 6.3
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 9 这一条属性（一个属性 = 一个属性化测试）。
 *
 * 测试建模：
 * - 流水线对 `articles/` 全程只读，唯一的写操作目标是由目标文件名派生的
 *   `outputPath(target)`。因此在校验器层面，「写入隔离」表现为：所有写路径都
 *   通过 `isWriteAllowed`（位于 `output/`、不触及 `articles/`），而任何
 *   `articlePath(...)` 都不被允许写入。
 * - 「原文不变」表现为：由于流水线不向 `articles/` 写入，对原文集合在执行前后
 *   重新计算 `hashArticles`，`articlesHashEqual(before, after)` 恒为真。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  isWriteAllowed,
  hashArticles,
  articlesHashEqual,
} from "../src/safety.js";
import { outputPath, articlePath } from "../src/naming.js";

/** 原文章目录前缀（POSIX 风格），用于「写路径绝不以 articles/ 为前缀」的断言。 */
const ARTICLES_PREFIX = "articles/";
/** 输出目录前缀（POSIX 风格），唯一可写区。 */
const OUTPUT_PREFIX = "output/";

/**
 * 单个文件名「主名字符」生成器：刻意覆盖输入空间的关键子集——
 * - CJK 中文字符（U+4E00–U+9FFF），覆盖「含中文」要求；
 * - ASCII 字母数字与常见特殊字符（空格、标点、符号，含中英文标点）；
 *
 * 排除路径分隔符 `/` 与空字符 `\u0000`，以贴合「单段合法文件名」语义。
 */
const fileNameChar: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0x4e00, max: 0x9fff }).map((cp) => String.fromCodePoint(cp)),
  fc.constantFrom(
    "a", "B", "z", "Q", "0", "5", "9",
    " ", "-", "_", "(", ")", "[", "]", "+", "=", "&", "%", "#", "@", "!",
    "，", "。", "、", "～", "（", "）", "：", "·",
    "趋", "势", "图", "表",
  ),
);

/** 合法文件名主名生成器：1..24 个字符，排除路径分隔符与空字符。 */
const baseName: fc.Arbitrary<string> = fc
  .array(fileNameChar, { minLength: 1, maxLength: 24 })
  .map((chars) => chars.join(""))
  .filter((s) => s.length > 0 && !s.includes("/") && !s.includes("\u0000"));

/** 以 `.md` 结尾的合法原文章文件名生成器。 */
const mdFileName: fc.Arbitrary<string> = baseName.map((base) => `${base}.md`);

/** 原文内容生成器：任意字符串（含空串、中文、控制字符），覆盖哈希输入空间。 */
const fileContent: fc.Arbitrary<string> = fc.string({ maxLength: 60 });

/**
 * 原文集合生成器：文件名 → 内容。可能为空集合（无原文），
 * 也可能包含若干篇原文。文件名去重由 Map 语义自然保证。
 */
const articlesArb: fc.Arbitrary<Map<string, string>> = fc
  .array(fc.tuple(mdFileName, fileContent), { maxLength: 8 })
  .map((pairs) => new Map(pairs));

/**
 * 对抗性写路径生成器：构造各种「看似写入 output/、实则可能逃逸」或「直接写入
 * articles/」的路径，用于验证 `isWriteAllowed` 的隔离判定是否安全且正确。
 * 每个样本携带其「期望允许写入」的真值（仅对真正位于 output/ 的路径为真）。
 *
 * 由 (主名, 模板索引) 二元组派生，使 fast-check 能正常收缩（shrink）。
 */
const adversarialWritePath: fc.Arbitrary<{ path: string; allowed: boolean }> =
  fc.tuple(baseName, fc.nat({ max: 8 })).map(([base, kind]) => {
    const candidates: Array<{ path: string; allowed: boolean }> = [
      // 直接写入 articles/：禁止。
      { path: `${ARTICLES_PREFIX}${base}.md`, allowed: false },
      // 经 .. 穿越逃逸到 articles/：规范化后等价于 articles/...，禁止。
      { path: `${OUTPUT_PREFIX}../${ARTICLES_PREFIX}${base}.md`, allowed: false },
      // 裸目录名（非目录内文件）：禁止。
      { path: "output", allowed: false },
      { path: "articles", allowed: false },
      // 项目根下其它位置：禁止。
      { path: `${base}.md`, allowed: false },
      // 经 .. 逃逸到项目根之上：禁止。
      { path: `${OUTPUT_PREFIX}../../${base}.md`, allowed: false },
      // 真正位于 output/ 的写路径：允许。
      { path: `${OUTPUT_PREFIX}${base}.md`, allowed: true },
      // 等价的 output/ 写路径（前导 ./）：允许。
      { path: `./${OUTPUT_PREFIX}${base}.md`, allowed: true },
      // 等价的 output/ 写路径（重复斜杠）：允许。
      { path: `${OUTPUT_PREFIX}/${base}.md`, allowed: true },
    ];
    return candidates[kind % candidates.length];
  });

describe("Property 9: 原文保护——写入隔离且原文不变 (Requirements 6.1, 6.2, 6.3)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 9: 原文保护——写入隔离且原文不变
  it("任意原文集合与目标文件名 → 写路径 ∈ output/ ∧ ∉ articles/，且执行前后原文哈希不变", () => {
    fc.assert(
      fc.property(
        articlesArb,
        mdFileName,
        adversarialWritePath,
        (articles, target, adversarial) => {
          // (前置) 执行前对原文集合计算内容哈希。
          const before = hashArticles(articles);

          // (1) 流水线唯一的写目标是 outputPath(target)。它必须被允许写入：
          //     即位于 output/ 之内、且不触及 articles/。
          const writePath = outputPath(target);
          expect(isWriteAllowed(writePath)).toBe(true);
          // 显式核对前缀：写路径以 output/ 开头、绝不以 articles/ 开头。
          expect(writePath.startsWith(OUTPUT_PREFIX)).toBe(true);
          expect(writePath.startsWith(ARTICLES_PREFIX)).toBe(false);

          // (2) 任何指向 articles/ 的写操作都必须被拒绝——既包括目标文章本身，
          //     也包括原文集合中现存的每一篇文章（写操作集合与 articles/ 不相交）。
          expect(isWriteAllowed(articlePath(target))).toBe(false);
          for (const name of articles.keys()) {
            expect(isWriteAllowed(articlePath(name))).toBe(false);
          }

          // (3) 写操作集合 = { outputPath(target) }；其中每个路径都通过隔离校验，
          //     且没有任何一个落在 articles/ 之内。
          const writePaths = [writePath];
          for (const p of writePaths) {
            expect(isWriteAllowed(p)).toBe(true);
            expect(p.startsWith(ARTICLES_PREFIX)).toBe(false);
          }

          // (4) 对抗性写路径：isWriteAllowed 必须返回正确布尔值
          //     （仅对真正位于 output/ 的路径为真，对穿越/裸目录/articles 为假）。
          expect(isWriteAllowed(adversarial.path)).toBe(adversarial.allowed);

          // (5) 原文不变：流水线不向 articles/ 写入，故对原集合重算哈希后
          //     与执行前完全一致（内容、文件名集合均未变）。
          const after = hashArticles(articles);
          expect(articlesHashEqual(before, after)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
