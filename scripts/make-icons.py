from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
out = root / "icons"
out.mkdir(exist_ok=True)
scale = 4
for size in (16, 32, 48, 128):
    image = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    n = size * scale
    draw.rounded_rectangle((1, 1, n - 2, n - 2), radius=n * .28, fill="#43654d")
    width = max(3, int(n * .046))
    def pt(x, y): return (int(n*x), int(n*y))
    draw.line([pt(.22,.29),pt(.34,.29),pt(.5,.36),pt(.66,.29),pt(.78,.29),pt(.78,.69),pt(.66,.69),pt(.5,.77),pt(.34,.69),pt(.22,.69),pt(.22,.29)], fill="#f1f4dc", width=width, joint="curve")
    draw.line([pt(.5,.36),pt(.5,.77)], fill="#f1f4dc", width=width)
    draw.line([pt(.3,.43),pt(.4,.46)], fill="#c6d6ab", width=max(2,int(width*.65)))
    draw.line([pt(.6,.46),pt(.7,.43)], fill="#c6d6ab", width=max(2,int(width*.65)))
    image.resize((size, size), Image.Resampling.LANCZOS).save(out / f"{size}.png")
print("Generated 4 extension icons.")
