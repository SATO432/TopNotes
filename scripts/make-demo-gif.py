import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
FRAME_DIR = ROOT / "artifacts" / "demo-frames"
OUTPUT = ROOT / "demo" / "TopNotes-demo.gif"
CROP_HEIGHT = 575
CAPTION_HEIGHT = 48
TARGET_WIDTH = 760


def load_font(size):
    candidates = [
        Path("C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/msyhbd.ttc"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
    ]
    for path in candidates:
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                pass
    return ImageFont.load_default()


def draw_cursor(image, point, clicking):
    if not point:
        return
    draw = ImageDraw.Draw(image, "RGBA")
    x = int(point["x"])
    y = int(point["y"])
    if clicking:
        draw.ellipse((x - 14, y - 14, x + 14, y + 14), outline=(255, 255, 255, 180), width=3)
    draw.polygon(
        [(x, y), (x + 20, y + 12), (x + 11, y + 14), (x + 7, y + 24)],
        fill=(255, 255, 255, 245),
        outline=(10, 12, 14, 255),
        width=2,
    )


def main():
    frames = json.loads((FRAME_DIR / "frames.json").read_text(encoding="utf-8"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    font = load_font(17)
    rendered = []

    for entry in frames:
        source = Image.open(ROOT / entry["file"]).convert("RGB")
        source = source.crop((0, 0, source.width, min(CROP_HEIGHT, source.height)))
        scale = TARGET_WIDTH / source.width
        source = source.resize((TARGET_WIDTH, round(source.height * scale)), Image.Resampling.LANCZOS)
        cursor = entry.get("cursor")
        if cursor:
            cursor = {"x": cursor["x"] * scale, "y": cursor["y"] * scale}
        draw_cursor(source, cursor, entry.get("click"))

        canvas = Image.new("RGB", (source.width, source.height + CAPTION_HEIGHT), (9, 11, 13))
        canvas.paste(source, (0, 0))
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((0, source.height, canvas.width, canvas.height), fill=(9, 11, 13))
        draw.rectangle((0, source.height, canvas.width, source.height + 1), fill=(54, 64, 70))
        draw.ellipse((16, source.height + 19, 24, source.height + 27), fill=(101, 215, 157))
        draw.text(
            (34, source.height + 12),
            entry["caption"],
            fill=(239, 244, 242),
            font=font,
        )
        rendered.append((canvas, entry.get("duration", 1300)))

    palette_frames = [
        frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=160)
        for frame, _ in rendered
    ]
    palette_frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=palette_frames[1:],
        duration=[duration for _, duration in rendered],
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
