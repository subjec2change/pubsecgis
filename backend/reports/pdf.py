"""Shift Report PDF rendering (reportlab, pure Python — ADR-0001).

One function in, PDF bytes out. Preview (JSON) and PDF share the same
assembled payload; only the layout lives here.
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from types import SimpleNamespace  # noqa: F401  (typing clarity for report dict)

INK = colors.HexColor("#0b1219")
MUTED = colors.HexColor("#5b6b7a")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("Meta", parent=ss["Normal"], textColor=MUTED, fontSize=9))
    ss.add(ParagraphStyle("Section", parent=ss["Heading2"], textColor=INK,
                          spaceBefore=14, spaceAfter=6))
    return ss


def _table(data, widths=None):
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c9d3dd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f5f8")]),
    ]))
    return t


def render_shift_report_pdf(report: dict) -> bytes:
    from io import BytesIO

    ss = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        title=f"Shift Report {report['shift']['date']} {report['shift']['code']}",
        author="PUSECGIS",
    )
    s = report["shift"]
    flow = [
        Paragraph("PUSECGIS — Shift Report", ss["Title"]),
        Paragraph(
            f"{s['date']} · {s['code']} shift · {s['start_time']}–{s['end_time']}"
            + ("  ·  <b>LIVE SNAPSHOT — shift in progress</b>" if s["in_progress"] else "")
            + f"  ·  generated {report['generated_at']}",
            ss["Meta"],
        ),
        Spacer(1, 8),
    ]

    # Stats
    flow.append(Paragraph(f"Total incidents: {report['stats']['total']}", ss["Heading3"]))
    if report["stats"]["by_type"]:
        rows = [["Incident type", "Count"]] + [
            [k, str(v)] for k, v in sorted(report["stats"]["by_type"].items(),
                                           key=lambda kv: (-kv[1], kv[0]))
        ]
        flow.append(_table(rows, widths=[4 * inch, 1.2 * inch]))

    # Timeline
    flow.append(Paragraph("Reports by hour", ss["Section"]))
    flow.append(_table(
        [[b["label"] for b in report["timeline"]],
         [str(b["count"]) for b in report["timeline"]]],
    ))

    # Incident table (lean columns; full descriptions in the appendix)
    flow.append(Paragraph("Incidents", ss["Section"]))
    rows = [["Time", "Type", "Location", "Status", "Response phase"]]
    for r in report["incidents"]:
        rows.append([
            r["created_at"].replace("T", " ")[11:16],
            r["incident_type"], r["location_ref"], r["status"],
            r["response_phase"] or "",
        ])
    flow.append(_table(rows, widths=[1.0 * inch, 1.9 * inch, 2.0 * inch, 0.9 * inch, 1.4 * inch]))

    # Handoff notes
    flow.append(Paragraph("Handoff notes", ss["Section"]))
    if report["handoff_notes"]:
        for n in report["handoff_notes"]:
            flow.append(KeepTogether([
                Paragraph(
                    f"<b>{n['created_at'].replace('T', ' ')[11:16]}</b> — {n['author'] or 'unknown'}",
                    ss["Meta"],
                ),
                Paragraph(n["note"].replace("&", "&amp;").replace("<", "&lt;"), ss["BodyText"]),
                Spacer(1, 4),
            ]))
    else:
        flow.append(Paragraph("None recorded.", ss["Meta"]))

    # Description appendix
    described = [r for r in report["incidents"] if r["description"]]
    if described:
        flow.append(Paragraph("Appendix — incident descriptions", ss["Section"]))
        for r in described:
            flow.append(KeepTogether([
                Paragraph(
                    f"<b>#{r['id']}</b> · {r['created_at']} · {r['incident_type']} · {r['location_ref']}",
                    ss["Meta"],
                ),
                Paragraph(
                    r["description"].replace("&", "&amp;").replace("<", "&lt;"),
                    ss["BodyText"],
                ),
                Spacer(1, 4),
            ]))

    doc.build(flow)
    return buf.getvalue()
