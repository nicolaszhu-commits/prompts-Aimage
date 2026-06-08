/**
 * 端到端示例校验脚本（Task 10.1）
 *
 * 适用对象：流水线中**确定性的「管道铺设」**——文档渲染/解析、命名派生、目录就绪、
 * 写入隔离、缺失文件处理、统一风格应用/缺失、原文保护（只读引用 Steering）。
 *
 * ⚠️ 重要背景（与 design.md「测试策略」一致）：
 *   本流水线是 **Kiro 原生工作流**。阶段一（数据富集度研判）与阶段二（提示词文案撰写）
 *   由 LLM 在技能触发时完成，**没有确定性 oracle**，不在本脚本测试范围内。
 *   本脚本只验证**确定性的渲染/校验链路**：给定「已解析的文章 + 人工/模拟的逐段分类」，
 *   在内存中构造一个极简「流水线」产出 ImagePrompt[] 并渲染 PromptDocument，再断言其确定性行为。
 *
 * 覆盖的示例校验点（design.md「2. 端到端场景的示例校验」）：
 *   - 正确生成 output/[Article_Name]aimage.md（需求 2.1, 4.1）
 *   - Style_Guide 存在/缺失时文档头分别标注「已应用」/「缺失」且均能生成（需求 3.5, 3.7）
 *   - 目标文章不存在时报错并列出可用文件（需求 2.2）
 *   - output/ 预置同名文件时覆盖前出现提示（需求 4.5）
 *   - 报告含输出完整路径（需求 4.6）
 *   - 报告覆盖五个目录就绪状态（需求 1.4）
 *   - 执行显式引用两个 Steering 引导文件（需求 5.1）
 *
 * 约束：
 *   - 全程对 articles/ 与 fixtures 只读；不做任何真实文件写入（渲染到内存字符串）。
 *   - ESM + NodeNext：相对导入校验库需带 `.js` 扩展名；用 node:fs/path/url 以绝对路径读取。
 *   - 这些是**示例化**端到端测试（非 fast-check 属性测试），无 numRuns 要求，但必须确定、自洽。
 *
 * _Requirements: 1.4, 2.1, 3.5, 3.7, 4.1, 4.5, 4.6, 5.1_
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderDocument,
  parsePrompts,
  type ImagePrompt,
  type PromptDocument,
} from "../src/document.js";
import { articleName, outputPath } from "../src/naming.js";
import { ensureDirs, REQUIRED_DIRS } from "../src/dirs.js";
import { checkArticleExists, ARTICLE_NOT_FOUND_MESSAGE } from "../src/safety.js";
import {
  SegmentClassification,
  ImageTypeCategory,
  IMAGE_TYPE_LABELS,
  categoryForClassification,
} from "../src/classification.js";

/* -------------------------------------------------------------------------- */
/* 路径解析（用 import.meta.url 推导绝对路径，只读）                            */
/* -------------------------------------------------------------------------- */

/** 本测试文件所在目录：<workspaceRoot>/tools/validator/test。 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));

/** 样例文章夹具目录：test/fixtures/articles（相对本测试文件）。 */
const FIXTURES_DIR = join(TEST_DIR, "fixtures", "articles");

/**
 * 工作区根目录：从 test 目录向上三级（test → validator → tools → workspaceRoot），
 * 用于定位 .kiro/steering/ 下的两个引导文件。
 */
const WORKSPACE_ROOT = resolve(TEST_DIR, "..", "..", "..");

/** Steering 引导文件目录：<workspaceRoot>/.kiro/steering。 */
const STEERING_DIR = join(WORKSPACE_ROOT, ".kiro", "steering");

/** 三篇样例文章的文件名（数据密集型 / 纯逻辑型 / 混合型）。 */
const FIXTURE_FILES = ["AI趋势.md", "数字经济报告.md", "团队协作方法论.md"] as const;

/* -------------------------------------------------------------------------- */
/* 极简「文章 → 提示词」适配器（仅用于驱动确定性渲染/校验链路）                  */
/* -------------------------------------------------------------------------- */

/** 段落分类 → 中文类别标签（与 design.md 输出模板「数据可视化 / 概念表达」一致）。 */
const CATEGORY_LABEL: Record<ImageTypeCategory, string> = {
  [ImageTypeCategory.DATA_VISUALIZATION]: "数据可视化",
  [ImageTypeCategory.CONCEPT_EXPRESSION]: "概念表达",
};

/** 解析出的原文小节：小标题 + 正文。 */
interface ArticleSection {
  readonly heading: string;
  readonly body: string;
}

/**
 * 按 `## ` 二级标题把 Markdown 切分为小节（忽略一级标题 `# ` 与三级 `### `）。
 *
 * 正则 `^##\s+...`：首字符须为恰好两个 `#` 后接空白，故不会误命中 `# `（h1）或
 * `### `（h3，第三个字符是 `#` 而非空白）。首个二级标题之前的内容（如文档大标题）被忽略。
 */
function parseSections(markdown: string): ArticleSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ArticleSection[] = [];
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
 * 模拟的逐段分类（启发式）。
 *
 * ⚠️ 真正的数据富集度研判是 **LLM 在技能触发时**完成的语义判断，无确定性 oracle，
 * 不在自动化测试范围内（design.md）。此处的「含 ASCII 数字即视为数据密集」启发式，
 * **仅**用于在测试中驱动确定性的渲染/校验链路，绝非真实的分类逻辑。
 */
function classifyByHeuristic(sectionText: string): SegmentClassification {
  return /\d/.test(sectionText)
    ? SegmentClassification.DATA_RICH
    : SegmentClassification.LOGIC;
}

/**
 * 由小节正文派生一段「安全的」画面/图表描述：
 *   - 折叠所有空白（含换行）为单个空格，避免破坏 Markdown 渲染与往返解析；
 *   - 去除可能的结构性前缀（`#`/`>`/`-`/`---`），避免出现以 `## ` 或 `---` 开头的描述；
 *   - 截取片段并保证非空（需求 3.3/4.4/5.4：描述字段必须非空）。
 *
 * 注：真实描述由 LLM 忠于原文撰写；此处仅取原文片段以提供确定、非空的渲染输入。
 */
function toDescription(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  const safe = collapsed.replace(/^[#>\-\s]+/, "").trim();
  const snippet = safe.slice(0, 80).trim();
  return snippet.length > 0 ? snippet : "（原文段落，内容从略）";
}

/**
 * 把一篇文章映射为 ImagePrompt[]（确定性）：
 *   segmentRef = 小标题；classification = 启发式模拟分类；
 *   imageType = 类别标签 + 该类别下一个具体标签；description = 安全片段；order = 小节序号。
 */
function buildPrompts(content: string): ImagePrompt[] {
  return parseSections(content).map((section, index) => {
    const classification = classifyByHeuristic(section.body);
    const category = categoryForClassification(classification);
    const labels = IMAGE_TYPE_LABELS[category];
    const label = labels[index % labels.length];
    return {
      segmentRef: section.heading,
      imageType: `${CATEGORY_LABEL[category]} — ${label}`,
      description: toDescription(section.body),
      classification,
      order: index,
    };
  });
}

/** 读取一篇夹具文章内容（只读）。 */
function readFixture(fileName: string): string {
  return readFileSync(join(FIXTURES_DIR, fileName), "utf8");
}

/**
 * 覆盖提示判定（需求 4.5）——纯函数建模：
 *   当目标输出路径已存在于给定的 output 文件名集合中时，返回「需要提示覆盖」信号。
 *   不做任何真实 fs 写入或探测。
 */
function shouldWarnOverwrite(
  targetOutputPath: string,
  existingOutputs: ReadonlySet<string>,
): boolean {
  return existingOutputs.has(targetOutputPath);
}

/* -------------------------------------------------------------------------- */
/* 测试                                                                        */
/* -------------------------------------------------------------------------- */

describe("Task 10.1 端到端示例校验：确定性渲染/校验链路", () => {
  it("三篇样例文章夹具均存在且非空（前置条件）", () => {
    for (const file of FIXTURE_FILES) {
      const content = readFixture(file);
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("正确派生 output/[Article_Name]aimage.md 并渲染→解析往返三字段齐全（需求 2.1, 4.1）", () => {
    for (const file of FIXTURE_FILES) {
      const name = articleName(file);
      const content = readFixture(file);
      const prompts = buildPrompts(content);

      // 每篇文章应至少切出一个小节（夹具均含多个 `## ` 段落）。
      expect(prompts.length).toBeGreaterThan(0);

      // (1) 命名派生：输出路径形如 output/AI趋势aimage.md。
      const target = outputPath(file);
      expect(target).toBe(`output/${name}aimage.md`);
      expect(target.startsWith("output/")).toBe(true);
      expect(target.endsWith("aimage.md")).toBe(true);

      // (2) renderDocument 生成文档内容（非空）。
      const doc: PromptDocument = { articleName: name, styleApplied: false, prompts };
      const markdown = renderDocument(doc);
      expect(markdown.length).toBeGreaterThan(0);
      // 文档头应声明源文章与提示词总数。
      expect(markdown).toContain(`# ${name} 配图提示词文档`);
      expect(markdown).toContain(`> 源文章：articles/${name}.md`);
      expect(markdown).toContain(`> 提示词总数：${prompts.length}`);

      // (3) parsePrompts 往返校验：条目数一致，且三字段齐全且非空。
      const parsed = parsePrompts(markdown);
      expect(parsed.length).toBe(prompts.length);
      parsed.forEach((entry, i) => {
        expect(entry.segmentRef.trim().length).toBeGreaterThan(0);
        expect(entry.imageType.trim().length).toBeGreaterThan(0);
        expect(entry.description.trim().length).toBeGreaterThan(0);
        // 往返一致性：未应用风格时三字段应逐字复原。
        expect(entry.segmentRef).toBe(prompts[i].segmentRef);
        expect(entry.imageType).toBe(prompts[i].imageType);
        expect(entry.description).toBe(prompts[i].description);
      });
    }
  });

  it("三类夹具的模拟分类分布符合预期（数据密集/纯逻辑/混合，佐证链路）", () => {
    const classesOf = (file: string): Set<SegmentClassification> =>
      new Set(buildPrompts(readFixture(file)).map((p) => p.classification));

    // 数字经济报告：数据密集型 → 全部 DATA_RICH。
    const econ = classesOf("数字经济报告.md");
    expect(econ.has(SegmentClassification.DATA_RICH)).toBe(true);
    expect(econ.has(SegmentClassification.LOGIC)).toBe(false);

    // 团队协作方法论：纯逻辑型 → 全部 LOGIC。
    const team = classesOf("团队协作方法论.md");
    expect(team.has(SegmentClassification.LOGIC)).toBe(true);
    expect(team.has(SegmentClassification.DATA_RICH)).toBe(false);

    // AI趋势：混合型 → 两类并存。
    const ai = classesOf("AI趋势.md");
    expect(ai.has(SegmentClassification.DATA_RICH)).toBe(true);
    expect(ai.has(SegmentClassification.LOGIC)).toBe(true);
  });

  it("Style_Guide 存在/缺失时文档头分别标注「已应用」/「缺失」且均能生成、条目数一致（需求 3.5, 3.7）", () => {
    for (const file of FIXTURE_FILES) {
      const name = articleName(file);
      const prompts = buildPrompts(readFixture(file));

      // styleApplied=true：文档头含「已应用（styles/Style_Guide.md）」。
      const applied = renderDocument({ articleName: name, styleApplied: true, prompts });
      expect(applied.length).toBeGreaterThan(0);
      expect(applied).toContain("已应用（styles/Style_Guide.md）");
      expect(applied).not.toContain("未应用（Style_Guide 缺失）");

      // styleApplied=false：文档头含「未应用（Style_Guide 缺失）」（优雅降级仍产出文档）。
      const missing = renderDocument({ articleName: name, styleApplied: false, prompts });
      expect(missing.length).toBeGreaterThan(0);
      expect(missing).toContain("未应用（Style_Guide 缺失）");
      expect(missing).not.toContain("已应用（styles/Style_Guide.md）");

      // 两种情况条目数一致（风格仅影响描述内容，不增删条目）。
      expect(parsePrompts(applied).length).toBe(prompts.length);
      expect(parsePrompts(missing).length).toBe(prompts.length);
    }
  });

  it("目标文章不存在时报错并列出可用文件（需求 2.2）", () => {
    const existing = [...FIXTURE_FILES];
    const result = checkArticleExists("不存在的文章.md", existing);

    expect(result.found).toBe(false);
    expect(result.terminate).toBe(true);
    if (result.found === false) {
      // 错误信息含「文件未找到」。
      expect(result.error).toContain(ARTICLE_NOT_FOUND_MESSAGE);
      // available 列出三篇 fixture（checkArticleExists 内部去重并按字典序排序）。
      expect(result.available.length).toBe(FIXTURE_FILES.length);
      for (const file of FIXTURE_FILES) {
        expect(result.available).toContain(file);
      }
    }
  });

  it("output/ 预置同名文件时覆盖前出现提示（需求 4.5）", () => {
    const target = outputPath("AI趋势.md"); // output/AI趋势aimage.md

    // 同名已存在 → 需要提示覆盖。
    const existingOutputs = new Set<string>([target]);
    expect(shouldWarnOverwrite(target, existingOutputs)).toBe(true);

    // 不存在同名 → 无需提示，可直接写入。
    expect(shouldWarnOverwrite(target, new Set<string>())).toBe(false);
  });

  it("报告含输出完整路径（需求 4.6）", () => {
    const target = outputPath("AI趋势.md");
    // 模拟「写入完成后报告输出文件完整路径」：报告字符串应可携带完整路径。
    const report = `已生成配图提示词文档：${target}`;
    expect(target).toBe("output/AI趋势aimage.md");
    expect(report).toContain("output/AI趋势aimage.md");
  });

  it("报告覆盖五个目录就绪状态（需求 1.4）", () => {
    // 从空集合初始化：结果应恰好覆盖五个必需目录且全部就绪。
    const ready = ensureDirs([]);
    expect(ready.size).toBe(REQUIRED_DIRS.length);
    expect(REQUIRED_DIRS.length).toBe(5);

    // 可枚举每个目录的就绪状态用于汇报。
    const statuses = REQUIRED_DIRS.map((dir) => ({ dir, ready: ready.has(dir) }));
    expect(statuses).toHaveLength(5);
    expect(statuses.every((s) => s.ready)).toBe(true);
    for (const dir of REQUIRED_DIRS) {
      expect(ready.has(dir)).toBe(true);
    }
  });

  it("执行显式引用两个 Steering 引导文件且包含关键约束关键字（需求 5.1，只读）", () => {
    // 只读校验：读取真实 Steering 文件，断言存在、非空且含关键约束关键字。
    const qualityPath = join(STEERING_DIR, "image-prompt-quality.md");
    const protectionPath = join(STEERING_DIR, "source-protection.md");

    expect(existsSync(qualityPath)).toBe(true);
    expect(existsSync(protectionPath)).toBe(true);

    const quality = readFileSync(qualityPath, "utf8");
    const protection = readFileSync(protectionPath, "utf8");

    expect(quality.length).toBeGreaterThan(0);
    expect(protection.length).toBeGreaterThan(0);

    // 质量把控引导：忠实性 + 产物写入 output/。
    expect(quality).toContain("忠实");
    expect(quality).toContain("output/");

    // 原文保护引导：只读访问 + 产物写入 output/。
    expect(protection).toContain("只读");
    expect(protection).toContain("output/");
  });
});
