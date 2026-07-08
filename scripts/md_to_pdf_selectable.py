#!/usr/bin/env python3
"""Generate a text-selectable PDF from PROJECT_REPORT.md.

Uses ReportLab so the resulting PDF contains real text (copy/search/select), not
rasterized page images. Supports the subset of Markdown used by the report:
headings, paragraphs, bullets, ordered lists, fenced code blocks, images, and
simple pipe tables.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from PIL import Image as PILImage

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = Path("/usr/share/fonts/truetype/noto")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("NotoSans", str(FONT_DIR / "NotoSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("NotoSans-Bold", str(FONT_DIR / "NotoSans-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("NotoSansMono", str(FONT_DIR / "NotoSansMono-Regular.ttf")))


def make_styles():
    base = getSampleStyleSheet()
    styles = {
        "Title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="NotoSans-Bold",
            fontSize=24,
            leading=30,
            textColor=colors.HexColor("#111827"),
            spaceAfter=18,
            alignment=TA_LEFT,
        ),
        "H2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="NotoSans-Bold",
            fontSize=16,
            leading=21,
            textColor=colors.HexColor("#1558B4"),
            spaceBefore=16,
            spaceAfter=8,
        ),
        "H3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="NotoSans-Bold",
            fontSize=12.5,
            leading=16,
            textColor=colors.HexColor("#111827"),
            spaceBefore=10,
            spaceAfter=6,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="NotoSans",
            fontSize=9.2,
            leading=13.2,
            textColor=colors.HexColor("#1f2937"),
            spaceAfter=7,
        ),
        "Bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="NotoSans",
            fontSize=9.2,
            leading=12.6,
            leftIndent=12,
            firstLineIndent=0,
            spaceAfter=3,
        ),
        "Caption": ParagraphStyle(
            "Caption",
            parent=base["BodyText"],
            fontName="NotoSans",
            fontSize=8,
            leading=10.5,
            textColor=colors.HexColor("#4b5563"),
            alignment=TA_CENTER,
            spaceBefore=4,
            spaceAfter=8,
        ),
        "Code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="NotoSansMono",
            fontSize=7.5,
            leading=10,
            leftIndent=6,
            rightIndent=6,
            backColor=colors.HexColor("#f6f8fa"),
            borderColor=colors.HexColor("#d8dee4"),
            borderWidth=0.4,
            borderPadding=6,
            spaceBefore=5,
            spaceAfter=8,
        ),
        "TableHeader": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName="NotoSans-Bold",
            fontSize=7.4,
            leading=9.4,
            alignment=TA_LEFT,
        ),
        "TableCell": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName="NotoSans",
            fontSize=7.2,
            leading=9.3,
            alignment=TA_LEFT,
        ),
    }
    return styles


def md_inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<font name='NotoSansMono'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = text.replace("→", "&#8594;")
    return text


def split_table_row(line: str) -> list[str]:
    stripped = line.strip().strip("|")
    return [c.strip() for c in stripped.split("|")]


def is_table_sep(line: str) -> bool:
    cells = split_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", c or "") for c in cells)


def make_table(rows: list[list[str]], styles):
    if len(rows) < 2:
        return []
    max_cols = max(len(r) for r in rows)
    rows = [r + [""] * (max_cols - len(r)) for r in rows]
    header, body = rows[0], rows[2:] if len(rows) > 1 and is_table_sep("|" + "|".join(rows[1]) + "|") else rows[1:]
    data = [[Paragraph(md_inline(c), styles["TableHeader"]) for c in header]]
    for row in body:
        data.append([Paragraph(md_inline(c), styles["TableCell"]) for c in row])
    page_w = A4[0] - 1.3 * inch
    if max_cols == 2:
        col_widths = [page_w * 0.26, page_w * 0.74]
    elif max_cols == 3:
        col_widths = [page_w * 0.21, page_w * 0.39, page_w * 0.40]
    else:
        col_widths = [page_w / max_cols] * max_cols
    tbl = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef4ff")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#111827")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d1d5db")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return [tbl, Spacer(1, 8)]


def make_image(md_path: Path, alt: str, rel: str, styles):
    img_path = (md_path.parent / rel).resolve()
    if not img_path.exists():
        return [Paragraph(f"[Missing image: {md_inline(rel)}]", styles["Body"])]
    max_w = A4[0] - 1.3 * inch
    max_h = 3.5 * inch
    with PILImage.open(img_path) as im:
        w, h = im.size
    scale = min(max_w / w, max_h / h, 1.0)
    flow_img = Image(str(img_path), width=w * scale, height=h * scale, hAlign="CENTER")
    return KeepTogether([flow_img, Paragraph(md_inline(alt or rel), styles["Caption"])])


def build_story(md_path: Path, styles):
    lines = md_path.read_text(encoding="utf-8").splitlines()
    story = []
    para: list[str] = []
    bullets: list[str] = []
    code: list[str] = []
    in_code = False

    def flush_para():
        nonlocal para
        if para:
            story.append(Paragraph(md_inline(" ".join(p.strip() for p in para).strip()), styles["Body"]))
            para = []

    def flush_bullets():
        nonlocal bullets
        if bullets:
            for b in bullets:
                story.append(Paragraph("• " + md_inline(b), styles["Bullet"]))
            story.append(Spacer(1, 3))
            bullets = []

    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("```"):
            flush_para(); flush_bullets()
            if in_code:
                story.append(Preformatted("\n".join(code), styles["Code"], maxLineLength=92))
                code = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code.append(line)
            i += 1
            continue

        if not line.strip():
            flush_para(); flush_bullets()
            i += 1
            continue

        # Pipe table block.
        if line.strip().startswith("|") and i + 1 < len(lines) and is_table_sep(lines[i + 1]):
            flush_para(); flush_bullets()
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(split_table_row(lines[i]))
                i += 1
            story.extend(make_table(table_lines, styles))
            continue

        m_img = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if m_img:
            flush_para(); flush_bullets()
            story.append(make_image(md_path, m_img.group(1), m_img.group(2), styles))
            i += 1
            continue

        m_h = re.match(r"^(#{1,3})\s+(.+)$", line)
        if m_h:
            flush_para(); flush_bullets()
            level = len(m_h.group(1))
            text = md_inline(m_h.group(2).strip())
            if level == 1:
                story.append(Paragraph(text, styles["Title"]))
            elif level == 2:
                story.append(Paragraph(text, styles["H2"]))
            else:
                story.append(Paragraph(text, styles["H3"]))
            i += 1
            continue

        m_b = re.match(r"^\s*[-*]\s+(.+)$", line)
        if m_b:
            flush_para()
            bullets.append(m_b.group(1).strip())
            i += 1
            continue

        m_o = re.match(r"^\s*\d+\.\s+(.+)$", line)
        if m_o:
            flush_para()
            bullets.append(m_o.group(1).strip())
            i += 1
            continue

        flush_bullets()
        para.append(line)
        i += 1

    flush_para(); flush_bullets()
    if code:
        story.append(Preformatted("\n".join(code), styles["Code"], maxLineLength=92))
    return story


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("NotoSans", 8)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawString(0.65 * inch, 0.42 * inch, "VoltEdge 2.0 Project Report")
    canvas.drawRightString(A4[0] - 0.65 * inch, 0.42 * inch, f"Page {doc.page}")
    canvas.restoreState()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: md_to_pdf_selectable.py input.md output.pdf", file=sys.stderr)
        return 2
    register_fonts()
    styles = make_styles()
    md_path = Path(sys.argv[1]).resolve()
    out_path = Path(sys.argv[2]).resolve()
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.58 * inch,
        bottomMargin=0.62 * inch,
        title="VoltEdge 2.0 Project Report",
        author="VoltEdge Project Team",
    )
    story = build_story(md_path, styles)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
