# 实现计划：Markdown 智能配图提示词提取流水线

## 概述

本流水线是一套 **Kiro 原生工作流**，主要产物为 Markdown 指令文件（技能文件、Steering 引导文件）与约定的项目目录结构。除此之外，设计中的确定性逻辑（命名派生、目录幂等、结构完整性、顺序与覆盖、分类→图片类型映射、写入隔离、缺失校验）被抽取为一套轻量 **TypeScript** 校验器/库，用 **fast-check** 进行属性化测试（每个属性 ≥100 次迭代）。

实现顺序遵循「先目录与指令产物 → 再确定性校验库 → 属性化测试 → 端到端示例校验脚手架与原文保护回归」，每一步在前一步基础上递增，最终整合为可校验的完整流水线。

## 任务

- [x] 1. 初始化项目目录结构与 TypeScript 校验工程
  - 创建流水线约定目录：`articles/`（只读输入）、`styles/`（预留给用户后续提供的 `Style_Guide.md`，即便文件缺失也保留目录）、`output/`（生成产物）、`.kiro/skills/生成配图提示词/`、`.kiro/steering/`
  - 在 `articles/`、`styles/`、`output/` 内放置 `.gitkeep` 占位文件以保留空目录
  - 初始化校验库工程：`tools/validator/`（`package.json`、`tsconfig.json`），安装 `typescript`、`vitest`（或 `jest`）与 `fast-check` 作为开发依赖，配置测试运行脚本（使用单次运行模式，如 `vitest --run`）
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. 编写 Steering 引导文件
  - [x] 2.1 编写质量把控引导文件 `image-prompt-quality.md`
    - 在 `.kiro/steering/image-prompt-quality.md` 中编码：忠实性（提示词高度忠于原文）、不臆造（仅依据原文已有信息，不引入原文未含内容/数据/结论）、可复制性（结构清晰、字段齐全、易复制到第三方生图平台）、三字段规范（对应段落/小标题、图片类型、画面/图表描述）
    - 配置 `inclusion: fileMatch`（匹配 `output/**`、`articles/**`）作为兜底加载方式
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 2.2 编写原文保护引导文件 `source-protection.md`
    - 在 `.kiro/steering/source-protection.md` 中编码：只读访问 `articles/`、执行前后原文内容完全一致、所有产物仅写入 `output/` 禁止写入 `articles/`
    - 配置 `inclusion: fileMatch`（匹配 `output/**`、`articles/**`）作为兜底加载方式
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 3. 编写核心技能文件 SKILL.md（三阶段 SOP 入口）
  - 在 `.kiro/skills/生成配图提示词/SKILL.md` 中编写元信息与触发说明（技能名 `/生成配图提示词`、用途、输入参数=目标文章名/路径、前置动作=显式加载两个 Steering 引导文件并确认约束生效）
  - 阶段零（目录就绪）：检查五个必需目录是否存在、创建缺失目录、保留既有文件、汇报每个目录就绪状态
  - 阶段一（结构研判）：只读读取指定 Article；文件不存在则报「文件未找到」并终止；分析全文/各段落数据特征；梳理逻辑结构并逐段提取上下文；为每段打且仅打一个标记（`Data_Rich_Segment`/`Logic_Segment`）
  - 阶段二（提示词策略生成）：数据段落生成「数据可视化」类提示词，逻辑段落生成「概念表达」类提示词；每条记录三字段；描述仅源于原文；从 `styles/` 加载 `Style_Guide`，存在则全条目应用统一风格并在文档头标注「已应用风格」，缺失则不应用风格继续生成并报告「Style_Guide 缺失」（优雅降级）；多候选文件时优先 `Style_Guide.md`
  - 阶段三（规范化输出）：派生输出名 `[Article_Name]aimage.md`；同名文件覆盖前提示用户；按原文行文顺序写入全部提示词（每条含三字段）；写入后报告输出文件完整路径
  - 内嵌设计中的输出文档模板（文档头声明源文章、风格应用状态、提示词总数；条目按序编号，含「图片类型」「画面/图表描述」字段）
  - _Requirements: 1.1, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1_

- [x] 4. 检查点 —— 确认指令型产物就绪
  - 确认目录结构、两个 Steering 文件、SKILL.md 均已创建且内容自洽；确保所有测试通过，如有疑问请询问用户。

- [x] 5. 实现命名派生与目录就绪校验逻辑
  - [x] 5.1 实现命名派生纯函数
    - 在 `tools/validator/src/naming.ts` 中实现 `articleName(fileName)`、`outputFileName(name)`、`outputPath(name)`、`articlePath(name)`，与设计的派生规则一致（`strip_suffix(".md")` + `aimage.md`，输出位于 `output/`）
    - _Requirements: 4.2_

  - [x]* 5.2 为命名派生编写属性化测试
    - **Property 7：输出命名派生正确**
    - 生成器覆盖含中文/特殊字符、以 `.md` 结尾的合法文件名；断言输出名 == 主名 + `aimage.md` 且路径以 `output/` 为前缀
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 7: ...`，≥100 次迭代
    - **Validates: Requirements 4.2**

  - [x] 5.3 实现目录就绪模型 `ensureDirs`
    - 在 `tools/validator/src/dirs.ts` 中定义 `REQUIRED_DIRS`、`toCreate(existing)`（集合差）、`ensureDirs(existing)`（仅新建缺失目录、保留既有文件，幂等）
    - _Requirements: 1.2, 1.3_

  - [x]* 5.4 为目录初始化完备性与幂等性编写属性化测试
    - **Property 1：目录初始化完备且幂等**
    - 随机生成 `REQUIRED_DIRS` 的任意子集作为已存在目录，执行后结果集合恒等于 `REQUIRED_DIRS` 全集，且对齐全输入再次执行不产生额外变化
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 1: ...`，≥100 次迭代
    - **Validates: Requirements 1.2**

  - [x]* 5.5 为初始化保留既有文件编写属性化测试
    - **Property 2：初始化保留既有文件**
    - 随机生成既有目录及其文件清单（含内容），执行初始化后断言所有原文件仍存在且内容不变
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 2: ...`，≥100 次迭代
    - **Validates: Requirements 1.3**

- [x] 6. 实现段落分类模型与分类→图片类型映射
  - [x] 6.1 实现分类与图片类型枚举及映射函数
    - 在 `tools/validator/src/classification.ts` 中定义 `SegmentClassification`（`DATA_RICH`/`LOGIC`）、`ImageTypeCategory`（`DATA_VISUALIZATION`/`CONCEPT_EXPRESSION`），实现 `classify` 结果的不变量校验（每段恰好一个枚举内分类）与约定映射 `DATA_RICH → DATA_VISUALIZATION`、`LOGIC → CONCEPT_EXPRESSION`
    - _Requirements: 2.5, 2.6, 3.1, 3.2_

  - [x]* 6.2 为分类互斥且完备编写属性化测试
    - **Property 3：段落分类互斥且完备**
    - 随机生成段落集合的分类输出，断言每段恰好被赋予一个分类值且属于 `{DATA_RICH, LOGIC}`
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 3: ...`，≥100 次迭代
    - **Validates: Requirements 2.5, 2.6**

  - [x]* 6.3 为分类→图片类型一致映射编写属性化测试
    - **Property 4：分类与图片类型类别一致映射**
    - 随机生成已分类段落集合，断言数据段落提示词图片类型属于「数据可视化」、逻辑段落属于「概念表达」
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 4: ...`，≥100 次迭代
    - **Validates: Requirements 3.1, 3.2**

- [x] 7. 实现提示词数据模型、文档渲染与解析
  - [x] 7.1 实现 ImagePrompt/PromptDocument 模型与渲染、解析函数
    - 在 `tools/validator/src/document.ts` 中定义 `ImagePrompt`（`segmentRef`/`imageType`/`description`/`classification`/`order`）与 `PromptDocument`（`articleName`/`styleApplied`/`prompts`）
    - 实现 `renderDocument(doc)`（按设计模板输出 Markdown，含文档头与按序编号条目）与 `parsePrompts(markdown)`（从渲染结果解析出每条目的三字段）
    - 在 `styleApplied=true` 时，将统一风格描述追加到每条提示词描述中
    - _Requirements: 3.3, 3.6, 4.1, 4.3, 4.4, 5.4_

  - [x]* 7.2 为条目结构完整性编写属性化测试
    - **Property 5：提示词条目结构完整（三字段齐全）**
    - 随机生成提示词集合并渲染，断言每条目可解析出三个非空字段（对应段落/小标题、图片类型、画面/图表描述）
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 5: ...`，≥100 次迭代
    - **Validates: Requirements 3.3, 4.4, 5.4**

  - [x]* 7.3 为统一风格全覆盖应用编写属性化测试
    - **Property 6：存在 Style_Guide 时全部条目应用统一风格**
    - `styleApplied=true` 时随机生成提示词集合，断言每条描述都包含统一风格约束，无遗漏
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 6: ...`，≥100 次迭代
    - **Validates: Requirements 3.6**

  - [x]* 7.4 为顺序保持与完备覆盖编写属性化测试
    - **Property 8：提示词按原文顺序排列且完备覆盖**
    - 随机生成带 `order` 的段落集合，断言渲染条目顺序为 `order` 升序且条目数等于段落数（不遗漏、不重复）
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 8: ...`，≥100 次迭代
    - **Validates: Requirements 4.3**

- [x] 8. 检查点 —— 确认确定性核心逻辑测试通过
  - 运行属性化测试套件；确保所有测试通过，如有疑问请询问用户。

- [x] 9. 实现写入隔离与目标文件缺失校验
  - [x] 9.1 实现写路径隔离校验与缺失文件校验函数
    - 在 `tools/validator/src/safety.ts` 中实现 `isWriteAllowed(path)`（所有写路径必须以 `output/` 为前缀、绝不以 `articles/` 为前缀）与 `checkArticleExists(name, existingArticles)`（返回「文件未找到」终止信号）
    - 提供原文内容哈希工具 `hashArticles(files)`，供前后比对原文不变
    - _Requirements: 2.2, 6.1, 6.2, 6.3_

  - [x]* 9.2 为写入隔离与原文不变编写属性化测试
    - **Property 9：原文保护——写入隔离且原文不变**
    - 随机生成原文集合与目标文件名，断言所有写路径 ∈ `output/`、∉ `articles/`，且执行前后原文内容哈希不变
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 9: ...`，≥100 次迭代
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x]* 9.3 为目标文章缺失触发未找到错误编写属性化测试
    - **Property 10：目标文章缺失触发未找到错误**
    - 随机生成不在 `articles/` 中的目标文件名，断言校验返回「文件未找到」并产生终止信号、不进入后续阶段
    - 注释标注 `Feature: markdown-image-prompt-pipeline, Property 10: ...`，≥100 次迭代
    - **Validates: Requirements 2.2**

- [x] 10. 端到端示例校验脚手架与原文保护回归
  - [x]* 10.1 准备样例文章与端到端校验脚本
    - 在测试夹具目录放置三篇样例文章（数据密集型、纯逻辑型、混合型），编写脚本调用渲染/校验链路，断言：正确生成 `output/[Article_Name]aimage.md`（2.1, 4.1）、Style_Guide 存在/缺失时文档头分别标注「已应用风格」/「缺失」且均能生成（3.5, 3.7）、目标文章不存在时报错并列出可用文件（2.2）、预置同名文件时覆盖前出现提示（4.5）、报告含输出完整路径（4.6）、报告覆盖五个目录就绪状态（1.4）、执行显式引用两个 Steering 文件（5.1）
    - _Requirements: 1.4, 2.1, 3.5, 3.7, 4.1, 4.5, 4.6, 5.1_

  - [x]* 10.2 实现原文保护哈希回归校验
    - 编写脚本在端到端流程前后对 `articles/` 下所有文件计算内容哈希并比对，断言流水线未修改任何原文（作为 Property 9 的端到端佐证）
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 11. 最终检查点 —— 整合与全量回归
  - 串联校验库各模块（命名、目录、分类、渲染/解析、安全校验）确保无孤立未集成代码；运行全部属性化测试与端到端示例脚本；确保所有测试通过，如有疑问请询问用户。

- [ ] 12. 更新核心技能文件 SKILL.md（配图节奏 + SEO 元数据）
  - [ ] 12.1 在阶段一（结构研判）增补配图节奏选槽步骤
    - 在 `.kiro/skills/生成配图提示词/SKILL.md` 阶段一中新增「按配图节奏选定 Image_Slot」步骤：在每个 H2 标题处及每个章节主题切换处布点；相邻槽间正文超约 500 字时在语义边界（如 H3 小节、关键数据段）补 1 张；某 H2 章节正文不足约 300 字且与相邻章节主题连续时合并为一槽；在引言/开篇章节设题图槽并标记为 `Hero_Image`
    - 明确触发字数仅计正文文字，将代码块、表格、引用块、参考文献与 FAQ 列表排除在外；FAQ 等结构化区块按主题切换规则按需设槽
    - 仅为选定的 Image_Slot 对应段落/小标题提取生图上下文（不再机械「每段一图」）
    - _Requirements: 2.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ] 12.2 在阶段二（提示词策略生成）增补 Alt 文本与图片说明生成
    - 在阶段二为每条 Image_Prompt 增补生成 Alt_Text 与 Caption 的步骤：Alt_Text ≤125 字符、自然融入 1–2 个长尾关键词、忠于图意、以描述配图主体的文字开头且不以「图片」或「image of」开头
    - Caption 比 Alt_Text 更完整、点明看点或关键数据、可标注数据来源、与 Alt_Text 互补而非照抄；长尾关键词仅从文章标题/对应段落或小标题/原文关键术语中提炼，不引入原文未含词
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [ ] 12.3 更新内嵌输出文档模板与错误处理说明（五字段）
    - 更新 SKILL.md 中「输出文档模板」：每条目在「画面/图表描述」之后追加「- **Alt 文本**：…」与「- **图片说明**：…」两行，题图条目位于文首；同步更新「模板约定」与「执行后自检清单」为五字段
    - 更新错误处理汇总：补充「极短文章」（节奏退化为少量/仅一张槽且保证含题图、不强行补点）与「文章无 H2」（回退到正文字数节奏布点并保留引言题图槽）两种边界
    - _Requirements: 4.5, 7.1, 7.2, 7.4, 7.5, 8.1, 8.5, 8.6_

- [ ] 13. 扩展提示词数据模型与文档渲染/解析为五字段
  - [ ] 13.1 在 document.ts 中新增 altText/caption/isHero 并扩展 render/parse
    - 在 `tools/validator/src/document.ts` 的 `ImagePrompt` 接口新增 `altText`、`caption`、`isHero` 字段
    - `renderDocument` 在「画面/图表描述」之后渲染 `- **Alt 文本**：{altText}` 与 `- **图片说明**：{caption}` 两行
    - `parsePrompts` 同步解析这两项，使五字段与 render/parse 严格往返；保持既有三字段行为/解析不变（既有 Property 5/8 测试仍通过）
    - _Requirements: 4.5, 8.1, 8.2_

  - [ ]* 13.2 为每条目 Alt/Caption 齐全且 Alt 长度受限编写属性化测试
    - **Property 13：每条目 Alt 文本与图片说明齐全且 Alt 长度受限**
    - 在 `tools/validator/test/metadata-structure.property.test.ts` 中随机生成含 Alt/Caption 的提示词集合，render→parse 往返后断言每条目 Alt_Text 与 Caption 均非空且 Alt_Text 长度 ≤125 字符；生成器覆盖恰好 125 与超过 125 字符的边界
    - 使用 fast-check、≥100 次迭代，注释标注 `Feature: markdown-image-prompt-pipeline, Property 13: 每条目 Alt 文本与图片说明齐全且 Alt 长度受限`
    - **Validates: Requirements 8.1, 8.2, 4.5**

  - [ ]* 13.3 为 Alt 不以禁用前缀开头且与 Caption 不照抄编写属性化测试
    - **Property 14：Alt 文本不以禁用前缀开头且与图片说明互补不照抄**
    - 在 `tools/validator/test/metadata-altcaption.property.test.ts` 中随机生成有效 Alt/Caption，断言 Alt_Text 不以「图片」或「image of」开头（大小写不敏感）且 Alt_Text 与 Caption 不逐字相同；生成器覆盖禁用前缀反例与 Alt==Caption 反例
    - 使用 fast-check、≥100 次迭代，注释标注 `Feature: markdown-image-prompt-pipeline, Property 14: Alt 文本不以禁用前缀开头且与图片说明互补不照抄`
    - **Validates: Requirements 8.5, 8.7**

- [ ] 14. 新增配图节奏模块 cadence.ts
  - [ ] 14.1 实现 wordCount 与 selectImageSlots 纯函数
    - 新建 `tools/validator/src/cadence.ts`，定义 `SectionInput`（heading/isHeading/topicId/wordCount/isIntro/classification）与 `ImageSlot`（segmentRef/order/classification/isHero）
    - 实现 `wordCount(rawSegmentText)`：统计触发字数，排除代码块、表格、引用块、参考文献与 FAQ 列表
    - 实现 `selectImageSlots(sections)`：H2/主题切换基准布点、相邻槽间超约 500 字补点、短（不足约 300 字）同主题章节合并、引言/开篇设恰好一个 `isHero` 槽且其 order 最小；二者均为无副作用确定性纯函数并导出
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 14.2 为配图节奏槽位选择规则编写属性化测试
    - **Property 11：配图节奏槽位选择规则正确**
    - 在 `tools/validator/test/cadence-slots.property.test.ts` 中随机生成按行文顺序排列的章节序列，断言：每个 H2/主题切换处对应一个槽、相邻槽累计触发字数不超约 500 字、短同主题章节不单独成槽、含引言时恰好一个 `isHero=true` 且其 order 最小、槽数即决定提示词数；生成器覆盖无 H2、仅引言、全文同主题、超长章节（补点）、众多短同主题章节（合并）等边界
    - 使用 fast-check、≥100 次迭代，注释标注 `Feature: markdown-image-prompt-pipeline, Property 11: 配图节奏槽位选择规则正确`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6, 7.8**

  - [ ]* 14.3 为触发字数排除非正文区块编写属性化测试
    - **Property 12：触发字数排除非正文区块**
    - 在 `tools/validator/test/cadence-wordcount.property.test.ts` 中随机生成正文文本，向其中插入任意数量的代码块、表格、引用块、参考文献或 FAQ 列表区块，断言 `wordCount` 统计结果与插入前完全相同
    - 使用 fast-check、≥100 次迭代，注释标注 `Feature: markdown-image-prompt-pipeline, Property 12: 触发字数排除非正文区块`
    - **Validates: Requirements 7.5**

- [ ] 15. 扩展端到端示例校验覆盖五字段与配图节奏
  - [ ]* 15.1 扩展 pipeline.e2e.test.ts 覆盖 Alt/Caption、题图与节奏
    - 在 `tools/validator/test/pipeline.e2e.test.ts` 中扩展示例链路：用扩展后的 `renderDocument`/`parsePrompts` 断言每条输出条目均含非空「Alt 文本」与「图片说明」两行；题图（`isHero=true`）条目位于文首
    - 接入 `cadence.ts`：断言 `selectImageSlots` 对样例文章产出合理的槽数（≈ 正文字数 ÷ 400），并覆盖极短文章/无 H2 文章的节奏退化（生成少量槽且含一个题图、不强行补点）
    - _Requirements: 4.5, 7.1, 7.2, 7.4, 8.1_

- [ ] 16. 最终检查点 —— 全量回归（含 Property 11–14 与扩展 e2e）
  - 在 `tools/validator` 运行 `npm test`（Node 已可用），确认 Property 1–14 全部属性化测试与扩展后的端到端示例脚本均通过；确认 SKILL.md 与内嵌输出模板已反映五字段（含 Alt 文本、图片说明）结构与配图节奏选槽逻辑；确保所有测试通过，如有疑问请询问用户。

- [x] 17. 实现需求 9 —— Logo 后期合成（生图阶段预留留白 + 出图后确定性脚本叠加）
  - [x] 17.1 在 SKILL.md 中加入 Logo 预留指令与「阶段四 Logo 后期合成」说明
    - 在 `.kiro/skills/生成配图提示词/SKILL.md` 阶段二（提示词策略生成）新增「Logo 预留指令（强约束）」：每条 Image_Prompt 须包含「右上角预留一块干净空白区、不绘制任何 OSL Logo/字标/字母/文字」的正向预留 + 负向禁绘措辞，且与 `styles/Style_Guide.md` 第 1.1 节英文负向约束保持一致
    - 在阶段三之后新增「阶段四：出图后 Logo 后期合成」：说明该步骤为独立于提示词流水线的确定性后处理，由 `tools/logo/relogo.py` 在用户出图后执行——只读原图、残留旧 Logo 检测与覆盖、叠加固定 Logo、输出 `output/branded/`、自检；并在错误处理汇总与执行后自检清单中同步补入 Logo 预留与合成相关条目
    - _Requirements: 3.9, 9.1_

  - [x] 17.2 重写 styles/Style_Guide.md 的 Logo 规范为「后期合成」
    - 将 `styles/Style_Guide.md` 第 1 节由「生图阶段绘制 Logo」改写为「后期合成，生图阶段不绘制 Logo」：阐明原因（扩散模型无法可靠执行定量空间指令、重绘导致大小不一/字母错位），新增 1.1「生图阶段的 Logo 处理（右上角预留干净空白、负向禁绘措辞）」与 1.2「后期合成流程（脚本叠加固定素材）」
    - 明确 Logo 素材路径 `assets/brand/OSL_logo.png`、主色 `#B3FF38`、位置右上角、尺寸=画宽 8%、距顶/右各 60px；并在第 2、4、10 节及英文 ready-to-append 后缀中同步「预留留白、不画 Logo」的措辞
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 17.3 实现一次性抠底脚本 tools/logo/extract_logo.py（生成透明底 Logo 素材）
    - 在 `tools/logo/extract_logo.py` 中从品牌源文件抠出透明底「OSL」字标：识别绿字像素并裁切到字形紧致边界框、剔除外圈灰色边框；以「绿度（绿通道减蓝通道）」估计抗锯齿覆盖 alpha；前景 RGB 统一为品牌绿 `#B3FF38`，避免暗色脏边；输出透明底 PNG 到 `assets/brand/OSL_logo.png`
    - 该脚本一次性运行，产物即为后期合成反复复用的固定素材
    - _Requirements: 9.4_

  - [x] 17.4 实现后期合成脚本 tools/logo/relogo.py（残留检测 + 固定 Logo 叠加）
    - 在 `tools/logo/relogo.py` 中对每张生成图（只读）执行：① 残留旧 Logo 检测——在右上区域查找品牌绿连通块，以「最贴右上极角」块为种子（`corner_d = (w - x1) + y0` 最小），迭代合并「垂直重叠 ≥ `Y_OVL`·种子高 且 水平间距 ≤ `X_GAP` 且 合并后宽 ≤ `MAX_W`」的相邻字母块得到完整「OSL」bbox，并用其紧邻局部背景中位数色覆盖；严格不触碰 `y` 带不同的合法绿内容（数据标签/绿表头/分隔线）
    - ② 叠加固定 Logo——将 `assets/brand/OSL_logo.png` 缩放到「画宽 8%」（`LOGO_WIDTH_RATIO=0.08`），置于右上角、距顶/右各 `MARGIN=60px`，做 alpha 合成；同批次所有图使用相同素材/相对尺寸/边距，逐字节一致
    - ③ 成品写入 `output/branded/`，原图只读不改
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x]* 17.5 抽取 relogo 纯逻辑并为 Property 15 编写属性化测试
    - 将 `relogo.py` 中确定性的「残留字母块合并 bbox 选择」逻辑（种子选择 `corner_d` + 按 `Y_OVL`/`X_GAP`/`MAX_W` 护栏迭代合并）抽取为不依赖文件 I/O 与 `scipy` 的纯函数（输入为连通块 bbox 列表 + 画布宽，输出为合并 bbox / None），图像读写与连通域提取不纳入属性测试
    - **Property 15：残留 Logo 字母块合并正确**
    - 随机生成「最贴右上角种子块 + 同一垂直带且水平间距 ≤ `X_GAP` 的相邻字母块 + 一个 `y` 带明显不同的合法内容块」布局，断言合并 bbox 覆盖全部 OSL 字母块、且不含 `y` 带不同的内容块；生成器覆盖 `X_GAP`/`Y_OVL` 阈值上下边界与 `MAX_W` 护栏临界
    - 使用 Python `Hypothesis`（与脚本同语言）或将等价纯逻辑移植到 TS + `fast-check`，≥100 次迭代，注释标注 `Feature: markdown-image-prompt-pipeline, Property 15: 残留 Logo 字母块合并正确`
    - **Validates: Requirements 9.5, 9.6**

  - [x]* 17.6 为 Property 16 编写 Logo 合成位置与尺寸确定性属性化测试
    - 将 `relogo.py` 中放置尺寸/坐标计算（`logoW = round(width*0.08)`、`x = width - 60 - logoW`、`y = 60`）抽取为纯函数并测试
    - **Property 16：Logo 合成位置与尺寸确定性**
    - 随机生成任意宽高画布，断言 `logoW == round(width*0.08)`、坐标 `== (width-60-logoW, 60)`，且对相同画布尺寸结果完全一致（确定性、逐字节可复现）；生成器覆盖极小/超大画布与非 2048 宽画布
    - 使用 Python `Hypothesis` 或 TS + `fast-check`，≥100 次迭代，注释标注 `Feature: markdown-image-prompt-pipeline, Property 16: Logo 合成位置与尺寸确定性`
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.9**

- [x] 18. 检查点 —— Logo 后期合成全链路回归
  - 若已实现 Property 15/16 的属性化测试则运行之；端到端核对：对一组生成图运行 `relogo.py` 后，成品 Logo 落位一致（2048 画布下约 x[1827:1984] y[63:160]）、顶部边距区无残留绿、正文绿色内容处理前后 diff=0、成品写入 `output/branded/`、源图哈希不变
    - 同时记录人工视觉评审项：右上角留白是否干净、抠底素材边缘质量、Logo 是否遮挡正文内容（属视觉判断，归人工评审）
    - 确保所有（已实现的）测试通过，如有疑问请询问用户。
    - _Requirements: 9_

## 备注

- 标记 `*` 的子任务为可选（属性化测试、单元/集成测试、端到端脚本），可为快速 MVP 跳过，但建议执行以保证确定性逻辑可信。
- 每个任务引用具体的需求子条款以保证可追溯性。
- 检查点用于增量验证。
- 正确性属性现共 16 个（Property 1–16），一一对应设计中的属性，均 ≥100 次迭代并以注释标注 `Feature: markdown-image-prompt-pipeline, Property {N}: {属性文本}`：Property 1–14 使用 TypeScript + fast-check（`tools/validator`）；Property 15–16 针对 `relogo.py` 的纯逻辑，使用 Python `Hypothesis`（与脚本同语言）或等价移植到 TS + fast-check。
- 任务 1–11 为既有已完成工作（目录与指令产物、确定性校验库 Property 1–10、端到端脚手架）；任务 12–16 为需求 7（配图频率与位置控制）与需求 8（Alt 文本与图片说明）的实现与测试。
- 任务 17.x 为需求 9（Logo 后期合成）的新增工作：SKILL.md 的 Logo 预留指令与「阶段四」说明、Style_Guide 第 1 节改写、抠底脚本 `extract_logo.py` 与后期合成脚本 `relogo.py` 均**已完成**（标记 `- [x]`）；唯一尚未完成的是 Property 15/16 的自动化属性测试（17.5、17.6，可选 `*`），为当前唯一的待办项。
- **Logo 合成脚本为 Python（依赖临时 venv + `Pillow` + `scipy`），是独立于提示词流水线的纯图像后处理步骤，与 TS 校验库（`tools/validator`，fast-check）相互独立**；图像读写、`scipy` 连通域提取等 I/O 与三方库行为不纳入属性测试，由端到端/集成校验与人工视觉评审覆盖。
- Node.js 已安装，`tools/validator` 下可通过 `npm test` 实际运行 Property 1–14 全部属性化测试与端到端脚本。
- 语义类约束（数据研判、提示词文案忠实性、贴合度，以及需求 7.7 的信息增量、需求 8.3/8.4/8.6/8.8/8.9 的长尾关键词融入与忠于图意，AC 3.9/需求 9.1 的提示词留白措辞、需求 9.5/9.6 覆盖后的视觉自然度、抠底素材质量与 Logo 不遮挡内容）无确定性 oracle，由示例校验与人工评审覆盖，不在自动化属性测试范围内。
