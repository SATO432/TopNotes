from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024


def vertical_gradient(size, top, bottom):
    image = Image.new("RGBA", size)
    pixels = image.load()
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        color = tuple(round(top[index] + (bottom[index] - top[index]) * t) for index in range(4))
        for x in range(size[0]):
            pixels[x, y] = color
    return image


def rounded_mask(size, box, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    return mask


def glow_circle(canvas, center, radius, color, blur):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = center
    draw.ellipse(
        (x - radius, y - radius, x + radius, y + radius),
        fill=(*color, 190),
    )
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(layer)


def draw_light(canvas, center, color):
    x, y = center
    glow_circle(canvas, center, 94, color, 42)

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((x - 82, y - 82, x + 82, y + 82), fill=(0, 0, 0, 210))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    canvas.alpha_composite(shadow)

    draw = ImageDraw.Draw(canvas)
    draw.ellipse((x - 66, y - 66, x + 66, y + 66), fill=(*color, 255))
    draw.ellipse((x - 58, y - 58, x + 58, y + 58), outline=(255, 255, 255, 32), width=5)
    draw.ellipse((x - 35, y - 43, x + 5, y - 10), fill=(255, 255, 255, 76))


def create_icon():
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    body_box = (40, 40, SIZE - 40, SIZE - 40)
    body_mask = rounded_mask((SIZE, SIZE), body_box, 230)
    body = vertical_gradient((SIZE, SIZE), (26, 34, 39, 255), (7, 10, 12, 255))
    canvas.alpha_composite(Image.composite(body, Image.new("RGBA", (SIZE, SIZE)), body_mask))

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(body_box, radius=230, outline=(58, 69, 75, 255), width=18)
    draw.rounded_rectangle((66, 66, SIZE - 66, SIZE - 66), radius=205, outline=(255, 255, 255, 20), width=4)

    sheen = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sheen_draw = ImageDraw.Draw(sheen)
    sheen_draw.polygon([(150, 120), (874, 150), (840, 330), (180, 330)], fill=(255, 255, 255, 18))
    sheen = sheen.filter(ImageFilter.GaussianBlur(24))
    canvas.alpha_composite(Image.composite(sheen, Image.new("RGBA", (SIZE, SIZE)), body_mask))

    rail_box = (190, 382, 834, 642)
    rail_mask = rounded_mask((SIZE, SIZE), rail_box, 112)
    rail = vertical_gradient((SIZE, SIZE), (22, 30, 34, 255), (5, 7, 8, 255))
    canvas.alpha_composite(Image.composite(rail, Image.new("RGBA", (SIZE, SIZE)), rail_mask))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(rail_box, radius=112, outline=(61, 73, 79, 255), width=10)
    draw.line((266, 405, 758, 405), fill=(255, 255, 255, 46), width=8)
    draw.line((268, 620, 756, 620), fill=(0, 0, 0, 128), width=8)

    draw_light(canvas, (330, 512), (101, 215, 157))
    draw_light(canvas, (512, 512), (255, 95, 104))
    draw_light(canvas, (694, 512), (101, 215, 157))

    canvas.save(ROOT / "TopNotes.png")
    canvas.resize((512, 512), Image.Resampling.LANCZOS).save(ROOT / "TopNotes-512.png")
    canvas.save(
        ROOT / "TopNotes.ico",
        format="ICO",
        sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    create_icon()
