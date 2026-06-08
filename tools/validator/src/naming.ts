/**
 * 命名派生纯函数（需求 4.2）
 *
 * 这些函数把流水线中确定性的「文件名/路径派生」规则抽象为可测试的纯函数：
 * 无任何文件系统副作用，仅做字符串与逻辑路径计算。
 *
 * 设计来源（design.md「命名派生（需求 4.2）」）：
 *   articleName(fileName) = strip_suffix(fileName, ".md")
 *   outputFileName(name)  = articleName(name) + "aimage.md"
 *   outputPath(name)      = join("output/", outputFileName(name))
 *   articlePath(name)     = join("articles/", name)
 *
 * 例：`AI趋势.md` → articleName "AI趋势" → outputFileName "AI趋势aimage.md"
 *     → outputPath "output/AI趋势aimage.md"。
 *
 * 注意：
 * - 路径一律使用 POSIX 风格的正斜杠（`/`）拼接，因为它们是流水线内部的
 *   逻辑路径约定，而非依赖具体操作系统的物理路径分隔符。
 * - 文件名可能包含中文或其它特殊字符，函数按原样保留这些字符。
 */

/** 输出文件名后缀（需求 4.2）。 */
const OUTPUT_SUFFIX = "aimage.md";

/** Markdown 扩展名。 */
const MD_EXTENSION = ".md";

/** 原文章输入目录前缀（POSIX 风格）。 */
const ARTICLES_DIR = "articles/";

/** 生成产物输出目录前缀（POSIX 风格）。 */
const OUTPUT_DIR = "output/";

/**
 * 以 POSIX 正斜杠风格拼接目录前缀与文件名。
 *
 * 保证最终路径中目录与文件名之间恰好有一个 `/` 分隔符，
 * 既能容忍传入的 `dir` 带或不带结尾斜杠，也能避免出现重复斜杠。
 */
function joinPosix(dir: string, name: string): string {
  const normalizedDir = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  return `${normalizedDir}/${name}`;
}

/**
 * 从文章文件名派生主名：去除结尾的 `.md` 扩展名。
 *
 * 仅当文件名以 `.md` 结尾时才剥离该后缀；否则原样返回。
 *
 * @param fileName 原文章文件名，例如 `AI趋势.md`。
 * @returns 去除 `.md` 后的主名，例如 `AI趋势`。
 */
export function articleName(fileName: string): string {
  return fileName.endsWith(MD_EXTENSION)
    ? fileName.slice(0, -MD_EXTENSION.length)
    : fileName;
}

/**
 * 派生输出文件名：主名直接拼接 `aimage.md`。
 *
 * @param name 原文章文件名（如 `AI趋势.md`）或已去后缀的主名均可。
 * @returns 输出文件名，例如 `AI趋势aimage.md`。
 */
export function outputFileName(name: string): string {
  return `${articleName(name)}${OUTPUT_SUFFIX}`;
}

/**
 * 派生输出文件的完整逻辑路径，位于 `output/` 目录下。
 *
 * @param name 原文章文件名（如 `AI趋势.md`）或已去后缀的主名均可。
 * @returns 输出路径，例如 `output/AI趋势aimage.md`。
 */
export function outputPath(name: string): string {
  return joinPosix(OUTPUT_DIR, outputFileName(name));
}

/**
 * 派生原文章在 `articles/` 目录下的完整逻辑路径。
 *
 * @param name 原文章文件名，例如 `AI趋势.md`。
 * @returns 原文章路径，例如 `articles/AI趋势.md`。
 */
export function articlePath(name: string): string {
  return joinPosix(ARTICLES_DIR, name);
}
