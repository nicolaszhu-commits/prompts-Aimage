# prompts-Aimage

面向 [Kiro](https://kiro.dev) 的「Markdown 智能配图提示词提取流水线」。它把一篇 Markdown 文章变成一份结构化的**配图提示词文档**：研判文章结构 → 按统一品牌风格生成可直接复制到第三方生图平台的 Prompt → 规范化归档。配套还有把固定 Logo 后期合成到成品图上的 Python 脚本，以及校验流水线规则的 TypeScript 测试工具。

## 这个项目能做什么

- **`/生成配图提示词` 技能**：读取 `articles/` 下指定的 Markdown 文章，按三阶段 SOP（结构研判 → 提示词策略生成 → 规范化输出）生成 `output/[文章名]aimage.md`。全程对 `articles/` 只读，产物只写入 `output/`。
- **统一品牌风格**：`styles/Style_Guide.md` 定义了 OSL 品牌的配色、版式、图表类型、配图频率与 SEO 元数据规范，技能会在生成提示词时加载它。
- **Logo 后期合成**（`tools/logo/`）：生图阶段在右上角留白，出图后用脚本叠加固定的透明底 Logo 素材，保证每张图 Logo 尺寸/位置一致。
- **规则校验工具**（`tools/validator/`）：用属性测试和端到端测试校验命名、目录、分类、原文保护等流水线约束。

## 目录结构

```
.kiro/
  skills/生成配图提示词/SKILL.md   # 技能定义（三阶段 SOP）
  steering/                        # 质量与原文保护约束
  specs/                           # 流水线需求与设计文档
articles/                          # 放你要配图的 Markdown 文章（只读）
output/                            # 生成的提示词文档（产物）
styles/Style_Guide.md              # 统一品牌风格指南
assets/brand/OSL_logo.png          # 后期合成用的 Logo 素材
tools/logo/                        # Logo 合成/抠底 Python 脚本
tools/validator/                   # TypeScript 校验测试工具
```

## 其他人如何在自己的 Kiro 上使用

1. **克隆仓库**

   ```bash
   git clone https://github.com/<你的用户名>/prompts-Aimage.git
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

- **Logo 合成**（需要 Python 3 + Pillow + scipy）：

  ```bash
  python tools/logo/relogo.py
  ```

- **运行校验测试**（需要 Node.js）：

  ```bash
  cd tools/validator
  npm install
  npm test
  ```
