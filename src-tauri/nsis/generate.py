import os
from PIL import Image, ImageDraw, ImageFont

out_dir = r"c:\Users\abhra\Downloads\DINGO – P2P Desktop Messaging Application\DINGO – P2P Desktop Messaging Application\src-tauri\nsis"
os.makedirs(out_dir, exist_ok=True)

# Load the big card
card = Image.open("master_icon_big.png").convert("RGBA")

# 1. Generate Sidebar BMP (164 x 314)
sidebar_w, sidebar_h = 164, 314
sidebar = Image.new("RGB", (sidebar_w, sidebar_h), (18, 19, 26)) # #12131a
draw = ImageDraw.Draw(sidebar)

# Draw graph grid lines
grid_color = (28, 30, 42)
for x in range(0, sidebar_w, 16):
    draw.line([(x, 0), (x, sidebar_h)], fill=grid_color, width=1)
for y in range(0, sidebar_h, 16):
    draw.line([(0, y), (sidebar_w, y)], fill=grid_color, width=1)

# Accent stripes on right border
draw.line([(sidebar_w - 2, 0), (sidebar_w - 2, sidebar_h)], fill=(112, 89, 226), width=2)
draw.line([(sidebar_w - 4, 0), (sidebar_w - 4, sidebar_h)], fill=(198, 241, 53), width=2)

# Make the card BIG on the sidebar: 154x154 px (takes nearly 100% of sidebar width!)
card_side_w = 154
card_side_h = int(card.height * (card_side_w / card.width))
card_side = card.resize((card_side_w, card_side_h), Image.Resampling.LANCZOS)

card_x = (sidebar_w - card_side_w) // 2
card_y = 65
sidebar.paste(card_side, (card_x, card_y), card_side)

# Add "P2P MESSAGING" badge at the bottom
badge_w = 136
badge_h = 26
badge_x = (sidebar_w - badge_w) // 2
badge_y = 250
# Shadow
draw.rectangle([badge_x + 2, badge_y + 2, badge_x + badge_w + 2, badge_y + badge_h + 2], fill=(0, 0, 0))
# Box
draw.rectangle([badge_x, badge_y, badge_x + badge_w, badge_y + badge_h], fill=(198, 241, 53), outline=(0, 0, 0), width=1)

try:
    font = ImageFont.truetype(r"public\fonts\static\Outfit-ExtraBold.ttf", 12)
except Exception:
    font = ImageFont.load_default()

draw.text((badge_x + 14, badge_y + 5), "P2P MESSAGING", fill=(18, 19, 26), font=font)

sidebar_path = os.path.join(out_dir, "sidebar.bmp")
sidebar.save(sidebar_path, "BMP")
print(f"Created {sidebar_path}: {sidebar.size}")

# 2. Generate Header BMP (150 x 57)
header_w, header_h = 150, 57
header = Image.new("RGB", (header_w, header_h), (255, 255, 255))

# Scale card to 50x50 on the right
card_hdr_w = 50
card_hdr_h = int(card.height * (card_hdr_w / card.width))
card_hdr = card.resize((card_hdr_w, card_hdr_h), Image.Resampling.LANCZOS)

header_x = header_w - card_hdr_w - 8
header_y = (header_h - card_hdr_h) // 2
header.paste(card_hdr, (header_x, header_y), card_hdr)

header_path = os.path.join(out_dir, "header.bmp")
header.save(header_path, "BMP")
print(f"Created {header_path}: {header.size}")
