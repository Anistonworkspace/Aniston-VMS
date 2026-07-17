# Desktop Assets

Place your branded icon files here before building:

| File | Format | Size | Used for |
|------|--------|------|---------|
| `icon.ico` | ICO (multi-size) | 256×256 min | Windows taskbar + installer |
| `icon.png` | PNG | 512×512 | Window title bar |
| `tray-icon.png` | PNG | 32×32 (shown at 16×16) | System tray |
| `icon.icns` | ICNS | macOS format | macOS (future) |

## Generating from SVG (recommended)

```bash
# Windows ICO — requires ImageMagick
magick convert -resize 256x256 icon.svg icon.ico

# Tray icon
magick convert -resize 32x32 icon.svg tray-icon.png

# PNG for window
magick convert -resize 512x512 icon.svg icon.png
```

For macOS ICNS use `iconutil` (macOS only) or an online converter.

> Replace these placeholder files with your actual brand assets before distributing.
