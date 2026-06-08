/**
 * 原文保护哈希回归校验（Task 10.2，Property 9 的端到端佐证）
 *
 * 目标：在端到端流程**前后**对 articles/ 下所有原文计算内容哈希并比对，断言流水线
 * 未修改任何原文（需求 6.1/6.2/6.3）。同时断言所有模拟写路径都落在 output/、绝不
 * 落在 articles/（写入隔离）。
 *
 * ⚠️ 背景（与 design.md「测试策略」一致）：
 *   本流水线为 Kiro 原生工作流，阶段一/二由 LLM 完成、无确定性 oracle。此处仅对
 *   **确定性管道铺设**做端到端佐证：在内存中渲染文档（绝不写入 fixtures/articles），
 *   读取原文前后做内容哈希比对，并校验写路径隔离。
 *
 * 约束：
 *   - 全程对 articles/ 与 fixtures 只读：仅用 node:fs READ 三篇夹具文章。
 *   - 不做任何真实文件写入（renderDocument 仅产出内存字符串）。
 *   - ESM + NodeNext：相对导入校验库需带 `.js` 扩展名；用 node:fs/path/url 解析绝对路径。
 *
 * _Requirements: 6.1, 6.2, 6.3_
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderDocument,
  type ImagePrompt,
  type PromptDocument,
} from "../src/document.js";
import { articleName, outputPath } from "../src/naming.js";
import {
  hashArticles,
  articlesHashEqual,
  isWriteAllowed,
} from "../src/safety.js";
import {
  SegmentClassification,
  ImageTypeCategory,
  IMAGE_TYPE_LABELS,
  categoryForClassification,
} from "../src/classification.js";

/* -------------------------------------------------------------------------- */
/* 路径解析（只读）                                                            */
/* -------------------------------------------------------------------------- */

/** 本测试文件所在目录。 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));

/** 样例文章夹具目录：test/fixtures/articles。 */
const FIXTURES_DIR = join(TEST_DIR, "fixtures", "articles");

/** 三篇样例文章文件名（数据密集型 / 纯逻辑型 / 混合型）。 */
const FIXTURE_FILES = ["AI趋势.md", "数字经济报告.md", "团队协作方法论.md"] as const;

/* -------------------------------------------------------------------------- */
/* 只读读取 + 极简内存「流水线」                                               */
/* -------------------------------------------------------------------------- */

/** 段落分类 → 中文类别标签。 */
const CATEGORY_LABEL: Record<ImageTypeCategory, string> = {
  [ImageTypeCategory.DATA_VISUALIZATION]: "数据可视化",
  [ImageTypeCategory.CONCEPT_EXPRESSION]: "概念表达",
};

/** 只读读取全部夹具文章，返回 [文件名, 内容] 列表。 */
function readAllFixtures(): Array<[string, string]> {
  return FIXTURE_FILES.map((file) => [
    file,
    readFileSync(join(FIXTURES_DIR, file), "utf8"),
  ]);
}

/** 按 `## ` 二级标题切分小节（与 pipeline.e2e 中一致的确定性切分）。 */
function parseSections(markdown: string): Array<{ heading: string; body: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string }> = [];
  let heading: string | null = null;
  let bodyLines: string[] = [];

  const flush = (): void => {
    if (heading !== null) {
      sections.push({ heading, body: bodyLines.join("\n") });
    }
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match !== null) {
      flush();
      heading = match[1].trim();
      bodyLines = [];
    } else if (heading !== null) {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * 模拟逐段分类（启发式，仅驱动确定性渲染；真实研判由 LLM 完成，见 design.md）。
 */
function classifyByHeuristic(sectionText: string): SegmentClassification {
  return /\d/.test(sectionText)
    ? SegmentClassification.DATA_RICH
    : SegmentClassification.LOGIC;
}

/** 由小节正文派生安全、非空的画面描述（折叠空白、去结构性前缀）。 */
function toDescription(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  const safe = collapsed.replace(/^[#>\-\s]+/, "").trim();
  const snippet = safe.slice(0, 80).trim();
  return snippet.length > 0 ? snippet : "（原文段落，内容从略）";
}

/** 文章内容 → ImagePrompt[]（确定性内存流水线）。 */
function buildPrompts(content: string): ImagePrompt[] {
  return parseSections(content).map((section, index) => {
    const classification = classifyByHeuristic(section.body);
    const category = categoryForClassification(classification);
    const labels = IMAGE_TYPE_LABELS[category];
    return {
      segmentRef: section.heading,
      imageType: `${CATEGORY_LABEL[category]} — ${labels[index % labels.length]}`,
      description: toDescription(section.body),
      classification,
      order: index,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 测试                                                                        */
/* -------------------------------------------------------------------------- */

describe("Task 10.2 原文保护哈希回归（Property 9 端到端佐证，需求 6.1/6.2/6.3）", () => {
  it("端到端流程前后 articles/ 原文内容哈希完全一致（未被修改）", () => {
    // 1) 执行前：只读读取并计算原文哈希。
    const before = hashArticles(readAllFixtures());

    // 2) 运行内存流水线：对每篇文章渲染文档（仅产出内存字符串，绝不写入 fixtures/articles）。
    const renderedDocs: string[] = [];
    for (const [file, content] of readAllFixtures()) {
      const doc: PromptDocument = {
        articleName: articleName(file),
        styleApplied: true,
        prompts: buildPrompts(content),
      };
      const markdown = renderDocument(doc);
      expect(markdown.length).toBeGreaterThan(0);
      renderedDocs.push(markdown);
    }
    // 确认流水线确有产出（三篇文档），但全部停留在内存中。
    expect(renderedDocs).toHaveLength(FIXTURE_FILES.length);

    // 3) 执行后：再次只读读取并计算原文哈希。
    const after = hashArticles(readAllFixtures());

    // 4) 断言原文集合内容指纹完全一致（逐字节未变）。
    expect(articlesHashEqual(before, after)).toBe(true);
    // 逐文件指纹亦应一致（更精确的佐证）。
    for (const file of FIXTURE_FILES) {
      expect(after.perFile.get(file)).toBe(before.perFile.get(file));
    }
    expect(after.combined).toBe(before.combined);
  });

  it("所有模拟写路径都位于 output/、绝不位于 articles/（写入隔离）", () => {
    for (const file of FIXTURE_FILES) {
      // 派生的输出路径必须是被允许的写路径（位于 output/ 之内）。
      const target = outputPath(file);
      expect(target.startsWith("output/")).toBe(true);
      expect(isWriteAllowed(target)).toBe(true);

      // 反向佐证：若把产物误写回 articles/，必须被判定为不允许。
      const forbidden = `articles/${articleName(file)}aimage.md`;
      expect(isWriteAllowed(forbidden)).toBe(false);
    }
  });
});
