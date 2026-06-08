"""从 OSL 源 Logo（深底品牌色）抠出透明底的「OSL」字标素材。

源图特征（经 inspect 确认）：
- 2800×1600 RGBA，四周一圈灰色边框 [62,62,62]
- 绿字为精确品牌色 [179,255,56] = #B3FF38，黑底 near-black
- 绿字边界框 x:689–2110, y:352–1237

处理步骤：
1. 裁到绿字边界框（带少量留白），顺带剔除外圈灰色边框；
2. 以「绿度/亮度」估计每个像素的覆盖 alpha（抗锯齿边缘平滑过渡）；
3. 前景 RGB 统一设为品牌绿，避免边缘出现暗色脏边；
4. 输出透明底 PNG 素材。
"""
from PIL import Image
import numpy as np

SRC = "/Users/bcg83231/Desktop/Brand Assets/PNG/OSL/Dark background Brand color logo.png"
OUT = "assets/brand/OSL_logo.png"

BRAND = (179, 255, 56)  # #B3FF38

im = Image.open(SRC).convert("RGBA")
rgb = np.asarray(im)[:, :, :3].astype(np.float32)
h, w = rgb.shape[:2]

# 1) 识别绿字像素（高 G、中 R、低 B），求紧致边界框
green_mask = (rgb[:, :, 1] > 150) & (rgb[:, :, 0] > 80) & (rgb[:, :, 0] < 220) & (rgb[:, :, 2] < 120)
ys, xs = np.where(green_mask)
pad = 24  # 边界框四周留少量透明留白
x0, x1 = max(int(xs.min()) - pad, 0), min(int(xs.max()) + pad + 1, w)
y0, y1 = max(int(ys.min()) - pad, 0), min(int(ys.max()) + pad + 1, h)
crop = rgb[y0:y1, x0:x1]

# 2) 以绿通道为主、剔除灰底基线，估计覆盖 alpha
g = crop[:, :, 1]
r = crop[:, :, 0]
b = crop[:, :, 2]
# 「绿强度」：绿通道减去蓝通道（黑底/灰底处 g≈b，差值≈0；绿字处 g≫b）
greenness = np.clip(g - b, 0, 255) / 255.0
# 轻微伽马，收紧半透明杂边
alpha = np.clip(greenness ** 0.9, 0, 1)
# 低于阈值的（黑底/灰底）直接透明，避免幽灵halo
alpha[alpha < 0.06] = 0.0

# 3) 前景统一品牌绿
out = np.zeros((crop.shape[0], crop.shape[1], 4), dtype=np.uint8)
out[:, :, 0] = BRAND[0]
out[:, :, 1] = BRAND[1]
out[:, :, 2] = BRAND[2]
out[:, :, 3] = (alpha * 255).round().astype(np.uint8)

result = Image.fromarray(out, "RGBA")
import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
result.save(OUT)

# 报告
opaque = int((out[:, :, 3] > 200).sum())
print(f"源裁剪框: x[{x0}:{x1}] y[{y0}:{y1}] -> 输出尺寸 {result.size}")
print(f"不透明像素(绿字): {opaque}")
print(f"已保存透明底素材: {OUT}")
