"""Turn rendered leaflet sides (RGB PNGs, full bleed) into one CMYK PDF.

Called by build.mjs --cmyk:  python cmyk.py OUT.pdf WIDTH_MM HEIGHT_MM side1.png side2.png ...
Uses Pillow + the press profile that ships with Windows (RSWOP.icm, US web coated). UK printers
usually work to FOGRA39 (coated) or FOGRA29/52 (uncoated), so the printer's own conversion of the
RGB PDF is normally better; this file is only for a printer that refuses RGB.
"""
import sys
from PIL import Image, ImageCms

out, w_mm, h_mm, *pages = sys.argv[1:]
w_mm, h_mm = float(w_mm), float(h_mm)
srgb = ImageCms.createProfile('sRGB')
press = ImageCms.getOpenProfile(r'C:\Windows\System32\spool\drivers\color\RSWOP.icm')
to_cmyk = ImageCms.buildTransform(srgb, press, 'RGB', 'CMYK', renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC)

sides = []
for p in pages:
    im = Image.open(p).convert('RGB')
    sides.append(ImageCms.applyTransform(im, to_cmyk))

dpi = sides[0].width / (w_mm / 25.4)
sides[0].save(out, 'PDF', save_all=True, append_images=sides[1:], resolution=dpi, quality=92)
print(f'wrote {out} ({len(sides)} pages, {dpi:.0f} dpi CMYK)')
