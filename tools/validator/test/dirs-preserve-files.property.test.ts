/**
 * 初始化保留既有文件属性化测试（Property 2）
 *
 * Feature: markdown-image-prompt-pipeline, Property 2: 初始化保留既有文件
 *   对于任意已存在目录及其中任意文件集合，执行目录初始化后，所有原有文件都应仍然存在
 *   且内容保持不变（初始化只新建缺失目录，绝不删除或修改既有文件）。
 *
 * Validates: Requirements 1.3
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 2 这一条属性（一个属性 = 一个属性化测试）。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  REQUIRED_DIRS,
  ensureDirsWithFiles,
  type DirState,
} from "../src/dirs.js";

/** REQUIRED_DIRS 全集。 */
const ALL_REQUIRED: readonly string[] = REQUIRED_DIRS;

/**
 * 目录路径生成器：混合「必需目录」与「任意额外目录」，
 * 以覆盖既有目录既可能是 REQUIRED_DIRS 成员、也可能是无关目录的情形。
 * 统一以结尾 `/` 表示逻辑目录路径，并排除路径分隔符干扰。
 */
const dirPath: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...ALL_REQUIRED),
  fc
    .string({ minLength: 1, maxLength: 12 })
    .map((s) => `dir-${s.replace(/\//g, "_")}/`),
);

/** 文件名生成器：含中文/特殊字符，排除路径分隔符与空字符。 */
const fileName: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 16 })
  .map((s) => s.replace(/[/\u0000]/g, "_"))
  .filter((s) => s.length > 0);

/** 文件内容生成器：任意字符串（含空串），覆盖内容不变的断言空间。 */
const fileContent: fc.Arbitrary<string> = fc.string({ maxLength: 40 });

/** 单个目录的文件清单生成器：文件名 → 内容（可能为空清单）。 */
const fileEntries: fc.Arbitrary<Map<string, string>> = fc
  .array(fc.tuple(fileName, fileContent), { maxLength: 6 })
  .map((pairs) => new Map(pairs));

/**
 * 文件系统状态生成器：目录路径 → 文件清单。
 * 可能为空状态（一个目录都没有），也可能包含若干既有目录及其文件。
 */
const dirStateArb: fc.Arbitrary<Map<string, Map<string, string>>> = fc
  .array(fc.tuple(dirPath, fileEntries), { maxLength: 8 })
  .map((pairs) => new Map(pairs));

describe("Property 2: 初始化保留既有文件 (Requirements 1.3)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 2: 初始化保留既有文件
  it("任意既有目录及其文件清单 → 初始化后原目录与原文件全部仍在且内容不变，且补齐全部 REQUIRED_DIRS", () => {
    fc.assert(
      fc.property(dirStateArb, (state: DirState) => {
        const result = ensureDirsWithFiles(state);

        // (1) 保留既有目录与文件：每个原目录仍存在，文件名集合与每个文件内容完全一致。
        for (const [dir, originalFiles] of state) {
          expect(result.has(dir)).toBe(true);

          const resultFiles = result.get(dir)!;

          // 原目录中的每个文件都仍存在且内容未被修改。
          for (const [name, content] of originalFiles) {
            expect(resultFiles.has(name)).toBe(true);
            expect(resultFiles.get(name)).toBe(content);
          }

          // 既有目录的文件清单不被增删：结果文件数恰好等于原文件数，
          // 既不丢失原文件，也不会向既有目录注入新文件。
          expect(resultFiles.size).toBe(originalFiles.size);
        }

        // (2) 完备性（兼顾 1.2）：结果包含全部必需目录。
        for (const dir of ALL_REQUIRED) {
          expect(result.has(dir)).toBe(true);
        }

        // (3) 纯函数不变性：入参 state 未被修改（目录数量、各目录文件数量保持原样）。
        //     由于 ensureDirsWithFiles 应做拷贝，原 state 不应被写入新增目录。
        for (const [dir, originalFiles] of state) {
          expect(state.get(dir)!.size).toBe(originalFiles.size);
        }
      }),
      { numRuns: 200 },
    );
  });
});
