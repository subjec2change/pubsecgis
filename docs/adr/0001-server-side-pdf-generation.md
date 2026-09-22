# 1. Server-side PDF generation for Shift Reports

Date: 2026-09-22
Status: accepted

## Context

The Shift Report is leadership's on-demand document for one shift (see
CONTEXT.md). It is previewed on screen (JSON from `GET /api/reports/shift`)
and downloadable as PDF from the preview. We must choose where the PDF is
rendered: server-side (Python, e.g. reportlab) or client-side (jsPDF /
print-CSS in React).

## Decision

Render PDFs **server-side** in the FastAPI backend. The preview view renders
from JSON; the download button calls the same report resource with
`format=pdf` (or a sibling endpoint) and receives a blob.

## Consequences

+ Works in the hospital's offline-by-design deployment — no CDN/browser
  print dependencies.
+ The PDF is regression-testable in the existing pytest suite (magic number
  + embedded text extraction), same as every other backend behavior.
+ One source of truth for report data: both preview and PDF come from the
  same server-side assembly; the client cannot drift its own numbers.
− Adds a Python PDF dependency (reportlab: pure-Python, no system libs).
− The React preview and the PDF layout are two renderings of the same data
  and can drift visually (accepted: data is shared, pixels are not).

## Considered alternatives

- **Client-side jsPDF / print-CSS**: zero backend deps and browser-native
  fonts, but untestable in headless CI, fragile in kiosk Chrome configs,
  and it re-derives report content in a second language (TS), inviting
  preview/download divergence in the direction users notice.
- **HTML → headless-Chrome → PDF server-side**: pixel-identical to the
  preview, but drags Chromium into the API container for an offline
  hospital server — disproportionate to the layout's simplicity.
