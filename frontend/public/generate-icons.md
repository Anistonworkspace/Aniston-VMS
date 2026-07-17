# PWA Icon Generation

The app requires these icon files in `frontend/public/`:

- `icon-192.png` — Standard PWA icon (192×192)
- `icon-512.png` — Standard PWA icon (512×512)
- `icon-maskable-192.png` — Maskable icon with safe zone padding (192×192)
- `icon-maskable-512.png` — Maskable icon with safe zone padding (512×512)

## How to generate (one-time setup)

### Option A — Use RealFaviconGenerator (recommended)
1. Go to https://realfavicongenerator.net
2. Upload your logo SVG
3. Download and place the four PNG files here

### Option B — Use the SVG source + sharp (automated)
```bash
npm install -g sharp-cli
sharp -i public/icon.svg -o public/icon-192.png resize 192 192
sharp -i public/icon.svg -o public/icon-512.png resize 512 512
sharp -i public/icon.svg -o public/icon-maskable-192.png resize 192 192
sharp -i public/icon.svg -o public/icon-maskable-512.png resize 512 512
```

### Option C — Use the placeholder script
```bash
node scripts/generate-pwa-icons.js
```
See `scripts/generate-pwa-icons.js` for the canvas-based placeholder generator.
