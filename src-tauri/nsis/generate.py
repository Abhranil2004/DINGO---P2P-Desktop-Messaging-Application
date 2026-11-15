import os
from PIL import Image, ImageDraw, ImageFont

# Source logo
logo_path = r"C:\Users\abhra\.gemini\antigravity\brain\3ed52366-82e5-4099-aa58-91ea83af881a\.user_uploaded\media_1794745734039_ded91996.png"
out_dir = r"c:\Users\abhra\Downloads\DINGO – P2P Desktop Messaging Application\DINGO – P2P Desktop Messaging Application\src-tauri\nsis"
os.makedirs(out_dir, exist_ok=True)

logo = Image.open(logo_path).convert("RGBA")

# 1. Generate Sidebar BMP (164 x 314)
# NSIS MUI2 standard sidebar is 164x314, 24-bit RGB BMP
sidebar_w, sidebar_h = 164, 314
sidebar = Image.new("RGB", (sidebar_w, sidebar_h), (18, 19, 26)) # #12131a
draw = ImageDraw.Draw(sidebar)

# Draw subtle brutalist grid lines
grid_color = (28, 30, 42)
for x in range(0, sidebar_w, 16):
    draw.line([(x, 0), (x, sidebar_h)], fill=grid_color, width=1)
for y in range(0, sidebar_h, 16):
    draw.line([(0, y), (sidebar_w, y)], fill=grid_color, width=1)

# Add accent colored border stripes on the right edge
draw.line([(sidebar_w - 2, 0), (sidebar_w - 2, sidebar_h)], fill=(112, 89, 226), width=2) # tech purple
draw.line([(sidebar_w - 4, 0), (sidebar_w - 4, sidebar_h)], fill=(198, 241, 53), width=2) # neon lime

# Place the logo centered in the sidebar
# Logo aspect ratio: 1024 / 512 = 2.0
target_logo_w = 148
target_logo_h = int(target_logo_w * (logo.height / logo.width))
logo_resized = logo.resize((target_logo_w, target_logo_h), Image.Resampling.LANCZOS)

# Paste logo in upper-middle
logo_x = (sidebar_w - target_logo_w) // 2
logo_y = 60
sidebar.paste(logo_resized, (logo_x, logo_y), logo_resized)

# Draw a bottom badge
badge_w = 130
badge_h = 24
badge_x = (sidebar_w - badge_w) // 2
badge_y = 250
# Shadow
draw.rectangle([badge_x + 2, badge_y + 2, badge_x + badge_w + 2, badge_y + badge_h + 2], fill=(0, 0, 0))
# Box
draw.rectangle([badge_x, badge_y, badge_x + badge_w, badge_y + badge_h], fill=(198, 241, 53), outline=(0, 0, 0), width=1)

# Text inside badge
try:
    font = ImageFont.truetype(r"public\fonts\static\Outfit-ExtraBold.ttf", 11)
except Exception:
    font = ImageFont.load_default()

draw.text((badge_x + 14, badge_y + 5), "P2P MESSAGING", fill=(18, 19, 26), font=font)

# Save as 24-bit BMP
sidebar_path = os.path.join(out_dir, "sidebar.bmp")
sidebar.save(sidebar_path, "BMP")
print(f"Created {sidebar_path}: {sidebar.size}")

# 2. Generate Header BMP (150 x 57)
# NSIS MUI2 standard header is 150x57, 24-bit RGB BMP on pure white background
header_w, header_h = 150, 57
header = Image.new("RGB", (header_w, header_h), (255, 255, 255))

# Scale logo to fit nicely in 130x48
max_hw, max_hh = 130, 48
scale = min(max_hw / logo.width, max_hh / logo.height)
header_logo_w = int(logo.width * scale)
header_logo_h = int(logo.height * scale)
header_logo = logo.resize((header_logo_w, header_logo_h), Image.Resampling.LANCZOS)

header_x = header_w - header_logo_w - 10
header_y = (header_h - header_logo_h) // 2
header.paste(header_logo, (header_x, header_y), header_logo)

header_path = os.path.join(out_dir, "header.bmp")
header.save(header_path, "BMP")
print(f"Created {header_path}: {header.size}")
