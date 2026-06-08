# 需求文档

## 简介

本功能在 Kiro 项目中搭建一套**手动触发**的文章配图策划工作流，命名为「Markdown 智能配图提示词提取流水线」。当用户在 Kiro 对话框中手动触发指定的 Agent Skill 时，系统读取 `articles/` 目录下的目标 Markdown 文章，研判文章类型、梳理逻辑结构，并按照原文行文顺序生成一份专门用于第三方平台生图的提示词（Prompt）策划文档，归档到 `output/` 目录。

整个流水线遵循三阶段标准作业程序（SOP）：阶段一进行文章类型研判与结构梳理，并依据配图节奏（每 300–500 字以及文章结构转换处配图）确定配图数量与挂载位置；阶段二按段落数据特征生成对应的生图提示词，依据 `styles/` 目录下的风格定义文件赋予所有提示词统一的风格，并为每张配图附加 Alt 文本与图片说明等 SEO 元数据；阶段三进行规范化命名与存储。质量把控通过 `.kiro/steering/` 目录下的引导文件保证提示词忠于原文、不修改原文、输出结构清晰。

此外，为保证品牌 Logo 在每张配图上的尺寸、位置与字形完全一致，本功能采用 **Logo 后期合成（Logo_Compositing）** 机制：由于生图模型无法可靠执行「宽度 10% / 约 200px / 80px 边距」这类定量空间指令，且每张图重绘字标会导致 Logo 大小不一、字母错位或遮挡内容，因此生图提示词不再要求模型绘制 Logo，而是要求模型在图片右上角预留一块干净空白区（Logo_Reserve_Zone）；待图片生成后，再由确定性脚本将固定的透明底 Logo 素材（Logo_Asset）统一叠加到每张图片的右上角（详见需求 9）。

## 术语表

- **System（系统）**：指本配图提示词流水线的整体执行逻辑，由 Kiro 在用户手动触发 Agent Skill 后运行。
- **Pipeline（流水线）**：指依次执行三阶段 SOP 的完整工作流程。
- **Agent_Skill（技能）**：指用户在 Kiro 对话框中触发的「生成配图提示词」命令，是流水线的入口。
- **Article（原文章）**：指存放在 `articles/` 目录下、待处理的 Markdown 文档。
- **Article_Name（原文章名字）**：指原文章去除 `.md` 扩展名后的文件主名，例如 `AI趋势.md` 的 Article_Name 为 `AI趋势`。
- **Prompt_Document（配图提示词文档）**：指流水线在 `output/` 目录生成的 Markdown 文档，命名格式为 `[Article_Name]aimage.md`。
- **Image_Prompt（生图提示词）**：指针对某一段落或小标题生成的、用于第三方平台生成图片的文字描述。
- **Data_Rich_Segment（含详细数据段落）**：指被研判为包含详细数据或统计信息的文章段落。
- **Logic_Segment（纯逻辑段落）**：指被研判为不包含详细数据、以逻辑论述为主的文章段落。
- **Steering_Guide（引导文件）**：指存放在 `.kiro/steering/` 目录下、用于约束生成质量的 Markdown 指南文档。
- **Skills_Directory（技能目录）**：指 `.kiro/skills/` 目录，存放核心流水线技能文件。
- **Styles_Directory（风格目录）**：指 `styles/` 目录，用于专门存放风格定义文件（Style_Guide），即便该文件尚未提供也需预留此目录。
- **Style_Guide（风格定义文件）**：指存放在 `styles/` 目录下、由用户提供的 Markdown 文件，用于统一定义所有 Image_Prompt 应遵循的视觉风格（如配色、画风、构图基调等）。
- **Image_Slot（配图位置）**：指依据配图节奏在文章中选定的、需挂载一张配图的位置，对应原文中的某一段落或小标题；一个 Image_Slot 对应一条 Image_Prompt。
- **Hero_Image（题图）**：指放置在引言或开篇章节、承载全文核心主题与主关键词的概览型配图。
- **Alt_Text（Alt 文本）**：指写入图片 `<img>` 标签 `alt` 属性的替代文字，用于向读屏软件与搜索引擎/AI 爬虫说明配图内容。
- **Caption（图片说明）**：指显示在配图下方供读者阅读的文字说明，用于点明配图的看点或关键数据。
- **Long_Tail_Keyword（长尾关键词）**：指从文章标题、对应段落或小标题及原文关键术语中提炼的、用于提升检索可见性的具体关键词。
- **Logo_Asset（Logo 素材）**：指存放在 `assets/brand/OSL_logo.png` 的固定透明底 OSL 文字 Logo 图片素材，由品牌源文件经抠底处理（裁切到字形、移除深色背景、统一为品牌绿 `#B3FF38`、带抗锯齿透明通道）生成，用于后期合成阶段叠加到配图上。
- **Logo_Compositing（Logo 后期合成）**：指在图片生成完成后，由确定性脚本将 Logo_Asset 以统一尺寸与位置叠加到每张配图上的处理过程，使生图模型不再负责绘制 Logo。
- **Logo_Reserve_Zone（Logo 预留区）**：指生图提示词要求模型在图片右上角预留的、不放置任何文字、字母、字标或图形的干净空白区域，专供 Logo 后期合成叠加 Logo_Asset 使用。
- **Branded_Output（合成产物目录）**：指存放经 Logo 后期合成后成品图片的专用输出目录 `output/branded/`。

## 需求

### 需求 1：项目目录结构初始化

**用户故事：** 作为项目使用者，我希望在首次运行或触发流水线时系统自动准备好所需目录，以便文章、引导文件、技能文件和输出文档各归其位。

#### 验收标准

1. WHEN 用户首次运行初始化命令或手动触发 Pipeline，THE System SHALL 检查 `articles/`、`.kiro/steering/`、`.kiro/skills/`、`styles/`、`output/` 五个目录是否存在。
2. IF 上述任一目录不存在，THEN THE System SHALL 创建缺失的目录。
3. WHERE 目标目录已存在，THE System SHALL 保留该目录内的现有文件不变。
4. WHEN 目录结构检查与创建完成，THE System SHALL 向用户报告每个目录的就绪状态。

### 需求 2：阶段一 —— 文章类型研判与结构梳理

**用户故事：** 作为内容创作者，我希望系统先读取并理解我的文章，判断其数据特征并梳理逻辑结构，以便后续生成贴合内容的配图提示词。

#### 验收标准

1. WHEN 用户在 Kiro 对话框中对某篇 Markdown 文章触发 Agent_Skill，THE System SHALL 读取 `articles/` 目录下用户指定的目标 Article。
2. IF 用户指定的目标 Article 在 `articles/` 目录下不存在，THEN THE System SHALL 返回一条说明文件未找到的错误信息并终止本次执行。
3. WHEN 目标 Article 读取完成，THE System SHALL 分析文章内容并判断该文章及其各段落是否包含详细数据或统计信息。
4. WHEN 文章内容分析完成，THE System SHALL 梳理文章的逻辑结构与关键节点，作为后续依据需求 7 确定 Image_Slot 的依据。
5. WHEN 段落被研判为包含详细数据，THE System SHALL 将该段落标记为 Data_Rich_Segment。
6. WHEN 段落被研判为不包含详细数据，THE System SHALL 将该段落标记为 Logic_Segment。
7. WHEN 文章逻辑结构梳理完成，THE System SHALL 依据需求 7 定义的配图节奏在原文中确定一组 Image_Slot，并仅为这些 Image_Slot 所对应的段落或小标题提取用于生图的上下文信息。

### 需求 3：阶段二 —— 图片提示词策略生成

**用户故事：** 作为内容创作者，我希望系统根据每个段落的数据特征生成不同类型的生图提示词，以便数据段落配数据可视化图、论述段落配概念表达图。

#### 验收标准

1. WHEN 某段落被标记为 Data_Rich_Segment，THE System SHALL 为该段落生成适用于数据可视化的 Image_Prompt（如数据图表、信息图表、量化对比图）。
2. WHEN 某段落被标记为 Logic_Segment，THE System SHALL 为该段落生成适用于概念表达的 Image_Prompt（如逻辑对比图、概念思维导图、场景插画）。
3. THE System SHALL 为每个 Image_Slot 生成且仅生成一条 Image_Prompt，且 Image_Prompt 的图片类型依据该 Image_Slot 对应段落的 Data_Rich_Segment 或 Logic_Segment 标记确定。
4. THE System SHALL 为每条 Image_Prompt 记录其对应的段落或小标题、图片类型和具体的画面/图表描述。
5. THE System SHALL 确保每条 Image_Prompt 的画面/图表描述内容仅来源于原文已有信息。
6. WHEN System 开始生成 Image_Prompt，THE System SHALL 从 `styles/` 目录加载 Style_Guide。
7. WHERE Style_Guide 存在于 `styles/` 目录，THE System SHALL 使生成的每一条 Image_Prompt 应用 Style_Guide 中定义的统一风格。
8. IF `styles/` 目录下不存在 Style_Guide，THEN THE System SHALL 在不应用统一风格的情况下继续生成 Image_Prompt，并向用户报告 Style_Guide 缺失的状态。
9. THE System SHALL 在每条 Image_Prompt 中加入需求 9 定义的 Logo_Reserve_Zone 预留指令，并避免要求生图模型绘制 OSL Logo、字标、字母或文字。

### 需求 4：阶段三 —— 规范化输出与存储

**用户故事：** 作为内容创作者，我希望系统将全部配图提示词按行文顺序结构化地保存为一份命名规范的文档，以便我直接复制使用。

#### 验收标准

1. WHEN 全文的 Image_Prompt 生成完毕，THE System SHALL 在 `output/` 目录下创建一个新的 Prompt_Document。
2. THE System SHALL 按照 `[Article_Name]aimage.md` 的格式命名 Prompt_Document（例如 Article_Name 为 `AI趋势`，则文件名为 `AI趋势aimage.md`）。
3. THE System SHALL 在 Prompt_Document 中按照原文章的行文顺序列出所有 Image_Prompt。
4. THE System SHALL 为每一条 Image_Prompt 在文档中包含对应段落或小标题、图片类型、以及具体的画面/图表描述三项内容。
5. THE System SHALL 为每一条 Image_Prompt 在文档中额外包含需求 8 定义的 Alt_Text 与 Caption 两项内容。
6. IF `output/` 目录下已存在同名 Prompt_Document，THEN THE System SHALL 在覆盖前向用户提示存在同名文件。
7. WHEN Prompt_Document 写入完成，THE System SHALL 向用户报告输出文件的完整路径。

### 需求 5：质量把控引导文件加载

**用户故事：** 作为项目使用者，我希望系统在执行工作流时自动遵循质量把控规则，以便生成的提示词忠于原文、结构清晰、可直接复用。

#### 验收标准

1. WHEN System 执行 Pipeline，THE System SHALL 加载 `.kiro/steering/` 目录下的 Steering_Guide。
2. THE System SHALL 确保提取的 Image_Prompt 高度忠于原文信息。
3. THE System SHALL 仅依据原文已有信息生成 Image_Prompt，避免引入原文未包含的内容。
4. THE System SHALL 使输出的 Prompt_Document 结构清晰、易读，便于用户直接复制 Image_Prompt 前往第三方平台生图。

### 需求 6：原文保护

**用户故事：** 作为内容创作者，我希望系统在整个流程中完全不改动我的原文章，以便原始素材始终保持完整可信。

#### 验收标准

1. WHILE Pipeline 执行期间，THE System SHALL 以只读方式访问 `articles/` 目录下的 Article。
2. THE System SHALL 保持 `articles/` 目录下每篇 Article 的内容与执行前完全一致。
3. THE System SHALL 将所有生成内容写入 `output/` 目录，而非 `articles/` 目录。

### 需求 7：配图频率与位置控制

**用户故事：** 作为内容创作者，我希望系统按字数节奏与文章结构来决定配几张图、配在哪，而非机械地每段一图，以便配图密度合理、既不干扰阅读也不错失视觉化机会。

#### 验收标准

1. WHEN System 梳理文章结构，THE System SHALL 在每个 H2 标题处及每个章节主题切换处设置一个 Image_Slot。
2. IF 相邻两个 Image_Slot 之间的正文超过 500 字，THEN THE System SHALL 在该区间内的一个语义边界处增设一个 Image_Slot。
3. WHERE 某 H2 章节正文不足 300 字且与相邻章节主题连续，THE System SHALL 将该章节与相邻章节合并为一个 Image_Slot。
4. THE System SHALL 在引言或开篇章节设置一个 Image_Slot，并将其对应的 Image_Prompt 标记为 Hero_Image。
5. WHEN System 统计触发字数，THE System SHALL 仅计入正文文字，并将代码块、表格、引用块、参考文献与 FAQ 列表排除在触发字数之外。
6. WHERE 文章包含 FAQ 等结构化区块，THE System SHALL 依据主题切换规则为该区块按需设置 Image_Slot。
7. THE System SHALL 确保每个 Image_Slot 承担独立的信息增量，并避免为同一组数据或同一论点设置多个 Image_Slot。
8. THE System SHALL 依据上述规则确定的 Image_Slot 总数决定生成的 Image_Prompt 数量及其在原文中的挂载位置。

### 需求 8：图片 SEO 元数据——Alt 文本与图片说明

**用户故事：** 作为内容创作者，我希望系统为每张配图生成 Alt 文本与图片说明并自然融入长尾关键词，以便搜索引擎与 AI 爬虫能够理解配图内容并提升文章的检索可见性。

#### 验收标准

1. THE System SHALL 为每一条 Image_Prompt 生成一项 Alt_Text 与一项 Caption。
2. THE System SHALL 将 Alt_Text 控制在 125 个字符以内。
3. THE System SHALL 在 Alt_Text 中自然融入 1 至 2 个 Long_Tail_Keyword。
4. THE System SHALL 使 Alt_Text 忠于配图与原文内容，仅描述配图中确实存在的主体与结论。
5. THE System SHALL 使 Alt_Text 以描述配图主体的文字开头，而非以「图片」或「image of」之类词语开头。
6. THE System SHALL 使 Caption 点明配图的看点或关键数据，并使其信息比对应的 Alt_Text 更完整。
7. THE System SHALL 在 Caption 中自然融入 Long_Tail_Keyword，并使 Caption 与对应的 Alt_Text 互补而非内容重复。
8. WHERE 配图对应原文中标注了数据来源的内容，THE System SHALL 在 Caption 中标注该数据来源。
9. THE System SHALL 仅从文章标题、对应段落或小标题及原文关键术语中提炼 Long_Tail_Keyword，不引入原文未包含的关键词。

### 需求 9：Logo 后期合成

**用户故事：** 作为品牌内容运营者，我希望 OSL Logo 由后期脚本统一叠加而非由生图模型绘制，以便每张配图上的 Logo 尺寸、位置与字形完全一致，避免出现大小不一、字母错位或遮挡正文内容的问题。

#### 验收标准

1. WHEN System 生成 Image_Prompt，THE System SHALL 在 Image_Prompt 中要求生图模型在图片右上角预留一块干净空白的 Logo_Reserve_Zone，并避免要求生图模型在该区域绘制任何 OSL Logo、字标、字母或文字。
2. WHEN 一张配图生成完成，THE System SHALL 将固定的透明底 Logo_Asset 叠加到该配图的右上角，叠加后的 Logo 宽度等于图片宽度的 8%。
3. WHEN System 叠加 Logo_Asset，THE System SHALL 将 Logo_Asset 置于距图片顶边 60 像素、距图片右边 60 像素的位置。
4. THE System SHALL 对同一批次的所有配图使用相同的 Logo_Asset、相同的相对尺寸与相同的边距，使每张配图上 Logo 的尺寸、位置与字形保持一致。
5. WHERE 生成的配图在右上角仍残留生图模型自绘的 Logo，THE System SHALL 使用该残留 Logo 紧邻区域的局部背景颜色覆盖该残留 Logo。
6. WHILE 覆盖残留 Logo，THE System SHALL 保持配图中的合法非 Logo 内容（绿色数据标签、表格表头、分隔线及图表元素）不被改动。
7. WHEN System 完成 Logo 后期合成，THE System SHALL 将合成后的成品图片写入 Branded_Output 目录（`output/branded/`）。
8. WHILE 执行 Logo 后期合成，THE System SHALL 以只读方式访问原始生成的图片，并保持原始生成图片的内容不变。
9. THE System SHALL 使同一批次所有配图上叠加的 Logo 在尺寸、位置与字形上逐字节一致。
