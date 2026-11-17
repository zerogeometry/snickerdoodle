"""Set a Chrome-made leaflet PDF's page to the exact trim + bleed size, and add TrimBox/BleedBox.

python boxes.py FILE.pdf WIDTH_MM HEIGHT_MM BLEED_MM   (called by build.mjs; needs pypdf)
Chrome lays the page out from the top-left and rounds the page size up a little, so the spare
fraction of a millimetre is cut from the right and bottom edges (it's only background).
"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

f, w_mm, h_mm, bleed_mm = sys.argv[1], *map(float, sys.argv[2:5])
pt = 72 / 25.4
W, H, B = w_mm * pt, h_mm * pt, bleed_mm * pt
r = PdfReader(f)
wr = PdfWriter()
for page in r.pages:
    top = float(page.mediabox.top)
    box = RectangleObject([0, top - H, W, top])
    page.mediabox = box
    page.cropbox = box
    page.bleedbox = box
    page.trimbox = RectangleObject([B, top - H + B, W - B, top - B])
    wr.add_page(page)
wr.add_metadata({'/Title': 'Snickerdoodle leaflet', '/Author': 'Snickerdoodle (Launch Mode Ltd)'})
with open(f, 'wb') as fh:
    wr.write(fh)
