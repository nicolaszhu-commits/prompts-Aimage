# prompts-Aimage

面向 [Kiro](https://kiro.dev) 的「Markdown 智能配图提示词提取流水线」。它把一篇 Markdown 文章变成一份结构化的**配图提示词文档**：研判文章结构 → 按统一品牌风格生成可直接复制到第三方生图平台的 Prompt → 规范化归档。配套还有把固定 Logo 后期合成到成品图上的 Python 脚本，以及校验流水线规则的 TypeScript 测试工具。

## 这个项目能做什么

- **`/生成配图提示词` 技能**：读取 `articles/` 下指定的 Markdown 文章，按三阶段 SOP（结构研判 → 提示词策略生成 → 规范化输出）生成 `output/[文章名]aimage.md`。全程对 `articles/` 只读，产物只写入 `output/`。
- **统一品牌风格**：`styles/Style_Guide.md` 定义了 OSL 品牌的配色、版式、图表类型、配图频率与 SEO 元数据规范，技能会在生成提示词时加载它；`styles/Cover_Image_Guide.md` 进一步定义封面图（首页 banner + 社交 OG 图）的增量规范，按需为文章额外生成封面图提示词（`output/[文章名]cover.md`）。
- **Logo 后期合成**（`tools/logo/`）：生图阶段在右上角留白，出图后用脚本叠加固定的透明底 Logo 素材，保证每张图 Logo 尺寸/位置一致。
- **规则校验工具**（`tools/validator/`）：用属性测试和端到端测试校验命名、目录、分类、原文保护等流水线约束。

## 目录结构

```
.kiro/
  skills/生成配图提示词/SKILL.md   # 技能定义（三阶段 SOP）
  steering/                        # 质量与原文保护约束（image-prompt-quality.md / source-protection.md）
  specs/                           # 流水线需求与设计文档（requirements / design / tasks）
articles/                          # 放你要配图的 Markdown 文章（只读输入）
output/                            # 生成的提示词文档（产物：[文章名]aimage.md / [文章名]cover.md）
  branded/
    _nologo/                       # 放第三方平台出的、右上角留白的无 Logo 原图（输入）
    _logo/                         # Logo 合成脚本输出的成品图（产物）
styles/
  Style_Guide.md                   # 统一品牌风格指南（配色/版式/图表类型/SEO 元数据）
  Cover_Image_Guide.md             # 封面图（banner + 社交 OG 图）增量规范
assets/brand/OSL_logo.png          # 后期合成用的固定透明底 Logo 素材
tools/logo/                        # Logo 合成 Python 脚本
  relogo.py                        #   主脚本：把 _nologo 的图叠加 Logo 输出到 _logo
  logo_logic.py                    #   确定性纯逻辑（Logo 尺寸/坐标、残留块合并）
  extract_logo.py                  #   一次性：从深底品牌图抠出透明底字标素材
  diagnose.py                      #   诊断：分析右上区域绿色块（仅分析不改图）
  test_logo_logic.py               #   logo_logic 的属性测试（pytest + hypothesis）
tools/validator/                   # TypeScript 校验测试工具
  src/                             #   校验规则实现（命名/目录/分类/文档/安全）
  test/                            #   属性测试与端到端测试
```

## 其他人如何在自己的 Kiro 上使用

1. **获取项目**：克隆仓库，或直接解压收到的项目压缩包。

   ```bash
   git clone https://github.com/OSL-Growth/prompts-aimage.git
   # 或：解压收到的 .zip 文件夹
   ```

2. **用 Kiro 打开这个文件夹**。Kiro 会自动识别 `.kiro/` 下的技能和 steering 配置。

3. **放入文章**：把要配图的 Markdown 文件放进 `articles/` 目录。

4. **触发技能**：在 Kiro 对话框中手动调用技能，例如：

   ```
   /生成配图提示词 你的文章.md
   ```

   或者直接说「为 articles/你的文章.md 生成配图提示词」。

5. **查看产物**：生成的提示词文档在 `output/你的文章名aimage.md`，复制其中的 Prompt 到第三方生图平台即可出图。

> 风格指南 `styles/Style_Guide.md` 中的品牌色、Logo 素材等均为 OSL 示例。换成你自己的品牌时，替换 `assets/brand/OSL_logo.png` 并按需修改风格指南即可。

## 可选工具

> **可以直接把下面任一「📋 发给 Kiro」区块的内容复制到 Kiro 对话框，让 Kiro 代为安装与运行**，无需自己敲命令。Kiro 会读取本项目、自动判断你的操作系统、处理虚拟环境，并在缺少 Python/Node 运行时时提示你先安装。

### Logo 后期合成（需要 Python 3）

把无 Logo 原图放进 `output/branded/_nologo/`，运行脚本后成品出现在 `output/branded/_logo/`（原图只读保留，可随时安全重跑）。

📋 **发给 Kiro（安装 + 运行 Logo 合成）**：

```text
请帮我准备并运行这个项目的 Logo 后期合成工具：
1. 在项目根目录创建 Python 虚拟环境 .venv，并在其中安装 Pillow、scipy、numpy（请直接调用 .venv 里的解释器，例如 .venv/bin/python -m pip，不要依赖 source activate）。
2. 如果我的机器没有 Python 3，请先告诉我如何安装，再继续。
3. 我已经把无 Logo 的原图放进了 output/branded/_nologo/。请用 .venv 里的 python 运行 tools/logo/relogo.py，把成品输出到 output/branded/_logo/。
4. 运行完后告诉我每张图的 Logo 落位是否正确。
```

<details>
<summary>手动命令（不借助 Kiro 时参考）</summary>

```bash
# 在项目根目录执行
python3 -m venv .venv
source .venv/bin/activate           # macOS / Linux；Windows 用 .venv\Scripts\activate
pip install --upgrade pip Pillow scipy numpy

# 1) 把第三方平台出的（右上角留白、无 Logo）图放进 output/branded/_nologo/
# 2) 默认处理 _nologo/ 全部 PNG，成品写入 _logo/
python tools/logo/relogo.py

# 只处理指定文件
python tools/logo/relogo.py --files "图A.png" "图B.png"

# 自定义输入/输出目录（默认即 _nologo / _logo）
python tools/logo/relogo.py --in 其它目录 --out 另一个目录
```

</details>

脚本会把固定 Logo（`assets/brand/OSL_logo.png`）按「宽=画宽 8%、距顶/右各 60px」叠加到右上角，并自动跳过/覆盖模型残留的旧 Logo（带贴角护栏，不误伤正文绿色内容）。

**换成你自己的品牌 Logo**：替换 `assets/brand/OSL_logo.png` 即可；若要从一张「深底品牌色字标」源图重新抠出透明底素材，用一次性脚本（仓库已附带 OSL 产物，通常无需运行）：

```bash
python tools/logo/extract_logo.py --src "/path/to/你的深底Logo.png" --out assets/brand/你的Logo.png --brand 179,255,56
```

> 诊断工具：`python tools/logo/diagnose.py`（分析右上区域绿色连通块，区分残留 Logo 与正文内容，仅分析不改图）。

### 运行校验测试（需要 Node.js）

📋 **发给 Kiro（安装 + 运行校验测试）**：

```text
请帮我安装并运行这个项目的校验测试：进入 tools/validator 目录，执行 npm install 安装依赖，然后运行 npm test，并把测试结果汇总告诉我。如果我的机器没有 Node.js，请先告诉我如何安装。
```

<details>
<summary>手动命令（不借助 Kiro 时参考）</summary>

```bash
cd tools/validator
npm install
npm test
```

</details>
