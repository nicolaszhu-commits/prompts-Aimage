/**
 * 命名派生属性化测试（Property 7）
 *
 * Feature: markdown-image-prompt-pipeline, Property 7: 输出命名派生正确
 *   对于任意以 `.md` 结尾的合法原文章文件名，派生出的输出文件名都应等于
 *   「去除 `.md` 扩展名后的主名」直接拼接 `aimage.md`，且输出路径位于
 *   `output/` 目录下。
 *
 * Validates: Requirements 4.2
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 7 这一条属性（一个属性 = 一个属性化测试）。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  articleName,
  outputFileName,
  outputPath,
  articlePath,
} from "../src/naming.js";

/** Markdown 扩展名常量，与被测实现保持一致。 */
const MD_EXTENSION = ".md";
/** 输出文件名后缀常量，与被测实现保持一致（需求 4.2）。 */
const OUTPUT_SUFFIX = "aimage.md";
/** 输出目录前缀。 */
const OUTPUT_DIR = "output/";
/** 原文章目录前缀。 */
const ARTICLES_DIR = "articles/";

/**
 * 单个「主名字符」生成器：刻意覆盖输入空间的关键子集——
 * - CJK 中文字符（U+4E00–U+9FFF），覆盖「含中文」要求；
 * - ASCII 字母与数字；
 * - 常见特殊字符（空格、连字符、括号、标点、符号，含中英文标点），覆盖「特殊字符」要求；
 * - 含 `.md` 子串的片段，制造「主名内部也出现扩展名样式」的刁钻情形。
 *
 * 排除路径分隔符 `/` 与空字符 `\u0000`，以贴合「合法文件名」语义。
 */
const baseNameChar: fc.Arbitrary<string> = fc.oneof(
  // 中文字符
  fc.integer({ min: 0x4e00, max: 0x9fff }).map((cp) => String.fromCodePoint(cp)),
  // 字母数字与特殊字符（含中英文标点、符号、空格）
  fc.constantFrom(
    "a", "B", "z", "Q", "0", "5", "9",
    " ", "-", "_", "(", ")", "[", "]", "+", "=", "&", "%", "#", "@", "!",
    "，", "。", "、", "～", "（", "）", "：", "·",
    "趋", "势", "图", "表",
    ".md", // 制造主名内部含扩展名样式的边界情形
  ),
);

/**
 * 合法主名生成器：由 1..30 个主名字符拼接而成，过滤掉包含路径分隔符或
 * 空字符的样本，保证生成的是「单段合法文件名主名」。允许主名内部包含
 * `.md` 子串（甚至以 `.md` 结尾），以覆盖剥离逻辑只去除「结尾恰好一个 .md」的边界。
 */
const baseName: fc.Arbitrary<string> = fc
  .array(baseNameChar, { minLength: 1, maxLength: 30 })
  .map((chars) => chars.join(""))
  .filter((s) => s.length > 0 && !s.includes("/") && !s.includes("\u0000"));

describe("Property 7: 输出命名派生正确 (Requirements 4.2)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 7: 输出命名派生正确
  it("对任意以 .md 结尾的合法文件名，输出名 == 主名 + aimage.md 且路径位于 output/", () => {
    fc.assert(
      fc.property(baseName, (base) => {
        // 由合法主名拼接 `.md` 构造一个「以 .md 结尾的合法文件名」。
        const fileName = `${base}${MD_EXTENSION}`;

        // (1) articleName 应剥离结尾的 ".md"，恰好得到主名 base。
        expect(articleName(fileName)).toBe(base);

        // (2) outputFileName 应等于 主名 + "aimage.md"。
        expect(outputFileName(fileName)).toBe(`${base}${OUTPUT_SUFFIX}`);
        // 同时与 articleName 的派生关系自洽。
        expect(outputFileName(fileName)).toBe(
          `${articleName(fileName)}${OUTPUT_SUFFIX}`,
        );

        // (3) outputPath 必须以 "output/" 为前缀，且等于 "output/" + 输出文件名。
        expect(outputPath(fileName).startsWith(OUTPUT_DIR)).toBe(true);
        expect(outputPath(fileName)).toBe(
          `${OUTPUT_DIR}${outputFileName(fileName)}`,
        );

        // (4) articlePath 必须以 "articles/" 为前缀，且等于 "articles/" + 原文件名。
        expect(articlePath(fileName).startsWith(ARTICLES_DIR)).toBe(true);
        expect(articlePath(fileName)).toBe(`${ARTICLES_DIR}${fileName}`);
      }),
      { numRuns: 200 },
    );
  });

  // 锚定 design.md 中给出的具体示例，作为属性的可读佐证（非额外属性）。
  it("示例：AI趋势.md -> AI趋势aimage.md / output/AI趋势aimage.md", () => {
    const fileName = "AI趋势.md";
    expect(articleName(fileName)).toBe("AI趋势");
    expect(outputFileName(fileName)).toBe("AI趋势aimage.md");
    expect(outputPath(fileName)).toBe("output/AI趋势aimage.md");
    expect(articlePath(fileName)).toBe("articles/AI趋势.md");
  });
});
