# -*- coding: utf-8 -*-
"""生成插件列表用的 180x180 位图图标（列表不收 SVG）。"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "assets", "icon-180.png")
os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

d.rounded_rectangle([0, 0, S - 1, S - 1], radius=112, fill=(16, 24, 38, 255))

# 文档外框
d.rounded_rectangle([146, 96, 366, 404], radius=40, outline=(91, 158, 255, 255), width=20)

# 三条横线
for y in (186, 246, 306):
    d.line([(206, y), (306, y)], fill=(143, 160, 189, 255), width=16)

# 对勾圆
d.ellipse([296, 316, 452, 472], fill=(16, 24, 38, 255))
d.ellipse([296, 316, 452, 472], outline=(43, 217, 165, 255), width=18)
d.line([(330, 396), (362, 428), (420, 360)], fill=(43, 217, 165, 255), width=20, joint="curve")

img.resize((180, 180), Image.LANCZOS).save(OUT)
print("saved", OUT)
