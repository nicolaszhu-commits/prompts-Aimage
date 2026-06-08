/**
 * 目录初始化完备性与幂等性属性化测试（Property 1）
 *
 * Feature: markdown-image-prompt-pipeline, Property 1: 目录初始化完备且幂等
 *   对于 REQUIRED_DIRS（`articles/`、`.kiro/steering/`、`.kiro/skills/`、`styles/`、
 *   `output/`）的任意子集作为「已存在目录」，执行目录初始化后，最终存在的目录集合都应
 *   恰好等于 REQUIRED_DIRS 全集；对已经齐全的输入再次执行不产生额外变化（幂等）。
 *
 * Validates: Requirements 1.2
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 1 这一条属性（一个属性 = 一个属性化测试）。
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { REQUIRED_DIRS, ensureDirs } from "../src/dirs.js";

/** REQUIRED_DIRS 全集（普通数组，便于做生成器与断言）。 */
const ALL_REQUIRED: readonly string[] = REQUIRED_DIRS;

/**
 * 「已存在目录子集」生成器：从 REQUIRED_DIRS 中随机选取任意子集。
 *
 * `fc.subarray` 会覆盖关键边界：
 * - 空子集（一个目录都不存在）；
 * - 任意中间子集；
 * - 全集（所有必需目录都已存在），用于验证「对齐全输入再次执行不产生额外变化」。
 */
const requiredSubset: fc.Arbitrary<string[]> = fc.subarray(
  [...ALL_REQUIRED],
);

/**
 * 「额外无关目录」生成器：制造 REQUIRED_DIRS 之外的多余目录，
 * 用以验证 ensureDirs 会保留既有的额外目录、且不会把它们误判为必需目录。
 * 统一以结尾 `/` 表示逻辑目录路径，并排除恰好等于某个必需目录的样本。
 */
const extraDir: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => `extra-${s.replace(/\//g, "_")}/`)
  .filter((d) => !ALL_REQUIRED.includes(d));

const extraDirs: fc.Arbitrary<string[]> = fc.array(extraDir, {
  maxLength: 5,
});

/** 集合相等判定（忽略顺序）。 */
function setsEqual(a: Iterable<string>, b: Iterable<string>): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) {
    if (!sb.has(x)) return false;
  }
  return true;
}

describe("Property 1: 目录初始化完备且幂等 (Requirements 1.2)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 1: 目录初始化完备且幂等
  it("任意已存在目录子集 → ensureDirs 结果恒为 REQUIRED_DIRS 全集的超集，且等于 existing ∪ REQUIRED_DIRS，并满足幂等", () => {
    fc.assert(
      fc.property(requiredSubset, extraDirs, (subset, extras) => {
        // 构造「已存在目录」集合：REQUIRED_DIRS 的随机子集 + 任意无关额外目录。
        const existing = [...subset, ...extras];

        const result = ensureDirs(existing);

        // (1) 完备性：结果必为 REQUIRED_DIRS 全集的超集（每个必需目录都存在）。
        for (const dir of ALL_REQUIRED) {
          expect(result.has(dir)).toBe(true);
        }

        // (2) 精确性：结果恰好等于 existing ∪ REQUIRED_DIRS（不多不少）。
        const expectedUnion = new Set([...existing, ...ALL_REQUIRED]);
        expect(setsEqual(result, expectedUnion)).toBe(true);

        // (3) 不丢失额外目录：existing 中的无关额外目录在结果中仍然保留。
        for (const extra of extras) {
          expect(result.has(extra)).toBe(true);
        }

        // (4) 幂等性：对结果再次执行 ensureDirs，集合不再发生任何变化。
        const second = ensureDirs(result);
        expect(setsEqual(second, result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: markdown-image-prompt-pipeline, Property 1: 目录初始化完备且幂等
  it("已齐全输入（existing == REQUIRED_DIRS 全集）再次执行不产生额外变化", () => {
    fc.assert(
      fc.property(extraDirs, (extras) => {
        // 已存在目录已经涵盖全部必需目录（可能再附带一些无关额外目录）。
        const existing = [...ALL_REQUIRED, ...extras];

        const first = ensureDirs(existing);
        // 结果集合应恰好等于输入集合本身（没有任何缺失目录需要新建）。
        expect(setsEqual(first, new Set(existing))).toBe(true);

        // 再次执行仍然完全一致（幂等）。
        const second = ensureDirs(first);
        expect(setsEqual(second, first)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
