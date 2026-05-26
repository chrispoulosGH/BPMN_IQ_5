"""
Generate the BPMN IQ 2 logo using Pillow.
AT&T colour palette:
  Primary blue  #009FDB
  Dark navy     #00285A
  Accent cyan   #00C3E3
  White         #FFFFFF
  Mid-grey      #D5D6D2
Output: c:\code\BPMN_IQ_2\client\public\bpmniq_logo.png  (800 x 240 px)
        c:\code\BPMN_IQ_2\client\public\bpmniq_icon.png  (240 x 240 px)
"""

from PIL import Image, ImageDraw, ImageFont
import math, os, sys

# ── colours ────────────────────────────────────────────────────────────────────
NAVY   = (0,  40, 90)       # #00285A
BLUE   = (0, 159, 219)      # #009FDB  AT&T primary
CYAN   = (0, 195, 227)      # #00C3E3
WHITE  = (255, 255, 255)
LGREY  = (213, 214, 210)    # #D5D6D2
TRANSP = (0, 0, 0, 0)

# ── font discovery ─────────────────────────────────────────────────────────────
FONT_DIRS = [
    r"C:\Windows\Fonts",
    os.path.join(os.environ.get("LOCALAPPDATA",""), "Microsoft","Windows","Fonts"),
]

def find_font(names, size):
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except:
                    pass
    return ImageFont.load_default()

FONT_BOLD  = lambda s: find_font(["ArialBd.ttf","Arial_Bold.ttf","segoeui_bold.ttf","segoeuib.ttf","calibrib.ttf"], s)
FONT_REG   = lambda s: find_font(["Arial.ttf","segoeui.ttf","calibri.ttf"], s)
FONT_LIGHT = lambda s: find_font(["ArialMT.ttf","segoeui.ttf","calibril.ttf","Arial.ttf"], s)

# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER – draw a rounded rectangle (Pillow ≥ 8 has rounded_rectangle)
# ═══════════════════════════════════════════════════════════════════════════════
def rrect(draw, xy, radius, fill):
    x0,y0,x1,y1 = xy
    draw.rectangle([x0+radius, y0, x1-radius, y1], fill=fill)
    draw.rectangle([x0, y0+radius, x1, y1-radius], fill=fill)
    for cx,cy in [(x0+radius,y0+radius),(x1-radius,y0+radius),
                  (x0+radius,y1-radius),(x1-radius,y1-radius)]:
        draw.ellipse([cx-radius,cy-radius,cx+radius,cy+radius], fill=fill)

# ═══════════════════════════════════════════════════════════════════════════════
#  ICON (240 × 240) – process-flow mark
# ═══════════════════════════════════════════════════════════════════════════════
def make_icon(size=240):
    img = Image.new("RGBA", (size, size), TRANSP)
    d   = ImageDraw.Draw(img)

    # Background circle
    pad = 6
    d.ellipse([pad, pad, size-pad, size-pad], fill=NAVY)

    # Outer ring accent
    d.ellipse([pad, pad, size-pad, size-pad], outline=BLUE, width=8)

    cx, cy = size//2, size//2

    # ── Draw three BPMN-style task boxes connected by arrows ──────────────────
    box_w, box_h, r = 44, 26, 6
    gap = 18
    total_w = 3*box_w + 2*gap
    x_start = cx - total_w//2

    boxes = []
    for i in range(3):
        bx = x_start + i*(box_w+gap)
        by = cy - box_h//2
        boxes.append((bx, by, bx+box_w, by+box_h))

    # Draw connectors (arrows) first so boxes sit on top
    for i in range(len(boxes)-1):
        x_from = boxes[i][2]
        x_to   = boxes[i+1][0]
        mx     = (x_from + x_to)//2
        y_mid  = cy
        d.line([(x_from, y_mid), (x_to, y_mid)], fill=CYAN, width=4)
        # Arrowhead
        d.polygon([(x_to, y_mid), (x_to-8, y_mid-5), (x_to-8, y_mid+5)], fill=CYAN)

    # Draw boxes
    for i, (bx0,by0,bx1,by1) in enumerate(boxes):
        fill = BLUE if i == 1 else CYAN
        rrect(d, [bx0,by0,bx1,by1], r, fill)

    # Gateway diamond above the middle box
    mx2 = cx
    gy  = cy - box_h//2 - 32
    gs  = 18
    d.polygon([(mx2, gy-gs),(mx2+gs, gy),(mx2, gy+gs),(mx2-gs, gy)], fill=WHITE)

    # "IQ" text inside middle box
    fnt = FONT_BOLD(13)
    bx0,by0,bx1,by1 = boxes[1]
    tw = d.textlength("IQ", font=fnt)
    d.text(((bx0+bx1)/2 - tw/2, (by0+by1)/2 - 7), "IQ", font=fnt, fill=WHITE)

    return img

# ═══════════════════════════════════════════════════════════════════════════════
#  BANNER (800 × 240)
# ═══════════════════════════════════════════════════════════════════════════════
def make_banner():
    W, H = 800, 240
    img = Image.new("RGBA", (W, H), TRANSP)
    d   = ImageDraw.Draw(img)

    # Background – gradient simulation using horizontal bands
    for x in range(W):
        t = x / W
        r_ = int(NAVY[0] + (BLUE[0]-NAVY[0]) * t * 0.55)
        g_ = int(NAVY[1] + (BLUE[1]-NAVY[1]) * t * 0.55)
        b_ = int(NAVY[2] + (BLUE[2]-NAVY[2]) * t * 0.55)
        d.line([(x, 0), (x, H)], fill=(r_, g_, b_, 255))

    # Rounded corners mask
    mask = Image.new("L", (W, H), 0)
    md   = ImageDraw.Draw(mask)
    rrect(md, [0, 0, W, H], 22, 255)
    img.putalpha(mask)
    d = ImageDraw.Draw(img)  # redraw on masked image

    # Cyan accent bar (left edge)
    d.rectangle([0, 0, 10, H], fill=(*CYAN, 255))

    # Embed icon (scaled down)
    icon = make_icon(200)
    img.paste(icon, (18, 20), icon)

    # "BPMN" text
    f_bpmn = FONT_BOLD(68)
    d.text((238, 38), "BPMN", font=f_bpmn, fill=WHITE)

    # "IQ" in AT&T blue highlight
    f_iq = FONT_BOLD(68)
    bpmn_w = int(d.textlength("BPMN", font=f_bpmn))
    d.text((238 + bpmn_w + 10, 38), "IQ", font=f_iq, fill=CYAN)

    # Superscript "2"
    f_sup = FONT_BOLD(32)
    iq_w  = int(d.textlength("IQ", font=f_iq))
    d.text((238 + bpmn_w + 10 + iq_w + 4, 38), "2", font=f_sup, fill=LGREY)

    # Tagline
    f_tag = FONT_LIGHT(20)
    d.text((240, 122), "Process Intelligence Platform", font=f_tag, fill=(*LGREY, 220))

    # Thin horizontal rule under tagline
    rule_y = 155
    d.rectangle([240, rule_y, 680, rule_y+2], fill=(*BLUE, 160))

    # Sub-text
    f_sub = FONT_REG(14)
    d.text((240, 162), "Enterprise Architecture  ·  BPMN Authoring  ·  Application Risk Analytics", font=f_sub, fill=(*LGREY, 180))

    return img

# ═══════════════════════════════════════════════════════════════════════════════
#  Save
# ═══════════════════════════════════════════════════════════════════════════════
OUT = r"c:\code\BPMN_IQ_2\client\public"
os.makedirs(OUT, exist_ok=True)

banner = make_banner()
banner.save(os.path.join(OUT, "bpmniq_logo.png"))
print("Saved bpmniq_logo.png")

icon = make_icon(240)
icon.save(os.path.join(OUT, "bpmniq_icon.png"))
print("Saved bpmniq_icon.png")

# Also save a white-background PNG for presentations
flat = Image.new("RGB", banner.size, (255,255,255))
flat.paste(banner, mask=banner.split()[3])
flat.save(os.path.join(OUT, "bpmniq_logo_white_bg.png"))
print("Saved bpmniq_logo_white_bg.png")

print("Done.")
