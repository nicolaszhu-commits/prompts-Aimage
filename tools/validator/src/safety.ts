/**
 * 写入隔离与目标文件缺失校验、原文内容哈希（需求 2.2、6.1/6.2/6.3）
 *
 * 把流水线「原文保护」与「阶段一缺失校验」中确定性的部分抽象为可测试的纯函数：
 * 无任何真实文件系统副作用，仅在字符串与内存数据结构上运算，以便属性化测试
 * （Property 9、Property 10）对其行为进行验证。
 *
 *   - `isWriteAllowed(path)`：写路径隔离校验——所有写操作目标必须落在 `output/`
 *     前缀下、绝不以 `articles/` 为前缀（需求 6.1/6.3，对应 Property 9 的写入隔离断言）。
 *   - `checkArticleExists(name, existingArticles)`：目标文章缺失校验——目标不在
 *     `articles/` 下时返回带「文件未找到」信息与终止信号的结果（需求 2.2，对应 Property 10）。
 *   - `hashArticles(files)` / `articlesHashEqual(a, b)`：原文内容哈希工具——为前后
 *     比对「原文不变」提供确定性、纯函数的内容指纹（需求 6.2，对应 Property 9 的原文不变断言）。
 *
 * 路径约定（与 naming.ts / dirs.ts 一致）：
 * - 所有路径均为流水线内部的 POSIX 风格「逻辑路径」，目录分隔符固定为正斜杠（`/`），
 *   而非依赖具体操作系统的物理路径分隔符；本模块不处理反斜杠（`\`）分隔。
 * - 校验前会对路径做规范化：剥离前导 `./`、折叠空段，并解析 `.` 与 `..` 段，
 *   从而抵御诸如 `output/../articles/x.md` 这类「看似写入 output/、实则逃逸到
 *   articles/」的路径穿越（path traversal），保证隔离判定的安全性。
 *
 * 实现说明：
 * - 哈希采用纯 TypeScript 实现的 FNV-1a（32 位），不依赖 Node 的 `crypto` 模块，
 *   以保证函数纯净、可在任意环境导入且跨运行稳定（确定性）。它用于「变更检测」
 *   而非密码学用途，对检测原文是否被改动已足够。
 * - 本模块为 ESM + NodeNext；不引入外部依赖，故无相对导入扩展名问题。
 */

/** 原文章输入目录前缀（POSIX 风格，只读区，需求 6.1）。 */
const ARTICLES_PREFIX = "articles/";

/** 原文章输入目录名（不含结尾斜杠），用于「目录自身」的判定。 */
const ARTICLES_DIR = "articles";

/** 生成产物输出目录前缀（POSIX 风格，唯一可写区，需求 6.3）。 */
const OUTPUT_PREFIX = "output/";

/* -------------------------------------------------------------------------- */
/* 写入隔离校验（需求 6.1/6.3，Property 9）                                     */
/* -------------------------------------------------------------------------- */

/**
 * 规范化 POSIX 逻辑路径：剥离前导 `./`、折叠空段，并解析 `.` 与 `..`。
 *
 * 规范化规则：
 * - 按 `/` 切分；丢弃空段（来自前导 `./`、重复斜杠或结尾斜杠）与 `.` 段；
 * - 遇到 `..` 时回退上一段；若已无可回退的普通段（栈顶为 `..` 或栈空），
 *   则保留该 `..`，表示路径逃逸到了起点之上（结果将以 `..` 开头，从而既不属于
 *   `output/` 也不被误判为合法写入）。
 *
 * 该规范化使前缀判定对 `./output/x.md`、`output//x.md`、`output/../articles/x.md`
 * 等等价或穿越形式都能给出安全且一致的结论。
 *
 * @param path 待规范化的 POSIX 逻辑路径。
 * @returns 规范化后的路径（无前导 `./`、无 `.`/多余斜杠，`..` 已尽量解析）。
 */
function normalizeLogicalPath(path: string): string {
  const stack: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      // 跳过空段（前导 ./、重复或结尾斜杠）与「当前目录」段。
      continue;
    }
    if (segment === "..") {
      const top = stack[stack.length - 1];
      if (stack.length > 0 && top !== "..") {
        stack.pop();
      } else {
        // 无可回退的普通段：保留 `..`，标记逃逸到起点之上。
        stack.push("..");
      }
      continue;
    }
    stack.push(segment);
  }
  return stack.join("/");
}

/**
 * 判断规范化后的路径是否「严格位于」指定目录之内（即以 `dir/` 为前缀）。
 *
 * 仅匹配目录下的条目（如 `output/x.md`），不把目录自身（`output`）视为位于其内，
 * 因为写操作的目标应是目录内的文件，而非目录本身。
 *
 * @param normalized 规范化后的路径。
 * @param dirPrefix 目录前缀（含结尾斜杠，如 `"output/"`）。
 * @returns 当且仅当 `normalized` 严格位于该目录之内时为 `true`。
 */
function isStrictlyWithin(normalized: string, dirPrefix: string): boolean {
  return normalized.startsWith(dirPrefix);
}

/**
 * 写路径隔离校验：判断某个写操作目标路径是否被允许（需求 6.1/6.3）。
 *
 * 约定：流水线唯一可写区为 `output/`。当且仅当路径**位于 `output/` 目录之内**
 * （规范化后以 `output/` 为前缀）**且不位于 `articles/` 目录之内/不是 `articles/`
 * 目录自身**时，返回 `true`；其余一切路径（包括 `articles/...`、项目根下其它位置、
 * 经 `..` 穿越逃逸的路径、空路径、以及 `output`/`articles` 这类裸目录名）均返回 `false`。
 *
 * 路径会先经 `normalizeLogicalPath` 规范化，因此 `./output/x.md`、`output//x.md`
 * 等同于 `output/x.md` 返回 `true`；而 `output/../articles/x.md` 规范化为
 * `articles/x.md` 返回 `false`，防止伪装成写入 output/ 实则写入 articles/ 的穿越。
 *
 * 注意 `output/` 与 `articles/` 互不重叠，理论上「位于 output/」已蕴含「不位于
 * articles/」；此处仍显式校验 `articles/` 以忠实表达需求 6.3 的「禁止写入 articles/」，
 * 并对未来目录约定变化保持稳健（防御式校验）。
 *
 * @param path 待校验的写操作目标 POSIX 逻辑路径。
 * @returns 当且仅当允许写入（位于 `output/` 且不触及 `articles/`）时为 `true`。
 */
export function isWriteAllowed(path: string): boolean {
  const normalized = normalizeLogicalPath(path);
  const insideOutput = isStrictlyWithin(normalized, OUTPUT_PREFIX);
  const insideArticles =
    normalized === ARTICLES_DIR || isStrictlyWithin(normalized, ARTICLES_PREFIX);
  return insideOutput && !insideArticles;
}

/* -------------------------------------------------------------------------- */
/* 目标文章缺失校验（需求 2.2，Property 10）                                    */
/* -------------------------------------------------------------------------- */

/** 目标文章不存在时的「文件未找到」错误信息前缀（需求 2.2）。 */
export const ARTICLE_NOT_FOUND_MESSAGE = "文件未找到";

/**
 * 目标文章存在的校验结果：可继续进入后续阶段。
 *
 * `terminate` 恒为 `false`，与缺失结果共享可判别字段，便于调用方统一处理终止信号。
 */
export interface ArticleFoundResult {
  /** 判别标签：文章存在。 */
  readonly found: true;
  /** 是否应终止本次执行（存在时恒为 `false`）。 */
  readonly terminate: false;
  /** 命中的目标文章文件名（原样回传，便于后续阶段使用）。 */
  readonly name: string;
}

/**
 * 目标文章缺失的校验结果：携带「文件未找到」信息与终止信号（需求 2.2）。
 *
 * `terminate` 恒为 `true`，对应设计「输出文件未找到错误并**终止本次执行**，
 * 不进入阶段一后续步骤」；`available` 列出 `articles/` 下实际可用文件，便于报错提示。
 */
export interface ArticleMissingResult {
  /** 判别标签：文章不存在。 */
  readonly found: false;
  /** 是否应终止本次执行（缺失时恒为 `true`）。 */
  readonly terminate: true;
  /** 面向用户的「文件未找到」错误信息（含目标名与可用文件清单）。 */
  readonly error: string;
  /** `articles/` 下实际可用的文章文件名（去重并按字典序排序，确定性输出）。 */
  readonly available: readonly string[];
}

/**
 * 目标文章缺失校验的判别联合（discriminated union），以 `found` 字段区分两种结果。
 */
export type ArticleExistsResult = ArticleFoundResult | ArticleMissingResult;

/**
 * 校验目标文章是否存在于 `articles/` 下（需求 2.2，Property 10）。
 *
 * 本函数为纯函数：已存在文章清单由调用方以 `existingArticles` 传入，不触碰真实
 * 文件系统。当目标存在时返回可继续执行的结果；当目标缺失时返回带「文件未找到」
 * 信息与终止信号（`terminate: true`）的结果，并在 `available` 中列出实际可用文件
 * （去重、按字典序排序，保证确定性输出，便于报错提示与测试断言）。
 *
 * @param name 用户指定的目标文章文件名（如 `AI趋势.md`）。
 * @param existingArticles `articles/` 下实际存在的文章文件名集合（可迭代，可含重复）。
 * @returns 判别联合：存在则 `{ found: true, ... }`；缺失则 `{ found: false, terminate: true, ... }`。
 */
export function checkArticleExists(
  name: string,
  existingArticles: Iterable<string>,
): ArticleExistsResult {
  const available = [...new Set(existingArticles)].sort();

  if (available.includes(name)) {
    return { found: true, terminate: false, name };
  }

  const availableText =
    available.length > 0 ? available.join("、") : "（无）";
  const error =
    `${ARTICLE_NOT_FOUND_MESSAGE}：在 ${ARTICLES_PREFIX} 目录下未找到「${name}」。` +
    `可用文件：${availableText}`;

  return { found: false, terminate: true, error, available };
}

/* -------------------------------------------------------------------------- */
/* 原文内容哈希（需求 6.2，Property 9）                                         */
/* -------------------------------------------------------------------------- */

/** FNV-1a（32 位）偏移基（offset basis）。 */
const FNV_OFFSET_BASIS = 0x811c9dc5;

/** FNV-1a（32 位）质数（prime）。 */
const FNV_PRIME = 0x01000193;

/** 文件名与内容之间的分隔符（不可见控制字符，降低边界歧义）。 */
const FIELD_SEPARATOR = "\u0000";

/** 组合哈希中各文件条目之间的分隔符（不可见控制字符）。 */
const ENTRY_SEPARATOR = "\u0001";

/**
 * 纯 TypeScript 实现的 FNV-1a（32 位）字符串哈希，返回 8 位十六进制字符串。
 *
 * 为保证跨运行稳定与全 Unicode 适用，逐个 UTF-16 码元（code unit）依次喂入其
 * 低字节与高字节；使用 `Math.imul` 完成 32 位整数乘法并以无符号右移 `>>> 0`
 * 归一，避免浮点精度与符号问题。该函数为确定性纯函数：相同入参恒得相同结果。
 *
 * @param input 待哈希的字符串。
 * @returns 8 位定长十六进制哈希（如 `"811c9dc5"`）。
 */
function fnv1a32(input: string): string {
  let hash = FNV_OFFSET_BASIS >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    hash ^= code & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
    hash ^= (code >>> 8) & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 计算单个文件的内容指纹：对「文件名 + 分隔符 + 内容」整体哈希。
 *
 * 把文件名纳入哈希输入，使「重命名」也能被组合哈希感知；分隔符降低
 * 「不同的 (名,内容) 切分恰好拼出相同串」的边界歧义。
 *
 * @param name 文件名。
 * @param content 文件内容。
 * @returns 该文件的内容指纹（FNV-1a 十六进制）。
 */
function hashFile(name: string, content: string): string {
  return fnv1a32(`${name}${FIELD_SEPARATOR}${content}`);
}

/**
 * 原文集合的内容哈希结果：逐文件指纹 + 与顺序无关的组合指纹。
 */
export interface ArticlesHash {
  /** 逐文件指纹：文件名 → 该文件内容的 FNV-1a 哈希。 */
  readonly perFile: ReadonlyMap<string, string>;
  /** 整个集合的组合指纹（对文件名排序后聚合，故与输入迭代顺序无关）。 */
  readonly combined: string;
}

/**
 * 计算一组原文的内容哈希，供流水线执行前后比对「原文不变」（需求 6.2，Property 9）。
 *
 * 入参可为 `Map<string, string>` 或任意「[文件名, 内容]」二元组的可迭代对象
 * （`Map` 本身即满足该可迭代签名）。返回逐文件指纹与一个**与输入顺序无关**的
 * 组合指纹：组合指纹先按文件名字典序排序再聚合，因此即便前后两次的文件枚举
 * 顺序不同，只要「文件名集合及各自内容」一致，组合指纹即相同。
 *
 * 本函数为确定性纯函数，不修改入参、不触碰真实文件系统。
 *
 * @param files 文件集合：文件名 → 内容（`Map` 或 `[name, content]` 可迭代对象）。
 * @returns 包含逐文件指纹与组合指纹的 `ArticlesHash`。
 */
export function hashArticles(
  files: Iterable<readonly [string, string]>,
): ArticlesHash {
  const perFile = new Map<string, string>();
  for (const [name, content] of files) {
    perFile.set(name, hashFile(name, content));
  }

  const combinedInput = [...perFile.keys()]
    .sort()
    .map((name) => `${name}${FIELD_SEPARATOR}${perFile.get(name)!}`)
    .join(ENTRY_SEPARATOR);

  return { perFile, combined: fnv1a32(combinedInput) };
}

/**
 * 比较两个 `ArticlesHash` 是否相等，用于断言原文在执行前后保持完全一致（需求 6.2）。
 *
 * 先比对与顺序无关的组合指纹做快速判定，再逐文件比对（文件数量、文件名集合、
 * 各文件指纹）以给出精确结论。相等即表示原文集合未发生任何改动。
 *
 * @param a 执行前的哈希结果。
 * @param b 执行后的哈希结果。
 * @returns 当且仅当两者表示完全一致的原文集合时为 `true`。
 */
export function articlesHashEqual(a: ArticlesHash, b: ArticlesHash): boolean {
  if (a.combined !== b.combined) {
    return false;
  }
  if (a.perFile.size !== b.perFile.size) {
    return false;
  }
  for (const [name, hash] of a.perFile) {
    if (b.perFile.get(name) !== hash) {
      return false;
    }
  }
  return true;
}
