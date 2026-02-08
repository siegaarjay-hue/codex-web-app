#!/usr/bin/env python3
"""Generate polished repository media previews and animations."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "media"
OUT.mkdir(parents=True, exist_ok=True)


def font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype(name, size)
    except Exception:
        return ImageFont.load_default()


TITLE = font("DejaVuSans-Bold.ttf", 64)
SUBTITLE = font("DejaVuSans.ttf", 30)
BODY = font("DejaVuSans.ttf", 22)
BODY_BOLD = font("DejaVuSans-Bold.ttf", 24)
SMALL = font("DejaVuSans.ttf", 18)
XL = font("DejaVuSans-Bold.ttf", 54)
LG = font("DejaVuSans.ttf", 38)
MOBILE_TITLE = font("DejaVuSans-Bold.ttf", 58)
MOBILE_HOME = font("DejaVuSans.ttf", 46)
MOBILE_BODY = font("DejaVuSans.ttf", 20)


def gradient(w: int, h: int, c1: tuple[int, int, int], c2: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (w, h), c1)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for x in range(w):
            s = (x / max(1, w - 1)) * 0.35
            u = min(1.0, t * 0.65 + s)
            px[x, y] = (
                int(c1[0] * (1 - u) + c2[0] * u),
                int(c1[1] * (1 - u) + c2[1] * u),
                int(c1[2] * (1 - u) + c2[2] * u),
            )
    return img


def rr(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int] | tuple[int, int, int],
    outline: tuple[int, int, int, int] | tuple[int, int, int] | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def hero() -> None:
    w, h = 1400, 820
    img = gradient(w, h, (15, 23, 42), (37, 99, 235))
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse((920, -120, 1520, 480), fill=(56, 189, 248, 95))
    d.ellipse((-220, 430, 420, 1030), fill=(16, 185, 129, 80))

    d.text((72, 78), "Codex Web App", font=TITLE, fill=(245, 248, 255, 255))
    d.text((72, 160), "Fast local runtime. Mobile-ready UX. CI by default.", font=SUBTITLE, fill=(212, 228, 255, 235))
    rr(d, (72, 230, 360, 292), 32, fill=(16, 185, 129, 255))
    d.text((110, 248), "npm run start", font=BODY_BOLD, fill=(4, 35, 38, 255))

    rr(d, (520, 90, 1325, 735), 30, fill=(245, 247, 252, 250), outline=(210, 220, 236, 220), width=2)
    rr(d, (550, 130, 760, 695), 20, fill=(236, 241, 249, 255), outline=(219, 228, 241, 255))
    d.text((580, 160), "Threads", font=BODY_BOLD, fill=(31, 41, 55, 255))

    for i, txt in enumerate(["home", "mobile-fix", "release-check", "new-thread"]):
        y = 210 + i * 56
        rr(d, (572, y, 738, y + 40), 12, fill=(252, 253, 255, 255), outline=(228, 233, 243, 255))
        d.text((590, y + 10), txt, font=SMALL, fill=(71, 85, 105, 255))

    d.text((800, 145), "Let's build", font=font("DejaVuSans-Bold.ttf", 44), fill=(17, 24, 39, 255))
    d.text((801, 196), "home", font=font("DejaVuSans.ttf", 34), fill=(107, 114, 128, 255))

    cards = [
        "Build a classic Snake game in this repo.",
        "Create a one-page PDF summary of this app.",
        "Summarize last week's PRs by teammate.",
    ]
    cy = 250
    for c in cards:
        rr(d, (790, cy, 1285, cy + 102), 22, fill=(255, 255, 255, 255), outline=(228, 233, 243, 255), width=2)
        d.text((815, cy + 37), c, font=BODY, fill=(55, 65, 81, 255))
        cy += 126

    img.save(OUT / "hero-card.png", quality=95)


def desktop() -> None:
    w, h = 1280, 820
    img = Image.new("RGB", (w, h), (237, 242, 247))
    d = ImageDraw.Draw(img, "RGBA")
    rr(d, (40, 40, 1240, 780), 26, fill=(250, 252, 255, 255), outline=(214, 223, 236, 255), width=2)
    rr(d, (58, 58, 320, 762), 20, fill=(241, 245, 252, 255), outline=(224, 231, 243, 255), width=2)
    d.text((86, 90), "New thread", font=BODY_BOLD, fill=(17, 24, 39, 255))
    for i, item in enumerate(["Automations", "Skills", "Threads", "home"]):
        d.text((88, 145 + i * 46), item, font=BODY, fill=(75, 85, 99, 255))

    d.text((370, 96), "Open", font=BODY_BOLD, fill=(55, 65, 81, 255))
    d.text((370, 210), "Let's build", font=XL, fill=(17, 24, 39, 255))
    d.text((372, 274), "home", font=LG, fill=(107, 114, 128, 255))

    cards = [
        "Build a classic Snake game in this repo.",
        "Create a one-page PDF that summarizes this app.",
        "Summarize last week's PRs by teammate and theme.",
    ]
    y = 326
    for c in cards:
        rr(d, (355, y, 1195, y + 115), 26, fill=(255, 255, 255, 255), outline=(227, 232, 241, 255), width=2)
        d.text((390, y + 44), c, font=BODY, fill=(55, 65, 81, 255))
        y += 136

    rr(d, (355, 742, 1195, 770), 14, fill=(245, 248, 252, 255), outline=(221, 228, 239, 255), width=1)
    d.text((382, 747), "Ask Codex anything...", font=SMALL, fill=(148, 163, 184, 255))
    img.save(OUT / "desktop-overview.png", quality=95)


def mobile_frame(sidebar: float = 0.0) -> Image.Image:
    w, h = 430, 860
    img = Image.new("RGB", (w, h), (229, 233, 240))
    d = ImageDraw.Draw(img, "RGBA")
    rr(d, (8, 8, w - 8, h - 8), 28, fill=(245, 247, 251, 255), outline=(205, 214, 228, 255), width=2)
    rr(d, (20, 20, w - 20, h - 20), 24, fill=(248, 250, 253, 255), outline=(221, 229, 241, 255), width=1)

    d.text((36, 46), "New thread", font=SMALL, fill=(31, 41, 55, 255))
    rr(d, (170, 34, 286, 68), 16, fill=(255, 255, 255, 255), outline=(218, 226, 237, 255), width=1)
    d.text((205, 45), "Open", font=SMALL, fill=(55, 65, 81, 255))

    d.text((130, 300), "Let's build", font=MOBILE_TITLE, fill=(17, 24, 39, 255))
    d.text((166, 362), "home", font=MOBILE_HOME, fill=(107, 114, 128, 255))

    cards = [
        "Build a classic Snake game in this repo.",
        "Create a one-page PDF that summarizes this app.",
        "Summarize last week's PRs by teammate.",
    ]
    y = 410
    for c in cards:
        rr(d, (34, y, 396, y + 86), 22, fill=(255, 255, 255, 255), outline=(226, 233, 242, 255), width=2)
        d.text((48, y + 32), c, font=MOBILE_BODY, fill=(55, 65, 81, 255))
        y += 102

    rr(d, (34, 734, 396, 818), 24, fill=(255, 255, 255, 255), outline=(215, 224, 236, 255), width=2)
    d.text((48, 768), "Ask Codex anything...", font=SMALL, fill=(148, 163, 184, 255))

    if sidebar > 0:
        sw = int(322 * sidebar)
        d.rectangle((0, 0, w, h), fill=(17, 24, 39, int(120 * sidebar)))
        rr(d, (20, 20, 20 + sw, h - 20), 24, fill=(243, 246, 251, 255), outline=(215, 225, 237, 255), width=1)
        if sw > 120:
            d.text((38, 50), "New thread", font=SMALL, fill=(31, 41, 55, 255))
            d.text((38, 92), "Automations", font=SMALL, fill=(75, 85, 99, 255))
            d.text((38, 128), "Skills", font=SMALL, fill=(75, 85, 99, 255))
            d.text((38, 174), "Threads", font=SMALL, fill=(107, 114, 128, 255))
            d.text((38, 214), "home", font=SMALL, fill=(55, 65, 81, 255))
            for idx, item in enumerate(["mobile-fix", "roadmap", "release", "issues"]):
                d.text((56, 252 + idx * 34), item, font=SMALL, fill=(71, 85, 105, 255))
    return img


def mobile() -> None:
    mobile_closed = mobile_frame(0.0)
    mobile_open = mobile_frame(1.0)
    mobile_closed.save(OUT / "mobile-overview.png", quality=95)
    mobile_open.save(OUT / "mobile-sidebar-open.png", quality=95)

    frames = [mobile_frame(t) for t in [0.0, 0.2, 0.45, 0.7, 1.0, 1.0, 0.75, 0.45, 0.2, 0.0]]
    frames[0].save(
        OUT / "mobile-sidebar-demo.gif",
        save_all=True,
        append_images=frames[1:],
        optimize=False,
        duration=180,
        loop=0,
    )


def showcase() -> None:
    w, h = 1280, 620
    img = gradient(w, h, (17, 24, 39), (30, 64, 175))
    d = ImageDraw.Draw(img, "RGBA")
    rr(d, (52, 58, 1228, 562), 28, fill=(255, 255, 255, 240), outline=(212, 221, 235, 255), width=2)
    d.text((90, 106), "Why this repo feels production-ready", font=font("DejaVuSans-Bold.ttf", 46), fill=(15, 23, 42, 255))

    bullets = [
        "Mobile-fit UX behavior and sidebar handling",
        "Start/stop/status/selftest command flow",
        "CI on every push and pull request",
        "Issue templates, PR checklist, and release checklist",
        "Source-backed Codex research and legal notes",
    ]
    y = 190
    for b in bullets:
        rr(d, (92, y - 6, 1188, y + 52), 16, fill=(247, 250, 255, 255), outline=(226, 232, 242, 255), width=1)
        d.text((118, y + 10), f"- {b}", font=BODY, fill=(51, 65, 85, 255))
        y += 72
    img.save(OUT / "repo-showcase.png", quality=95)


def main() -> None:
    hero()
    desktop()
    mobile()
    showcase()
    print("media generated")


if __name__ == "__main__":
    main()
