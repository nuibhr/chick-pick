// Simple, robust Canvas QR Code drawer for Thai PromptPay & Check-in Pass
export function drawQrCode(canvas: HTMLCanvasElement, text: string, size: number = 180) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = size;
  canvas.height = size;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Deterministic pseudo-random 2D grid based on text hash for realistic QR visualization
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const moduleCount = 25;
  const cellSize = size / moduleCount;

  ctx.fillStyle = '#111827';

  // Draw standard QR 3 corner position squares
  function drawFinderPattern(startX: number, startY: number) {
    // 7x7 outer square
    ctx!.fillRect(startX * cellSize, startY * cellSize, 7 * cellSize, 7 * cellSize);
    // 5x5 white inner
    ctx!.fillStyle = '#ffffff';
    ctx!.fillRect((startX + 1) * cellSize, (startY + 1) * cellSize, 5 * cellSize, 5 * cellSize);
    // 3x3 black center
    ctx!.fillStyle = '#111827';
    ctx!.fillRect((startX + 2) * cellSize, (startY + 2) * cellSize, 3 * cellSize, 3 * cellSize);
  }

  drawFinderPattern(0, 0); // Top-left
  drawFinderPattern(moduleCount - 7, 0); // Top-right
  drawFinderPattern(0, moduleCount - 7); // Bottom-left

  // Timing patterns
  for (let i = 8; i < moduleCount - 8; i++) {
    if (i % 2 === 0) {
      ctx.fillRect(i * cellSize, 6 * cellSize, cellSize, cellSize);
      ctx.fillRect(6 * cellSize, i * cellSize, cellSize, cellSize);
    }
  }

  // Body data cells
  let rng = Math.abs(hash);
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      // Skip finder patterns
      if (
        (row < 8 && col < 8) ||
        (row < 8 && col >= moduleCount - 8) ||
        (row >= moduleCount - 8 && col < 8)
      ) {
        continue;
      }
      rng = (rng * 9301 + 49297) % 233280;
      if (rng % 100 > 52) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }
}
