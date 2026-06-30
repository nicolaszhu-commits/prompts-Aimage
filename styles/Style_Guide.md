# OSL 配图统一风格指南（Style_Guide）

> 用途：本文件是「Markdown 智能配图提示词提取流水线」的统一风格定义文件。技能 `/生成配图提示词` 在阶段二会加载本文件：按第 8 节「配图频率」控制出图数量与位置，按第 9 节为每张图补充 Alt 文本与图片说明（Caption），并把第 10 节「统一风格描述（可复制后缀）」追加到**每一条** Image_Prompt 的画面/图表描述中，确保整篇配图风格一致。
>
> **重要：Logo 后期合成。** OSL Logo **不由生图模型绘制**——提示词要求右上角预留干净空白，出图后由脚本（`tools/logo/relogo.py`）叠加固定的透明底 Logo 素材（`assets/brand/OSL_logo.png`），以保证每张图 Logo 尺寸/位置/字形绝对一致。详见第 1 节。
>
> 适用品牌：OSL。核心视觉：霓虹绿「OSL」文字 Logo（后期合成） + 深底 2D 扁平数据新闻信息图。
>
> 本指南第 5 节起的「可复用要素」基于对 `styles/` 目录内 7 张参考图的**实际视觉分析**提炼（6 张 OSL 品牌图 + 1 张 Binance Research 图，后者作为数据新闻图表的排版参考）。

---

## 1. Logo 规范（强约束）—— 后期合成，生图阶段不绘制 Logo

> **关键原则（必须遵守）**：OSL Logo **不由生图模型绘制**，而是出图后由脚本叠加固定的透明底 Logo 素材（见第 1.1 节）。原因：扩散模型无法精确执行「10% 宽 / 200px / 80px 边距」这类定量空间指令，且每张图重新「现画」字标会导致**大小不一、字母错位/残缺**等问题。把 Logo 从生图环节剥离、交给确定性脚本，才能保证每张图 Logo 尺寸/位置/字形**绝对一致**。

- **Logo 素材**：霓虹绿「OSL」文字字标（纯文字，无图形符号），透明底 PNG，固定文件 `assets/brand/OSL_logo.png`（由品牌源文件 `Dark background Brand color logo.png` 抠底生成）。
- **主色值**：HEX `#B3FF38`；RGB `179, 255, 56`；CMYK `37, 0, 85, 0`。
- **位置**：画面**右上角**（absolute top-right corner），是画面唯一的品牌标识。
- **尺寸**：Logo 宽度 = 整图宽度的 **8%**（在 2048×1152 画布上约 164px 宽）。
- **边距**：距顶边与右边各留 **60px** 外边距（2048×1152 画布基准）。
- **形态**：干净的霓虹绿 OSL 文字，纯 2D，无发光、无阴影、无描边特效（素材本身即如此）。
- **唯一品牌标识（强约束）**：成品图**仅**在右上角有这一个品牌标识。**严禁出现「OSL Research」字样**（任何位置），也不放置其他研究品牌署名。
- **不标注数据来源（强约束）**：图内**不放置任何「Source」/数据来源标注**（数据来源由用户在正文文字中补充，不进入图片与提示词）。

### 1.1 生图阶段的 Logo 处理（强约束）

- **生图提示词中绝不要求绘制 Logo**：相反，明确要求模型**在右上角预留一块干净的空白区（约整图右上 12–14% 宽 × 18–20% 高、不超过此范围），其中不放置任何文字、字母、字标或图形**——为后期叠加 Logo 留白。
- **预留区是右上角一个有界小块，不是整条右边栏（强约束）**：该预留区**仅限右上角那一小块**（约 12–14% 宽 × 18–20% 高）。**严禁**因此把整条右侧留空、或把主视觉与标题整体推挤到左半边——主视觉应在画布上**自然居中、均衡布局**，只需避开右上角那一小块。措辞要中性，**不写**「主视觉避开右上角」「整体左移」这类会诱导模型把内容堆向左侧的表述，也**不写**「充分利用右侧空间」这类会诱导模型把右侧填满的反向表述。
- **预留区必须是「纯背景」**：该区域只能是单一实色背景，**不得有任何元素侵入**，包括但不限于：卡片/容器的描边或边框线、表格分隔线、坐标轴、虚线网格、图例、图标、箭头、数据标签、连接线、色块边缘。线框/描边即便只是「擦边经过」右上角也不允许——必须把这些元素整体内缩、避开预留区。
- **为何要量化且有上界**：实测发现，仅说 "top-right corner" 不够（扁画幅元素挤，线框常擦进右上角）；但用「至少 14%×20%」这种开口向上的措辞又会让模型矫枉过正、留出整条右边栏导致构图失衡。正确做法是给一个**有界小块**（约 12–14% 宽 × 18–20% 高、不超过），既容下后期 Logo（宽=画宽 8%、距顶/右 60px，落于右上约 8% 宽 × 9% 高），又不会让右侧大片空着。
- **提示词应包含的负向约束**：`keep only a small bounded reserve area in the absolute top-right corner — roughly the top-right 12–14% width × 18–20% height, no larger — as clean solid-color empty background with no 'OSL' logo, wordmark, letters, text, card borders, frame lines, dividers, axes, gridlines, icons, arrows or data labels entering or grazing it; this reserve is only that small top-right corner block, NOT an empty right-hand column — do not leave the whole right side blank or push all content to the left; the area is reserved for a logo composited in post-production.`
- 这样可彻底避免模型自绘 Logo 带来的「大小不一 / OS 错位 / 字母残缺 / 遮挡内容」、右上角线框与后期 Logo 堆叠，以及「留白过大、右侧大片空置」等问题。

### 1.2 后期合成流程（确定性，由脚本执行）

出图后用 `tools/logo/relogo.py` 批量叠加固定 Logo（依赖临时 Python venv + Pillow + scipy）。**目录约定（输入 / 输出分离）**：把第三方平台出的「无 Logo 原图」放进 `output/branded/_nologo/`，脚本将「已叠加 Logo 的成品」写入 `output/branded/_logo/`；原图只读留在 `_nologo/`，可随时安全重跑。

1. **读取无 Logo 原图**：从 `output/branded/_nologo/` 只读读取每张图（缺省处理目录内全部 PNG，也可用 `--files` 指定）。
2. **（兜底）清除残留旧 Logo**：若某图右上角仍被模型画了 Logo，脚本用连通域定位「最贴右上极角」的种子绿块，并合并同一垂直带、水平间距很小的相邻字母块，得到完整「OSL」bbox，用其紧邻的局部背景中位数色覆盖。**贴角护栏**：仅当合并块紧贴右上极角时才判为残留 Logo；y 带不同的绿色正文内容（数据标签、绿表头、绿框、分隔线）绝不覆盖。
3. **叠加固定 Logo**：把 `assets/brand/OSL_logo.png` 缩放到「画宽 8%」，置于右上角、距顶/右各 60px，alpha 合成。
4. **输出到 `output/branded/_logo/`**，原图只读不改。
5. **自检**：所有成品 Logo 落位一致（2048 画布下约 x[1827:1984] y[63:160]）、顶部边距区无残留绿、正文绿色内容处理前后 diff=0。

> 抠底素材生成脚本：`tools/logo/extract_logo.py`（一次性，已产出 `assets/brand/OSL_logo.png`）。

> 英文原始约束（供生图平台直接使用，强调"留白、不画 Logo、线框勿入"）：
> Reserve a small, bounded, clean solid-color empty area in the top-right corner — roughly the top-right 12–14% width × 18–20% height, no larger — with no text, letters, wordmark or graphics of any kind, and no card borders, frame lines, dividers, axes, gridlines, icons, arrows or data labels entering or grazing it. This reserve is only that small top-right corner block, NOT an empty right-hand column — do not leave the whole right side blank or push content to the left. This space is reserved for an OSL logo composited in post-production. Do NOT draw or render any 'OSL' logo or lettering anywhere in the image.

---

## 2. 全局视觉风格（强约束）

- **整体风格**：严格的 2D 扁平设计（flat design）、极简的企业级金融研究信息图（minimalist corporate financial research infographic），数据新闻（data journalism）美学。
- **明确禁止（negative constraints，必须遵守）**：
  - ❌ 任何 3D 元素（no 3D elements）
  - ❌ 投影 / 阴影（no drop shadows）
  - ❌ 霓虹辉光 / 发光晕染（no glowing neon blooms）
  - ❌ 渐变（no gradients）
- **背景**：纯色、极深的藏青/森林绿（very dark navy / forest green，近乎黑色），单一实色。参考图实测背景为「极深藏青」与「纯黑」两类，均为单一实色、无渐变。
- **字体**：统一使用 **Inter 字体家族**（Inter font family）——清晰锐利的几何无衬线字体。按文本层级匹配不同的 Inter 字重/字号/颜色（详见第 5 节字体层级表）。
- **画幅与分辨率**：宽高比 16:9，4K 分辨率（如 3840×2160；版式基准画布 2048×1152）。

> 英文原始约束（供生图平台直接使用）：
> A strictly 2D flat design, minimalist corporate financial research infographic. Absolutely no 3D elements, no drop shadows, no glowing neon blooms, and no gradients. The background is a solid, very dark navy/forest green (almost black). The color palette is strictly restricted to vibrant neon lime green (primary accent), muted matte gold (secondary accent), pure white (primary text), and light grey (secondary lines). All text uses the Inter font family: bold Inter headline, medium Inter subtitle, regular Inter body/data labels, and small light-grey Inter annotations. Reserve a small, bounded, clean solid-color empty area in the absolute top-right corner — roughly the top-right 12–14% width × 18–20% height, no larger — with no text, letters, wordmark or graphics, and no card borders, frame lines, dividers, axes, gridlines, icons, arrows or data labels entering or grazing it; this reserve is only that small top-right corner block, NOT an empty right-hand column — do not leave the whole right side blank or push content to the left; the area is reserved for a logo added in post-production — do NOT draw any 'OSL' logo or lettering. Aspect ratio 16:9, 4k resolution, data journalism aesthetic.

---

## 3. 配色规范

调色板**严格受限**为以下四类（不得引入规定之外的颜色）：

| 角色 | 颜色 | 取值 | 来源 |
| --- | --- | --- | --- |
| 主强调色（primary accent） | 霓虹青柠绿 / vibrant neon lime green | HEX `#B3FF38`，RGB `179 255 56`，CMYK `37 0 85 0` | 用户提供（精确值） |
| 次强调色（secondary accent） | 哑光金 / muted matte gold | 观察估计约 `#BE9A5A`～`#C2A36B`（哑光、低饱和暖金，非高光金） | 参考图实测估计 |
| 主文字色（primary text） | 纯白 / pure white | `#FFFFFF` | 用户描述 + 参考图实测 |
| 次级线条色（secondary lines） | 浅灰 / light grey | 观察估计约 `#8A99A6`（分隔线、坐标轴、虚线网格、次级标注） | 参考图实测估计 |
| 背景色（background） | 极深藏青/森林绿（近黑）或纯黑 | 观察估计约 `#0A1B2A`（深藏青）/ `#000000`（纯黑） | 参考图实测估计 |

> 说明：表中**仅霓虹绿为用户提供的精确值**；哑光金、浅灰、深色背景的取值为我**从参考图像素观察得到的估计值**，用于辅助生图，并非官方品牌精确色。如需固定为官方值，请提供精确 HEX，我会回填本表。

**用色层级（实测规律）**：
- 霓虹绿是唯一的主强调色，**用于「OSL 视角的优胜项 / 关键结论 / 关键数据 / 主图元」**：例如对比表中代表 Stablecoin 的列、柱状图的柱体、流程步骤的高亮、地图上的本地稳定币节点、USDC（被定位为合规首选的一方）。绿色保持稀缺、点睛，不大面积铺色。
- 哑光金作为次强调，**用于「被对比的另一方 / 次级数据系列」**：例如 USDT 一方、世界地图的迁徙箭头与亚欧大陆色块。绿 vs 金常用来区分一组对立实体。
- 纯白承载主标题与主要数据标签。
- 浅灰用于副标题、分隔线、坐标轴与虚线网格（不用于 Source 署名行——图内不标来源）。

---

## 4. 版式与构图（实测规律）

- **基准画布**：2048×1152（16:9）；输出 4K（3840×2160）。
- **稳定布局栅格**：
  - 左上：主标题（白色粗体）。**此处不放任何「OSL Research」署名**。
  - 右上：**预留干净空白区（约右上 12–14% 宽 × 18–20% 高、不超过此范围），生图阶段不绘制任何 Logo/文字**；成品 Logo 由后期脚本叠加（宽 8%、距顶/右 60px，见第 1 节）。主体内容、卡片描边、线框、分隔线、坐标轴、图标等**任何元素都不得侵入或擦边**该右上预留区。该预留区**仅是右上角一小块，不是整条右边栏**——不得因此把右侧整片留空或把主视觉推挤到左半边。
  - 中部：核心图表/信息图主体，居中铺排，对齐清晰栅格。
  - 左下/右下：**不放任何「Source」数据来源标注，也不放「OSL Research」或任何其他署名**（来源由用户在正文补充）。
- **留白**：信息密度适中、模块之间留足呼吸空间；元素严格对齐，边界利落。
- **基调**：冷静、专业、克制的金融研究/数据新闻气质，信息清晰度第一。

---

## 5. 标题与文案语气（实测规律）

- **主标题**：短促、陈述句、常为两段式并以句号收尾，形成节奏感。实测样例：
  - 「Local instruments. Global settlement.」
  - 「The same payment. Different infrastructure.」
  - 「The infrastructure comparison that changes the conversation.」
- **副标题/标语**：紧随主标题下方一行小字，凝练点题。实测样例：「From experimental to essential.」「Two instruments. Different strategic profiles.」「The framework that separates operators from gamblers.」
- **标题用色**：以纯白为主；可将关键词单独染成霓虹绿做强调（如标题中的「Global settlement.」「USDC」）。
- 文案保持机构研究口吻，简洁、笃定，不堆砌形容词。

### 5.1 字体层级规范（Inter 字体家族）

全图统一使用 **Inter 字体家族**。按文本层级匹配以下字重、相对字号与颜色（字号以 2048×1152 基准画布为参考，等比缩放到 4K）：

| 层级 | 字体 / 字重 | 字号（@2048 基准） | 颜色 | 用法 |
| --- | --- | --- | --- | --- |
| **主标题（Title）** | Inter Bold（700）/ 可用 Extra-Bold 800 | 约 72–96px | 纯白 `#FFFFFF`，关键词可染霓虹绿 `#B3FF38` | 左上主标题，短促陈述句 |
| **子标题 / 副标题（Subtitle）** | Inter Medium（500）/ Semi-Bold（600） | 约 32–40px | 浅灰 `#8A99A6` | 主标题下方一行点题小字 |
| **正文 / 数据标签（Body / Data label）** | Inter Regular（400）/ Medium（500） | 约 24–30px | 纯白 `#FFFFFF`（关键数据可染霓虹绿） | 图表数据标签、卡片正文、轴上数值 |
| **标注 / 注解（Annotation / Caption）** | Inter Regular（400）/ Light（300） | 约 18–22px | 浅灰 `#8A99A6` | 坐标轴标题、图例、脚注式说明、次级注解 |

- 字重对比要清晰：标题 Bold、子标题 Medium、正文 Regular、标注 Light/Regular，形成稳定的视觉层级。
- 颜色沿用第 3 节调色板：白色承载标题与主数据，浅灰承载子标题与标注，霓虹绿仅用于关键词/关键数据点睛。
- 字间距（letter-spacing）保持紧凑利落，行距适中；全图字体风格统一为 Inter，不混入其他字族。
- 中文文本若出现，使用与 Inter 气质一致的几何无衬线中文字体（如思源黑体 / 苹方风格），字重层级比照上表。

---

## 6. 图标与图元规范（实测规律）

- **线性图标（line icons）**：细描边、单色（霓虹绿或白）、极简，常见主体：人物、银行/机构、盾牌、放大镜、烧瓶、柱状增长、靶心、天平、数据库、闪电、时钟、齿轮/列表。统一描边粗细，无填充或仅扁平填充。
- **步骤编号**：霓虹绿实心圆内置深色数字，或绿色描边圆；步骤间用绿色箭头连接。
- **卡片/容器**：细描边矩形（绿色或浅灰），圆角克制；高亮模块用霓虹绿实色填充块 + 深色文字（如「STABLECOIN PAYMENT」标签、对比表头）。
- **箭头/连线**：流程用直角或直线绿色箭头；地理迁徙用平滑曲线金色箭头。
- 一切图元均为扁平矢量，无立体、无投影、无发光。

---

## 7. 可复用图表类型（实测，按内容选型）

OSL 这套内容中反复出现、可直接复用的图表「词汇」：

1. **框架流程图（Framework Flowchart）**——参考 `Corridor Validation Framework`。横向 N 步（编号圆 + 标题 + 线性图标 + 一句说明），下方附「原则条」横排（图标 + 词条 + 短释）。适合机制/流程/方法论类「概念表达」。
2. **全球结算世界地图（Global Settlement World Map）**——参考 `Local instruments. Global settlement.`。深底世界地图，陆块以白/哑光金区分，霓虹绿圆点标本地节点（带 ticker），金色曲线箭头表迁徙/走廊，左下角图例。适合跨境/全球分布/网络类主题。
3. **多列对比表（Comparison Table）**——参考 `infrastructure comparison`。行=对比维度，列=对比对象；OSL 优选列整列染霓虹绿文字，其余列白色；细浅灰横向分隔线。适合多维度逐项对比。
4. **左右分栏对比信息图（Head-to-head Infographic）**——参考 `The same payment. Different infrastructure.` 与 `USDC vs USDT`。左右两栏分别代表对立双方，一方霓虹绿、一方哑光金/灰；顶部色块标签 + 中部要点行（线性图标）+ 底部「结论指标」圆角块（步骤数/耗时/费用等）。适合「旧 vs 新」「A vs B」叙事。
5. **柱状图 / 时间序列（Bar Chart）**——参考 `Stablecoin Adjusted Payment Volume Growth 2022-2025`。霓虹绿实心柱，白色数据标签置于柱顶，浅灰虚线水平网格，X 轴年份、Y 轴单位标注（如 USD/T）；图内不标 Source。适合规模、增长、年度量化趋势。
6. **折线对比图（Line Chart）**——参考第 1 张 Binance Research 图的**排版范式**（注意其为金色单色 + 纯黑，属他牌配色）：清爽折线、顶部图例、左侧 Y 轴单位、底部年份；图内不标 Source。OSL 化时应改用「霓虹绿（主序列）+ 哑光金（对比序列）」于深底之上，品牌标识仅保留右上角 OSL 字标（不照搬其右下角他牌署名）。适合两序列长期走势对比。

**与流水线分类的对应建议**：
- `Data_Rich_Segment`（数据段落）→ 优先：柱状图/时间序列、折线对比图、对比表、对比信息图。
- `Logic_Segment`（逻辑段落）→ 优先：框架流程图、世界地图（分布/网络）、左右分栏对比、概念示意。

### 7.1 图表数值准确性强约束（避免比例失真）

为防止生图模型把数值画错、产出与坐标轴对不上的失真图表，凡涉及坐标轴的数据可视化必须遵守：

- **双轴规则（数量级差异）**：当一张图**并列两个数量级差异较大的指标**（如「市值（十亿/B 级）」与「交易量（万亿/T 级）」相差约 10 倍以上）时，**必须使用双纵轴**——左轴一个量纲、右轴另一个量纲，各自独立刻度并分别标注单位；**每根柱/每条线按各自的轴测量高度**，**严禁共用同一条单轴**。共用单轴会让模型把 `$189B` 误当 `≈1.9T` 画到接近 `2T` 的高度，造成数值与纵轴对不上。
- **轴—数值一致性自检**：提示词应包含可校验的落位描述（例如「`$189B` 必须落在左轴 200B 刻度附近，而非 2T 附近」「`$76B` 是一根明显矮柱」），让出图后能逐条核对柱高与标签数值是否吻合。
- **图例与读法**：双轴图必须给图例标明「哪种颜色读哪条轴」（如绿=市值（左轴）、金=交易量（右轴）），并提示两轴柱高不可跨轴直接比较。
- **单位统一**：同一条轴上的所有刻度与数据标签使用同一单位量纲（全 B 或全 T），不在同一轴混用 B 与 T。
- **不臆造刻度**：坐标轴刻度只能反映原文确有的数值范围；不得为定性示意图发明数值轴（详见 `.kiro/steering/image-prompt-quality.md` 规则二）。

> 备注：第 1 张 `Binance Research` 图为**他牌参考**（纯黑底 + 全金色），其品牌与配色不属于 OSL 体系，仅借鉴其「数据新闻图表」的干净排版（图例/轴标布局）。OSL 出图一律改用本指南第 3 节的绿/金/白/灰调色板，且**图内不照搬其 Source 署名**。

---

## 8. 配图频率与位置（出图节奏，强约束）

控制配图密度，避免过密（干扰阅读、拖慢页面）或过疏（错失视觉化与 SEO 机会）。流水线在阶段一梳理结构时即据此确定**配几张、配在哪**。

- **基准节奏**：每 **300–500 字**出现一张配图；同时在**文章结构发生转换处**（如新的 H2 标题、章节主题切换）优先配图。
- **两条规则取并集再去重**：先按 H2/主题切换布点，若相邻两图之间正文超过约 500 字，则在中间的合适语义边界（如 H3 小节、关键数据段）补 1 张；若某 H2 章节很短（不足约 300 字）且与相邻章节主题连续，可合并为 1 张，不必每个小标题都配。
- **首图**：建议在引言/开篇章节配 1 张概览型图作为「题图」（hero image），承载全文核心主题与主关键词。
- **去冗余**：同一组数据或同一论点不重复配图；每张图必须承担独立的信息增量。
- **数量自检**：成稿配图数 ≈ 全文正文字数 ÷ 400（上下浮动），且大致等于「H2/主题切换数 + 必要的长章节补充」。
- 该节奏决定**生成多少条 Image_Prompt 及其挂载位置**；具体每条仍遵循第 2–7 节的视觉规范与第 9 节的元数据要求。

> 说明：字数节奏针对正文文字，代码块、表格、引用块、参考文献与 FAQ 列表等不计入触发字数；FAQ 等结构化区块按「主题切换」规则按需配 1 张即可。

---

## 9. Alt 文本与图片说明（SEO 元数据，强约束）

搜索引擎与 AI 爬虫主要「读代码」而非「看图」，因此每张配图都必须随附**精炼、忠于图意**的文字元数据，并自然融入长尾关键词，提升可被检索与被理解的程度。每条 Image_Prompt 在输出文档中除三字段外，**额外提供以下两项**：

- **Alt 文本（alt text）**：
  - 写进 `<img>` 的 `alt` 属性，描述「图里有什么、在讲什么」，供读屏软件与爬虫理解。
  - 长度建议 **≤ 125 个字符**（约 15 词内），一句话讲清图的主体与结论。
  - **自然融入 1–2 个长尾关键词**，禁止关键词堆砌；语义通顺优先。
  - 忠于图与原文，不臆造图中不存在的信息；不以「图片」「image of」开头。
- **图片说明 / Caption**：
  - 显示在图片下方供读者阅读的一句话，可比 Alt 略长、信息更完整，点明图的看点或关键数据。
  - 同样自然融入长尾关键词。
  - 与 Alt 互补、不简单照抄。
  - **不在图片说明中标注数据来源（Source）**：数据来源由用户在正文文字中统一补充，提示词与图片说明均不出现 Source。

- **长尾关键词来源**：从文章标题、对应段落/小标题、原文关键术语中提炼（如本项目素材中的「USD1 stablecoin」「stablecoin depeg」「cross-border stablecoin settlement」「USDC vs USDT」等），**仅使用原文确有或与原文主题强相关的词**，不编造。
- **输出位置**：在每条 Image_Prompt 条目内，于「画面/图表描述」之后追加 `Alt 文本：…` 与 `图片说明：…` 两行；不改变第 10 节既有三字段结构，只做信息增补。
- **来源处理（强约束）**：图内、画面描述、Alt 文本、图片说明**均不得出现任何「Source」/数据来源标注**；数据来源由用户在正文文字中补充。

> 示例（形式示意）：
> - **Alt 文本**：USD1 储备结构信息图，展示现金与短期美债如何支撑其美元 1:1 锚定
> - **图片说明**：USD1 稳定币的储备背书机制——现金与短久期美国国债共同支撑 1:1 美元锚定

---

## 10. 统一风格描述（可复制后缀）

> 流水线会把以下文本追加到每一条 Image_Prompt 的描述末尾，确保整篇风格统一。提供中英双版；面向第三方生图平台时**建议优先使用英文版**。

**中文版：**

> 统一风格：严格 2D 扁平设计的极简企业级金融研究信息图，数据新闻美学；宽高比 16:9、4K 分辨率；背景为单一实色的极深藏青（近黑）或纯黑；调色板严格限定为霓虹青柠绿（`#B3FF38`，主强调，用于关键结论/关键数据/主图元）、哑光金（次强调，用于被对比的另一方/次级序列）、纯白（主标题与数据标签）、浅灰（副标题/分隔线/坐标轴/虚线网格）；全图文字统一使用 **Inter 字体家族**，按层级区分——主标题 Inter Bold（纯白，关键词可染霓虹绿）、子标题 Inter Medium（浅灰）、正文/数据标签 Inter Regular（纯白，关键数据可染霓虹绿）、标注/注解 Inter Light 或 Regular（浅灰）；细描边单色线性图标；绝不使用 3D、投影、霓虹辉光或渐变；左上角主标题（短促陈述句、可将关键词染霓虹绿）；**右上角预留一块干净的纯背景空白区（约右上 12–14% 宽 × 18–20% 高、不超过此范围），其中不放任何文字、字母、字标或图形，且不得有卡片描边、线框、分隔线、坐标轴、网格、图标、箭头或数据标签侵入或擦边，供后期叠加 Logo——切勿绘制任何「OSL」Logo 或字母；该预留区仅是右上角一小块、不是整条右边栏，不得把右侧整片留空或把主视觉推挤到左半边**；严禁出现「OSL Research」或任何其他署名；图内不出现任何「Source」/数据来源标注（来源由用户在正文补充）。

**英文版（ready-to-append）：**

> Unified style: a strictly 2D flat-design, minimalist corporate financial-research infographic in a data-journalism aesthetic; 16:9 aspect ratio, 4K resolution; solid single-color very dark navy (almost black) or pure black background; palette strictly limited to vibrant neon lime green (#B3FF38, primary accent for key conclusions/key figures/main elements), muted matte gold (secondary accent for the opposing side/secondary series), pure white (titles and data labels) and light grey (subtitles, dividers, axes, dotted gridlines); all text set in the Inter font family with a clear hierarchy — title in Inter Bold (pure white, key words may be neon green), subtitle in Inter Medium (light grey), body and data labels in Inter Regular (pure white, key figures may be neon green), and annotations/captions in Inter Light or Regular (light grey); thin single-color line icons; absolutely no 3D, no drop shadows, no glowing neon blooms, no gradients; top-left bold headline as a short declarative sentence (key words may be set in neon green); reserve a small, bounded, clean solid-color empty area in the absolute top-right corner — roughly the top-right 12–14% width × 18–20% height, no larger — with no text, letters, wordmark or graphics of any kind, and no card borders, frame lines, dividers, axes, gridlines, icons, arrows or data labels entering or even grazing it, reserved for a logo composited in post-production; this reserve is only that small top-right corner block, NOT an empty right-hand column — do not leave the whole right side blank or push all content to the left; do NOT draw or render any 'OSL' logo or lettering anywhere; absolutely no "OSL Research" wordmark or any other byline anywhere; and no "Source"/attribution text anywhere in the image (the source is added by the user in the body copy).

---

## 11. 待补充项（如需固定为官方精确值，请提供后我回填）

- 哑光金（muted matte gold）官方精确色值（HEX/RGB/CMYK）。当前为参考图观察估计 `#BE9A5A`～`#C2A36B`。
- 浅灰（light grey）官方精确色值。当前观察估计 `#8A99A6`。
- 深色背景官方精确色值。当前观察估计深藏青 `#0A1B2A` / 纯黑 `#000000`。
