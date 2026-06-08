/**
 * 目录就绪模型（需求 1.2/1.3）
 *
 * 把流水线「阶段零：目录就绪」中确定性的部分抽象为可测试的纯函数：
 * 无任何真实文件系统副作用，仅在内存数据结构上建模「集合差」与「初始化」，
 * 以便属性化测试验证完备性、幂等性与既有文件保留。
 *
 * 设计来源（design.md「目录就绪模型（需求 1.2/1.3）」）：
 *   REQUIRED_DIRS = { "articles/", ".kiro/steering/", ".kiro/skills/", "styles/", "output/" }
 *   toCreate(existing) = REQUIRED_DIRS \ existing            // 集合差：缺失的必需目录
 *   ensureDirs(existing): 对 toCreate(existing) 创建，existing 内文件保持不变
 *                         ⇒ 结果集合 = existing ∪ REQUIRED_DIRS
 *
 * 不变量：
 * - 初始化只「新建缺失目录」，绝不删除或修改任何既有目录及其文件（需求 1.3）。
 * - 对已经齐全的输入再次执行不产生额外变化（幂等，需求 1.2）。
 * - 所有目录以 POSIX 风格、带结尾 `/` 的逻辑路径字符串表示，与 design.md 约定一致。
 */

/**
 * 流水线约定的五个必需目录（需求 1.2）。
 *
 * 以 `as const` 标注为只读元组，既固定了集合内容也保留了声明顺序，
 * 便于 `toCreate` 以稳定顺序返回缺失目录。
 */
export const REQUIRED_DIRS = [
  "articles/",
  ".kiro/steering/",
  ".kiro/skills/",
  "styles/",
  "output/",
] as const;

/** 必需目录路径的字面量联合类型（`"articles/" | ".kiro/steering/" | ...`）。 */
export type RequiredDir = (typeof REQUIRED_DIRS)[number];

/**
 * 目录内的文件清单：文件名 → 文件内容。
 *
 * 用「内容」而非仅文件名建模，是为了让 Property 2 能够断言初始化前后
 * 既有文件不仅仍然存在、且内容完全一致。
 */
export type FileEntries = ReadonlyMap<string, string>;

/**
 * 文件系统状态模型：目录路径 → 该目录下的文件清单。
 *
 * 这是 `ensureDirsWithFiles` 的输入/输出类型，用于在内存中无副作用地
 * 模拟「保留既有文件、仅补齐缺失目录」的行为。
 */
export type DirState = ReadonlyMap<string, FileEntries>;

/**
 * 计算需要新建的目录：REQUIRED_DIRS 与 `existing` 的集合差（需求 1.2）。
 *
 * 即返回所有「属于 REQUIRED_DIRS 但不在 `existing` 中」的目录。返回结果
 * 按 REQUIRED_DIRS 的声明顺序排列且不含重复项，因此对相同输入是确定性的。
 *
 * @param existing 已存在目录路径的可迭代集合（可包含 REQUIRED_DIRS 之外的多余目录，会被忽略）。
 * @returns 缺失的必需目录数组；当 `existing` 已涵盖全部必需目录时返回空数组。
 */
export function toCreate(existing: Iterable<string>): string[] {
  const existingSet = new Set(existing);
  return REQUIRED_DIRS.filter((dir) => !existingSet.has(dir));
}

/**
 * 目录初始化（仅建模目录集合，需求 1.2）。
 *
 * 在已存在目录集合的基础上补齐所有缺失的必需目录，返回初始化后的目录集合：
 * 结果 = `existing` ∪ REQUIRED_DIRS。该函数为纯函数，不修改入参，
 * 并保留 `existing` 中可能存在的 REQUIRED_DIRS 之外的额外目录。
 *
 * 性质：
 * - 完备性：结果必为 REQUIRED_DIRS 的超集。
 * - 幂等性：`ensureDirs(ensureDirs(x))` 与 `ensureDirs(x)` 等价（集合并运算的幂等）。
 *
 * @param existing 已存在目录路径的可迭代集合。
 * @returns 初始化后的目录集合（新的 `Set`）。
 */
export function ensureDirs(existing: Iterable<string>): Set<string> {
  const result = new Set(existing);
  for (const dir of REQUIRED_DIRS) {
    result.add(dir);
  }
  return result;
}

/**
 * 目录初始化（建模目录及其文件，需求 1.2/1.3）。
 *
 * 在保留既有目录与其全部文件（内容不变）的前提下，补齐所有缺失的必需目录，
 * 缺失目录以「空文件清单」加入。该函数为纯函数，不修改入参：返回一个全新的
 * 状态对象，且对每个既有目录的文件清单做浅拷贝，避免与入参共享可变引用。
 *
 * 性质：
 * - 完备性（Property 1 / 需求 1.2）：结果的目录键集合是 REQUIRED_DIRS 的超集。
 * - 幂等性（Property 1 / 需求 1.2）：再次执行不新增目录、不改动任何文件。
 * - 文件保留（Property 2 / 需求 1.3）：每个既有目录在结果中仍存在，其文件名与
 *   内容均与输入完全一致，绝不删除或修改。
 *
 * @param state 文件系统状态：目录路径 → 文件清单（文件名 → 内容）。
 * @returns 初始化后的新状态（`Map<string, Map<string, string>>`）。
 */
export function ensureDirsWithFiles(
  state: DirState,
): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();

  // 1) 原样保留全部既有目录及其文件（浅拷贝文件清单，保证内容不变且不共享引用）。
  for (const [dir, files] of state) {
    result.set(dir, new Map(files));
  }

  // 2) 仅为缺失的必需目录补建空目录；既有目录（含其文件）不受影响。
  for (const dir of REQUIRED_DIRS) {
    if (!result.has(dir)) {
      result.set(dir, new Map<string, string>());
    }
  }

  return result;
}
