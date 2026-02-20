import { useEffect, useRef } from 'react';

const LOGO_SRC = '/capa face_lupita-01.png';
const LUM_THRESHOLD = 120;

/**
 * Process the logo image: strip background, tint letters, and auto-crop
 * to the bounding box of visible (non-transparent) pixels.
 */
function processLogo(canvas: HTMLCanvasElement) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = LOGO_SRC;

  img.onload = () => {
    // --- Phase 1: draw on a temporary canvas at original size ---
    const tmp = document.createElement('canvas');
    tmp.width = img.width;
    tmp.height = img.height;
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) return;

    tmpCtx.drawImage(img, 0, 0);
    const imageData = tmpCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;

    const isDark = document.documentElement.classList.contains('dark');
    // Amber: #f59e0b = rgb(245, 158, 11)
    const tintR = isDark ? 245 : 20;
    const tintG = isDark ? 158 : 20;
    const tintB = isDark ? 11 : 20;

    // Track bounding box of visible pixels
    let minX = img.width, minY = img.height, maxX = 0, maxY = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum > LUM_THRESHOLD) {
        // Background pixel — fully transparent
        data[i + 3] = 0;
      } else {
        // Letter pixel — tint and compute opacity
        const opacity = Math.round(255 * (1 - lum / LUM_THRESHOLD));
        data[i] = tintR;
        data[i + 1] = tintG;
        data[i + 2] = tintB;
        data[i + 3] = Math.min(255, opacity);

        // Update bounding box
        const px = (i / 4) % img.width;
        const py = Math.floor((i / 4) / img.width);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }

    tmpCtx.putImageData(imageData, 0, 0);

    // --- Phase 2: crop to bounding box and draw on the real canvas ---
    if (maxX <= minX || maxY <= minY) return; // no visible pixels

    // Add a small padding (2px)
    const pad = 2;
    const cx = Math.max(0, minX - pad);
    const cy = Math.max(0, minY - pad);
    const cw = Math.min(img.width - cx, maxX - minX + 1 + pad * 2);
    const ch = Math.min(img.height - cy, maxY - minY + 1 + pad * 2);

    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(tmp, cx, cy, cw, ch, 0, 0, cw, ch);
  };
}

/**
 * Lupita Pizzaria logo — loads the original brand image, strips the
 * colored background at runtime using a canvas, tints the letters
 * to the desired color, and auto-crops to the text bounding box.
 */
export function LupitaLogo({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initial render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    processLogo(canvas);
  }, []);

  // Re-render when theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      processLogo(canvas);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Lupita Pizzaria"
      className={className}
    />
  );
}
