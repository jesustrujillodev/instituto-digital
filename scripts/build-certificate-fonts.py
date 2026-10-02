"""Instancias estáticas y subconjunto de las fuentes OFL del editor de certificados.

Uso: python scripts/build-certificate-fonts.py <carpeta con los .ttf de google/fonts>

Escribe public/font/cert/<id>-<peso>[-italic].v1.woff2. Un archivo publicado no se
reescribe nunca: los certificados emitidos dependen de sus métricas. Para cambiar una
fuente se publica con otra versión (.v2) y otro id en el catálogo.
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

UNICODES = "U+0020-007E,U+00A0-017F,U+2010-2027,U+2030-203A,U+20AC,U+2122"

FACES = [
    ("eb-garamond", "ebgaramond/EBGaramond[wght].ttf", 400, False),
    ("eb-garamond", "ebgaramond/EBGaramond[wght].ttf", 600, False),
    ("eb-garamond", "ebgaramond/EBGaramond[wght].ttf", 700, False),
    ("eb-garamond", "ebgaramond/EBGaramond-Italic[wght].ttf", 400, True),
    ("playfair", "playfairdisplay/PlayfairDisplay[wght].ttf", 400, False),
    ("playfair", "playfairdisplay/PlayfairDisplay[wght].ttf", 700, False),
    ("playfair", "playfairdisplay/PlayfairDisplay-Italic[wght].ttf", 400, True),
    ("cinzel", "cinzel/Cinzel[wght].ttf", 400, False),
    ("cinzel", "cinzel/Cinzel[wght].ttf", 700, False),
    ("great-vibes", "greatvibes/GreatVibes-Regular.ttf", 400, False),
    ("source-sans", "sourcesans3/SourceSans3[wght].ttf", 400, False),
    ("source-sans", "sourcesans3/SourceSans3[wght].ttf", 600, False),
    ("source-sans", "sourcesans3/SourceSans3[wght].ttf", 700, False),
]


def build(source_dir: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for font_id, source, weight, italic in FACES:
        name = f"{font_id}-{weight}{'-italic' if italic else ''}.v1.woff2"
        target = out_dir / name
        if target.exists():
            print(f"existe, no se reescribe: {name}")
            continue

        font = TTFont(source_dir / source)
        if "fvar" in font:
            font = instancer.instantiateVariableFont(font, {"wght": weight})

        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
        options.name_IDs = ["*"]
        options.notdef_outline = True
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
        subsetter.subset(font)
        font.flavor = "woff2"
        font.save(target)
        print(f"{name}: {target.stat().st_size} bytes")


if __name__ == "__main__":
    build(Path(sys.argv[1]), Path(__file__).resolve().parent.parent / "public" / "font" / "cert")
