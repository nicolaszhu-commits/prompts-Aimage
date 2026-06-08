/**
 * 提示词数据模型、文档渲染与解析（需求 3.3/3.6/4.1/4.3/4.4/5.4）
 *
 * 把流水线「阶段三：规范化输出」中确定性的部分抽象为可测试的纯函数：
 * 无任何文件系统副作用，仅在内存数据结构与字符串上运算——
 *   - `renderDocument`：把 `PromptDocument` 渲染为符合设计模板的 Markdown 文本；
 *   - `parsePrompts`：从渲染结果反向解析出每条目的三字段（对应段落/小标题、
 *     图片类型、画面/图表描述），与 `renderDocument` 互为往返（round-trip）。
 *
 * 设计来源（design.md「数据模型」「输出文档模板（需求 4）」、SKILL.md「输出文档模板」）：
 *   ImagePrompt   { segmentRef, imageType, description, classification, order }
 *   PromptDocument{ articleName, styleApplied, prompts }
 *
 * 关键约定：
 * - 条目按 `order` 升序排列（等于原文行文顺序），编号从 1 递增；编号 n 取决于
 *   「在阅读顺序中的 1-based 位次」，与 `order` 的原始数值无关（需求 4.3）。
 * - 渲染不修改入参：先复制 `prompts` 再排序（保持函数纯净、无副作用）。
 * - `styleApplied=true` 时，把统一风格描述「逐条」追加到每条提示词描述末尾，
 *   不遗漏任何一条（需求 3.6，对应 Property 6）。
 * - 每条目固定三字段且均非空：小节标题承载「对应段落/小标题」，列表项承载
 *   「图片类型」与「画面/图表描述」（需求 3.3/4.4/5.4，对应 Property 5）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 */

import type { SegmentClassification } from "./classification.js";

/**
 * 生图提示词（需求 3.3/4.4）。
 *
 * 三个对外可见的非空字段（`segmentRef`/`imageType`/`description`）构成输出文档
 * 每个条目的内容；`classification` 为内部记录，用于分类↔图片类型一致性校验；
 * `order` 为该提示词来源段落在原文中的出现序号，用于按行文顺序排序。
 */
export interface ImagePrompt {
  /** 对应段落或小标题（非空）。渲染时承载于小节标题位置。 */
  readonly segmentRef: string;
  /** 图片类型（非空，归属某 ImageTypeCategory，如「数据可视化 — 量化对比图」）。 */
  readonly imageType: string;
  /** 具体画面/图表描述（非空，仅源于原文）。 */
  readonly description: string;
  /** 内部记录的段落分类，用于一致性校验（不直接渲染到三字段）。 */
  readonly classification: SegmentClassification;
  /** 在原文中的出现序号（升序等于原文行文顺序）。 */
  readonly order: number;
}

/**
 * 配图提示词文档（需求 4）。
 *
 * `prompts` 的渲染顺序由 `renderDocument` 统一按 `order` 升序决定，因此入参数组
 * 本身的顺序不影响输出（渲染前会复制并排序，不修改入参）。
 */
export interface PromptDocument {
  /** 原文章主名（已去除 `.md` 扩展名），用于文档标题与源文章路径。 */
  readonly articleName: string;
  /** 是否应用了 Style_Guide 统一风格。 */
  readonly styleApplied: boolean;
  /** 提示词集合（渲染时按 `order` 升序排列）。 */
  readonly prompts: readonly ImagePrompt[];
}

/**
 * 从渲染结果解析出的单条目三字段（均应非空，需求 3.3/4.4/5.4）。
 */
export interface ParsedPrompt {
  /** 对应段落/小标题。 */
  readonly segmentRef: string;
  /** 图片类型。 */
  readonly imageType: string;
  /** 画面/图表描述。 */
  readonly description: string;
}

/**
 * `renderDocument` 的可选项。
 *
 * `styleGuideText` 为应用统一风格时追加到每条描述末尾的风格描述文本；
 * 仅当 `doc.styleApplied` 为真时生效。未提供时回退到 `DEFAULT_UNIFIED_STYLE_TEXT`。
 */
export interface RenderOptions {
  /** 统一风格描述文本（如配色、画风、构图基调的概述）。 */
  readonly styleGuideText?: string;
}

/* -------------------------------------------------------------------------- */
/* 模板常量（与 design.md / SKILL.md「输出文档模板」逐字对齐）                  */
/* -------------------------------------------------------------------------- */

/** 文档主标题后缀：`# {articleName} 配图提示词文档`。 */
const DOC_TITLE_SUFFIX = " 配图提示词文档";

/** 文档头「源文章」行前缀。 */
const SOURCE_LABEL = "> 源文章：";

/** 文档头「统一风格」行前缀。 */
const STYLE_LABEL = "> 统一风格：";

/** 文档头「提示词总数」行前缀。 */
const COUNT_LABEL = "> 提示词总数：";

/** 统一风格「已应用」状态文本。 */
const STYLE_APPLIED_TEXT = "已应用（styles/Style_Guide.md）";

/** 统一风格「未应用」状态文本（Style_Guide 缺失，优雅降级）。 */
const STYLE_MISSING_TEXT = "未应用（Style_Guide 缺失）";

/** 小节内「图片类型」列表项前缀。 */
const IMAGE_TYPE_LABEL = "- **图片类型**：";

/** 小节内「画面/图表描述」列表项前缀（描述正文另起缩进行）。 */
const DESCRIPTION_LABEL = "- **画面 / 图表描述**：";

/** 小节之间的分隔线。 */
const SECTION_SEPARATOR = "---";

/** 描述正文每行的缩进（2 空格）。 */
const DESCRIPTION_INDENT = "  ";

/**
 * 统一风格标记关键字（需求 3.6 / Property 6）。
 *
 * `applyUnifiedStyle` 会在描述末尾追加 `（{UNIFIED_STYLE_MARKER}：{styleText}）`，
 * Property 6 可据此断言：`styleApplied=true` 时每条渲染描述都包含该标记。
 */
export const UNIFIED_STYLE_MARKER = "统一风格";

/**
 * 缺省统一风格描述文本：当 `styleApplied=true` 但调用方未提供 `styleGuideText` 时使用。
 *
 * 取确定性常量以保证渲染可复现（纯函数、无随机性）。
 */
export const DEFAULT_UNIFIED_STYLE_TEXT =
  "遵循 Style_Guide.md 定义的统一配色、画风与构图基调";

/* -------------------------------------------------------------------------- */
/* 纯函数实现                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 将统一风格描述追加到单条提示词描述末尾（需求 3.6）。
 *
 * 追加格式为 `（{UNIFIED_STYLE_MARKER}：{styleText}）`，因此结果必然包含
 * `UNIFIED_STYLE_MARKER`，便于 Property 6 检测「全部条目均已应用统一风格」。
 * 为确定性纯函数：相同入参恒得相同结果。
 *
 * @param description 原始画面/图表描述。
 * @param styleText 统一风格描述文本。
 * @returns 追加统一风格标记后的描述。
 */
export function applyUnifiedStyle(
  description: string,
  styleText: string,
): string {
  return `${description}（${UNIFIED_STYLE_MARKER}：${styleText}）`;
}

/**
 * 按 `order` 升序复制并排序提示词数组（不修改入参）。
 *
 * 使用稳定排序：`order` 相等时保持入参中的相对先后，保证渲染结果确定。
 *
 * @param prompts 原始提示词集合。
 * @returns 新数组（按 `order` 升序）。
 */
function sortByOrder(prompts: readonly ImagePrompt[]): ImagePrompt[] {
  return [...prompts].sort((a, b) => a.order - b.order);
}

/**
 * 将多行描述的每一行缩进 2 个空格，渲染到「画面/图表描述」标签之后。
 *
 * @param description 描述文本（可能含换行）。
 * @returns 缩进后的多行字符串。
 */
function indentDescription(description: string): string {
  return description
    .split("\n")
    .map((line) => `${DESCRIPTION_INDENT}${line}`)
    .join("\n");
}

/**
 * 把 `PromptDocument` 渲染为符合设计模板的 Markdown 文本（需求 4.1/4.3/4.4）。
 *
 * 输出结构：
 *   - 文档头：标题 + 源文章 + 统一风格状态 + 提示词总数；
 *   - 之后每条提示词以 `---` 分隔，按 `order` 升序、从 1 递增编号的小节呈现，
 *     每节含「图片类型」与「画面/图表描述」两个列表项，小节标题承载「对应段落/小标题」。
 *
 * 风格应用（需求 3.6）：当 `doc.styleApplied` 为真时，对「每一条」提示词描述追加
 * 统一风格标记（`applyUnifiedStyle`），不遗漏任何一条。
 *
 * 本函数为纯函数：不修改入参（排序前先复制）。
 *
 * @param doc 配图提示词文档模型。
 * @param options 渲染可选项（统一风格描述文本）。
 * @returns 渲染后的 Markdown 文本（以换行结尾）。
 */
export function renderDocument(
  doc: PromptDocument,
  options?: RenderOptions,
): string {
  const ordered = sortByOrder(doc.prompts);
  const styleText = options?.styleGuideText ?? DEFAULT_UNIFIED_STYLE_TEXT;

  // 文档头：标题 + 三项声明（源文章、统一风格状态、提示词总数）。
  const headerLines: string[] = [
    `# ${doc.articleName}${DOC_TITLE_SUFFIX}`,
    "",
    `${SOURCE_LABEL}articles/${doc.articleName}.md`,
    `${STYLE_LABEL}${doc.styleApplied ? STYLE_APPLIED_TEXT : STYLE_MISSING_TEXT}`,
    `${COUNT_LABEL}${ordered.length}`,
  ];

  const lines: string[] = [...headerLines];

  // 每条提示词：先输出分隔线，再输出小节内容（编号 = 阅读顺序 1-based 位次）。
  ordered.forEach((prompt, index) => {
    const ordinal = index + 1;
    const description = doc.styleApplied
      ? applyUnifiedStyle(prompt.description, styleText)
      : prompt.description;

    lines.push(
      "",
      SECTION_SEPARATOR,
      "",
      `## ${ordinal}. ${prompt.segmentRef}`,
      "",
      `${IMAGE_TYPE_LABEL}${prompt.imageType}`,
      `${DESCRIPTION_LABEL}`,
      indentDescription(description),
    );
  });

  // 以换行结尾，符合常见 Markdown 文件约定。
  return `${lines.join("\n")}\n`;
}

/**
 * 判断某行是否为小节标题行（`## {n}. {segmentRef}`）。
 *
 * @param line 待判定的行。
 * @returns 命中时返回正则匹配结果，否则返回 `null`。
 */
function matchHeading(line: string): RegExpMatchArray | null {
  // 捕获组 1 为编号、捕获组 2 为「对应段落/小标题」原文。
  return line.match(/^##\s+(\d+)\.\s*(.*)$/);
}

/**
 * 判断某行是否为小节分隔线（`---`）。
 *
 * @param line 待判定的行。
 * @returns 是否为分隔线。
 */
function isSeparator(line: string): boolean {
  return line.trim() === SECTION_SEPARATOR;
}

/**
 * 从渲染结果反向解析出每条目的三字段（需求 3.3/4.4/5.4）。
 *
 * 解析按文档顺序进行，与 `renderDocument` 的输出互为往返：
 *   - 小节标题 `## {n}. {segmentRef}` → `segmentRef`；
 *   - `- **图片类型**：{...}` → `imageType`；
 *   - `- **画面 / 图表描述**：` 之后、直到下一分隔线/小节标题/文末的缩进文本 → `description`
 *     （去除每行至多 2 个前导空格的渲染缩进，并裁剪首尾空行）。
 *
 * 解析对描述跨多行具有鲁棒性：描述正文一直收集到遇到下一个 `---`、下一个小节标题
 * 或文档结尾为止。
 *
 * @param markdown `renderDocument` 产出的 Markdown 文本。
 * @returns 按文档顺序排列的三字段条目数组。
 */
export function parsePrompts(markdown: string): ParsedPrompt[] {
  const lines = markdown.split(/\r?\n/);
  const results: ParsedPrompt[] = [];

  let i = 0;
  while (i < lines.length) {
    const heading = matchHeading(lines[i]);
    if (heading === null) {
      i += 1;
      continue;
    }

    const segmentRef = heading[2].trim();
    let imageType = "";
    let description = "";
    i += 1;

    // 收集本小节内容：直到遇到下一个小节标题、分隔线或文末。
    while (i < lines.length) {
      const line = lines[i];
      if (matchHeading(line) !== null || isSeparator(line)) {
        break;
      }

      if (line.startsWith(IMAGE_TYPE_LABEL)) {
        imageType = line.slice(IMAGE_TYPE_LABEL.length).trim();
        i += 1;
        continue;
      }

      if (line.startsWith(DESCRIPTION_LABEL)) {
        i += 1;
        const descLines: string[] = [];
        // 描述正文：收集到下一个小节标题/分隔线/文末为止，去除渲染缩进。
        while (i < lines.length) {
          const descLine = lines[i];
          if (matchHeading(descLine) !== null || isSeparator(descLine)) {
            break;
          }
          descLines.push(descLine.replace(/^ {1,2}/, ""));
          i += 1;
        }
        // 裁剪首尾空行（渲染时小节之间的空行不属于描述正文）。
        while (descLines.length > 0 && descLines[0].trim() === "") {
          descLines.shift();
        }
        while (
          descLines.length > 0 &&
          descLines[descLines.length - 1].trim() === ""
        ) {
          descLines.pop();
        }
        description = descLines.join("\n");
        continue;
      }

      i += 1;
    }

    results.push({ segmentRef, imageType, description });
  }

  return results;
}
