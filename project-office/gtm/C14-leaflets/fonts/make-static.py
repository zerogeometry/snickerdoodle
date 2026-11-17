"""Static Bricolage Grotesque instances for print (Chrome embeds the variable font as Type 3, which some
print shops' checks reject). Run once from the repo root, with fontTools installed:
    python project-office/gtm/C14-leaflets/fonts/make-static.py
Optical size: small for body/labels, mid for headings (the site lets the browser pick it per size)."""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
SRC = 'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-standard-normal.woff2'
OUT = os.path.dirname(os.path.abspath(__file__))
for w, opsz in ((400, 14), (700, 14), (800, 32)):
    f = instancer.instantiateVariableFont(TTFont(SRC), {'wght': w, 'opsz': opsz, 'wdth': 100}, updateFontNames=False)
    f.flavor = None
    for rec in f['name'].names:  # its own name, so the PDF lists a plain TrueType font per weight
        if rec.nameID in (1, 4, 16): rec.string = f'BricolageLeaflet{w}'
        if rec.nameID == 6: rec.string = f'BricolageLeaflet-{w}'
        if rec.nameID in (2, 17): rec.string = 'Regular'
    f.save(os.path.join(OUT, f'BricolageGrotesque-{w}.ttf'))
    print('wrote', w, 'opsz', opsz)
