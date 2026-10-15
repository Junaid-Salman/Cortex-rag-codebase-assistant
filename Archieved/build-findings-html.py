#!/usr/bin/env python3
"""Render findings.md to a standalone findings.html (no dependencies).

Usage (from repo root): python3 Archieved/build-findings-html.py
Handles only the Markdown subset findings.md uses: headings, tables, bullet and
numbered lists, blockquotes, hr, paragraphs, **bold**, `code`.
"""
import html
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
lines = (root / "findings.md").read_text().split("\n")


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    return s


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", s).lower()).strip("-")


def split_row(row):
    return [c.strip() for c in row.strip().strip("|").split("|")]


out, toc = [], []
i = 0
title = "Findings"
while i < len(lines):
    ln = lines[i]

    if not ln.strip():
        i += 1
    elif ln.startswith("#"):
        level = len(ln) - len(ln.lstrip("#"))
        text = ln[level:].strip()
        if level == 1:
            title = text
        sid = slug(text)
        if level == 2:
            toc.append((sid, inline(text)))
        out.append(f'<h{level} id="{sid}">{inline(text)}</h{level}>')
        i += 1
    elif ln.strip() == "---":
        out.append("<hr>")
        i += 1
    elif ln.startswith(">"):
        buf = []
        while i < len(lines) and lines[i].startswith(">"):
            buf.append(lines[i].lstrip("> ").strip())
            i += 1
        out.append(f'<blockquote>{inline(" ".join(buf))}</blockquote>')
    elif ln.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].startswith("|"):
            rows.append(lines[i])
            i += 1
        head = split_row(rows[0])
        body = [split_row(r) for r in rows[2:]]
        t = ['<div class="table-wrap"><table><thead><tr>']
        t += [f"<th>{inline(c)}</th>" for c in head]
        t.append("</tr></thead><tbody>")
        for r in body:
            cls = ' class="best"' if any("<strong>" in inline(c) for c in r) else ""
            t.append(f"<tr{cls}>")
            for j, c in enumerate(r):
                num = j > 0 and re.fullmatch(r"[~]?[\d.,]+(%|s| chars)?", re.sub(r"<[^>]+>", "", inline(c)).strip()) is not None
                t.append(f'<td{" class=num" if num else ""}>{inline(c)}</td>')
            t.append("</tr>")
        t.append("</tbody></table></div>")
        out.append("".join(t))
    elif re.match(r"^\s*[-*] ", ln) or re.match(r"^\d+\. ", ln):
        ordered = bool(re.match(r"^\d+\. ", ln))
        tag = "ol" if ordered else "ul"
        items = []
        while i < len(lines) and (re.match(r"^\s*[-*] ", lines[i]) or re.match(r"^\d+\. ", lines[i]) or (lines[i].startswith("   ") and lines[i].strip())):
            if re.match(r"^\s*[-*] |^\d+\. ", lines[i]):
                items.append(re.sub(r"^\s*([-*]|\d+\.) ", "", lines[i]))
            else:  # continuation line
                items[-1] += " " + lines[i].strip()
            i += 1
        out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
    else:
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||>|---|\s*[-*] |\d+\. )", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(buf))}</p>")

nav = "".join(f'<a href="#{sid}">{t}</a>' for sid, t in toc)
page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
:root {{
  --bg: #fafaf9; --fg: #1c1917; --muted: #57534e; --line: #e7e5e4;
  --card: #ffffff; --accent: #0f766e; --head: #f5f5f4; --best: #ecfdf5; --code: #f5f5f4;
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    --bg: #12100e; --fg: #e7e5e4; --muted: #a8a29e; --line: #2e2a27;
    --card: #1a1715; --accent: #2dd4bf; --head: #231f1c; --best: #0b2a24; --code: #231f1c;
  }}
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}}
.layout {{ max-width: 1040px; margin: 0 auto; padding: 24px 16px 64px; }}
nav {{
  position: sticky; top: 0; z-index: 2; background: var(--bg);
  display: flex; gap: 6px 14px; flex-wrap: wrap; padding: 10px 0;
  border-bottom: 1px solid var(--line); font-size: 14px;
}}
nav a {{ color: var(--muted); text-decoration: none; }}
nav a:hover {{ color: var(--accent); }}
h1 {{ font-size: 2rem; margin: 28px 0 8px; }}
h2 {{ font-size: 1.4rem; margin: 40px 0 12px; padding-top: 8px; scroll-margin-top: 56px; }}
h3 {{ font-size: 1.1rem; margin: 28px 0 8px; }}
h4 {{ font-size: .95rem; margin: 20px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }}
p, li {{ max-width: 78ch; }}
hr {{ border: 0; border-top: 1px solid var(--line); margin: 28px 0; }}
blockquote {{
  margin: 16px 0; padding: 10px 16px; background: var(--card);
  border-left: 3px solid var(--accent); color: var(--muted); max-width: 78ch;
}}
code {{ background: var(--code); padding: 1px 5px; border-radius: 4px; font: .88em ui-monospace, SFMono-Regular, Menlo, monospace; }}
.table-wrap {{ overflow-x: auto; margin: 12px 0 20px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }}
table {{ border-collapse: collapse; width: 100%; font-size: 14.5px; }}
th, td {{ padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }}
td:not(.num) {{ white-space: normal; }}
th {{ background: var(--head); font-weight: 600; }}
td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
th:not(:first-child) {{ text-align: left; }}
tbody tr:last-child td {{ border-bottom: 0; }}
tr.best td {{ background: var(--best); }}
tbody tr:hover td {{ background: var(--head); }}
tr.best:hover td {{ background: var(--best); }}
ul, ol {{ padding-left: 1.4em; }}
li {{ margin: 4px 0; }}
</style>
</head>
<body>
<div class="layout">
<nav>{nav}</nav>
{chr(10).join(out)}
</div>
</body>
</html>
"""
(root / "findings.html").write_text(page)
print(f"wrote findings.html ({len(page)//1024} KB, {page.count('<table>')} tables, {len(toc)} sections)")
