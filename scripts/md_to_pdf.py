#!/usr/bin/env python3
"""Small dependency-light Markdown-to-PDF renderer for the project report.

It uses Pillow, which is already available in this environment, to render a
readable multi-page PDF with headings, bullets, fenced code blocks, and local
Markdown images.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

PAGE_W, PAGE_H = 1240, 1754  # A4-ish at 150 DPI
MARGIN_X = 100
MARGIN_TOP = 90
MARGIN_BOTTOM = 90
CONTENT_W = PAGE_W - 2 * MARGIN_X
BG = "white"
TEXT = (24, 31, 45)
MUTED = (78, 91, 110)
BLUE = (25, 88, 180)
LIGHT = (246, 248, 250)
RULE = (218, 224, 231)
CODE_BG = (246, 248, 250)

FONT_DIR = Path("/usr/share/fonts/truetype/noto")
REG = str(FONT_DIR / "NotoSans-Regular.ttf")
BOLD = str(FONT_DIR / "NotoSans-Bold.ttf")
MONO = str(FONT_DIR / "NotoSansMono-Regular.ttf")

font_title = ImageFont.truetype(BOLD, 42)
font_h2 = ImageFont.truetype(BOLD, 30)
font_h3 = ImageFont.truetype(BOLD, 23)
font_body = ImageFont.truetype(REG, 18)
font_body_bold = ImageFont.truetype(BOLD, 18)
font_caption = ImageFont.truetype(REG, 15)
font_code = ImageFont.truetype(MONO, 15)


def text_bbox(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont):
    return draw.textbbox((0, 0), text, font=font)


def text_w(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> int:
    b = text_bbox(draw, text, font)
    return int(b[2] - b[0])


def line_h(font: ImageFont.FreeTypeFont) -> int:
    b = font.getbbox("Ag")
    return int(b[3] - b[1] + 8)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    text = text.replace("\t", "    ")
    if not text.strip():
        return [""]
    words = text.split(" ")
    lines: list[str] = []
    cur = ""
    for word in words:
        trial = word if not cur else f"{cur} {word}"
        if text_w(draw, trial, font) <= width:
            cur = trial
            continue
        if cur:
            lines.append(cur)
            cur = ""
        # Break very long words/URLs.
        while text_w(draw, word, font) > width and len(word) > 1:
            lo, hi = 1, len(word)
            while lo < hi:
                mid = (lo + hi + 1) // 2
                if text_w(draw, word[:mid], font) <= width:
                    lo = mid
                else:
                    hi = mid - 1
            lines.append(word[:lo])
            word = word[lo:]
        cur = word
    if cur:
        lines.append(cur)
    return lines


class Renderer:
    def __init__(self, md_path: Path, out_path: Path):
        self.md_path = md_path
        self.out_path = out_path
        self.pages: list[Image.Image] = []
        self.page = self._new_page()
        self.draw = ImageDraw.Draw(self.page)
        self.y = MARGIN_TOP
        self.page_no = 1

    def _new_page(self) -> Image.Image:
        return Image.new("RGB", (PAGE_W, PAGE_H), BG)

    def _footer(self):
        self.draw.line((MARGIN_X, PAGE_H - 62, PAGE_W - MARGIN_X, PAGE_H - 62), fill=RULE, width=1)
        footer = f"VoltEdge 2.0 Project Report · Page {self.page_no}"
        self.draw.text((MARGIN_X, PAGE_H - 48), footer, fill=MUTED, font=font_caption)

    def _finish_page(self):
        self._footer()
        self.pages.append(self.page)

    def ensure(self, needed: int):
        if self.y + needed <= PAGE_H - MARGIN_BOTTOM:
            return
        self._finish_page()
        self.page_no += 1
        self.page = self._new_page()
        self.draw = ImageDraw.Draw(self.page)
        self.y = MARGIN_TOP

    def add_space(self, amount: int):
        self.y += amount

    def add_rule(self):
        self.ensure(20)
        self.draw.line((MARGIN_X, self.y, PAGE_W - MARGIN_X, self.y), fill=RULE, width=2)
        self.y += 20

    def add_heading(self, text: str, level: int):
        if level == 1:
            font, color, before, after = font_title, TEXT, 0, 22
        elif level == 2:
            font, color, before, after = font_h2, BLUE, 30, 14
        else:
            font, color, before, after = font_h3, TEXT, 22, 10
        if self.y > MARGIN_TOP + 10:
            self.add_space(before)
        lines = wrap_text(self.draw, text, font, CONTENT_W)
        needed = len(lines) * line_h(font) + after
        self.ensure(needed)
        for line in lines:
            self.draw.text((MARGIN_X, self.y), line, fill=color, font=font)
            self.y += line_h(font)
        if level == 1:
            self.add_rule()
        else:
            self.y += after

    def add_paragraph(self, text: str):
        text = re.sub(r"`([^`]+)`", r"\1", text)
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
        lines = wrap_text(self.draw, text, font_body, CONTENT_W)
        self.ensure(len(lines) * line_h(font_body) + 10)
        for line in lines:
            self.draw.text((MARGIN_X, self.y), line, fill=TEXT, font=font_body)
            self.y += line_h(font_body)
        self.y += 8

    def add_bullet(self, text: str, indent: int = 0, ordered: str | None = None):
        text = re.sub(r"`([^`]+)`", r"\1", text)
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
        x = MARGIN_X + indent
        bullet = ordered if ordered else "•"
        bullet_w = 30 if not ordered else max(32, text_w(self.draw, bullet, font_body) + 10)
        lines = wrap_text(self.draw, text, font_body, CONTENT_W - indent - bullet_w)
        self.ensure(len(lines) * line_h(font_body) + 4)
        self.draw.text((x, self.y), bullet, fill=BLUE, font=font_body_bold)
        for i, line in enumerate(lines):
            self.draw.text((x + bullet_w, self.y), line, fill=TEXT, font=font_body)
            self.y += line_h(font_body)
        self.y += 2

    def add_code(self, lines: Iterable[str]):
        lines = list(lines)
        wrapped: list[str] = []
        for line in lines:
            wrapped.extend(wrap_text(self.draw, line if line else " ", font_code, CONTENT_W - 36))
        needed = len(wrapped) * line_h(font_code) + 28
        self.ensure(needed)
        y0 = self.y
        self.draw.rounded_rectangle((MARGIN_X, y0, PAGE_W - MARGIN_X, y0 + needed - 8), radius=10, fill=CODE_BG, outline=RULE)
        self.y += 14
        for line in wrapped:
            self.draw.text((MARGIN_X + 18, self.y), line, fill=(36, 41, 47), font=font_code)
            self.y += line_h(font_code)
        self.y += 14

    def add_image(self, alt: str, rel: str):
        img_path = (self.md_path.parent / rel).resolve()
        if not img_path.exists():
            self.add_paragraph(f"[Missing image: {rel}]")
            return
        with Image.open(img_path) as im:
            im = im.convert("RGB")
            max_w = CONTENT_W
            max_h = 560
            scale = min(max_w / im.width, max_h / im.height, 1.0)
            new_size = (max(1, int(im.width * scale)), max(1, int(im.height * scale)))
            im = im.resize(new_size, Image.Resampling.LANCZOS)
            needed = im.height + 52
            self.ensure(needed)
            x = MARGIN_X + (CONTENT_W - im.width) // 2
            self.page.paste(im, (x, self.y))
            self.y += im.height + 8
        caption = alt.strip() or rel
        for line in wrap_text(self.draw, caption, font_caption, CONTENT_W):
            self.draw.text((MARGIN_X, self.y), line, fill=MUTED, font=font_caption)
            self.y += line_h(font_caption)
        self.y += 12

    def render(self):
        raw_lines = self.md_path.read_text(encoding="utf-8").splitlines()
        i = 0
        in_code = False
        code_lines: list[str] = []
        para: list[str] = []

        def flush_para():
            nonlocal para
            if para:
                self.add_paragraph(" ".join(p.strip() for p in para).strip())
                para = []

        while i < len(raw_lines):
            line = raw_lines[i]
            if line.strip().startswith("```"):
                if in_code:
                    self.add_code(code_lines)
                    code_lines = []
                    in_code = False
                else:
                    flush_para()
                    in_code = True
                i += 1
                continue
            if in_code:
                code_lines.append(line)
                i += 1
                continue

            if not line.strip():
                flush_para()
                self.add_space(4)
                i += 1
                continue

            img = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
            if img:
                flush_para()
                self.add_image(img.group(1), img.group(2))
                i += 1
                continue

            h = re.match(r"^(#{1,3})\s+(.+)$", line)
            if h:
                flush_para()
                self.add_heading(h.group(2).strip(), len(h.group(1)))
                i += 1
                continue

            bullet = re.match(r"^(\s*)[-*]\s+(.+)$", line)
            if bullet:
                flush_para()
                self.add_bullet(bullet.group(2), indent=min(len(bullet.group(1)) * 10, 80))
                i += 1
                continue

            ordered = re.match(r"^(\s*)(\d+\.)\s+(.+)$", line)
            if ordered:
                flush_para()
                self.add_bullet(ordered.group(3), indent=min(len(ordered.group(1)) * 10, 80), ordered=ordered.group(2))
                i += 1
                continue

            if line.strip() == "---":
                flush_para()
                self.add_rule()
                i += 1
                continue

            para.append(line)
            i += 1

        flush_para()
        if in_code and code_lines:
            self.add_code(code_lines)
        self._finish_page()
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self.pages[0].save(self.out_path, save_all=True, append_images=self.pages[1:], resolution=150)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: md_to_pdf.py input.md output.pdf", file=sys.stderr)
        return 2
    md_path = Path(sys.argv[1]).resolve()
    out_path = Path(sys.argv[2]).resolve()
    Renderer(md_path, out_path).render()
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
