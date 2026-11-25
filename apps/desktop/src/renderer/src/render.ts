import type { Crop, FitMode, ImageProbe } from '@wallpepper/core';
import { img } from './ctx';

/** Measures an image through the on-disk cache (step 1 of the compatibility check). */
export const probeImage: ImageProbe = (url) =>
  new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ width: el.naturalWidth, height: el.naturalHeight });
    el.onerror = () => reject(new Error('Could not load the image'));
    el.src = img(url);
  });

/**
 * Draws a picture onto a screen sized canvas: a chosen crop filling the screen, or the whole picture over a
 * blurred copy of itself. Returns a JPEG; the main process then sets it as the wallpaper / saves it.
 */
export async function composeImage(url: string, fit: FitMode, crop: Crop | undefined, width: number, height: number): Promise<ArrayBuffer> {
  const res = await fetch(img(url));
  if (!res.ok) throw new Error('Could not load the image');
  const bmp = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // source region
  const sx = crop ? crop.x * bmp.width : 0;
  const sy = crop ? crop.y * bmp.height : 0;
  const sw = crop ? crop.w * bmp.width : bmp.width;
  const sh = crop ? crop.h * bmp.height : bmp.height;

  const cover = Math.max(width / sw, height / sh);
  if (crop || fit === 'fill') {
    ctx.drawImage(bmp, sx, sy, sw, sh, (width - sw * cover) / 2, (height - sh * cover) / 2, sw * cover, sh * cover);
  } else if (fit === 'blur') {
    // blurred copy of the picture as the background (a little bigger so the blur does not fade at the edges)
    ctx.filter = `blur(${Math.round(Math.max(width, height) / 40)}px)`;
    const big = cover * 1.15;
    ctx.drawImage(bmp, 0, 0, bmp.width, bmp.height, (width - bmp.width * big) / 2, (height - bmp.height * big) / 2, bmp.width * big, bmp.height * big);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(0, 0, width, height);
    const fitScale = Math.min(width / bmp.width, height / bmp.height);
    ctx.drawImage(bmp, (width - bmp.width * fitScale) / 2, (height - bmp.height * fitScale) / 2, bmp.width * fitScale, bmp.height * fitScale);
  } else {
    const fitScale = Math.min(width / bmp.width, height / bmp.height);
    ctx.drawImage(bmp, (width - bmp.width * fitScale) / 2, (height - bmp.height * fitScale) / 2, bmp.width * fitScale, bmp.height * fitScale);
  }
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Could not render the wallpaper');
  return blob.arrayBuffer();
}
