export interface CompressedMeterPhoto {
  dataUrl: string;
  mimeType: 'image/jpeg';
}

const MAX_DIMENSION = 1024;
const MAX_DATA_URL_LENGTH = 450_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
    img.src = src;
  });
}

/**
 * Compresses and resizes a captured or uploaded water meter photo client-side
 * so it uploads rapidly on mobile networks and stays well within Firestore's document limit.
 */
export async function compressMeterPhoto(file: File): Promise<CompressedMeterPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Select a valid image file (JPEG, PNG, or WebP).');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(rawDataUrl);

  let width = img.naturalWidth || img.width || 800;
  let height = img.naturalHeight || img.height || 600;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process photo in this browser.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [0.74, 0.62, 0.5, 0.38];
  for (const q of qualities) {
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
      return { dataUrl, mimeType: 'image/jpeg' };
    }
  }

  // Final smaller fallback for extremely dense high-frequency photos
  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = Math.max(1, Math.round(width * 0.65));
  fallbackCanvas.height = Math.max(1, Math.round(height * 0.65));
  const fCtx = fallbackCanvas.getContext('2d');
  if (!fCtx) {
    throw new Error('Unable to compress photo.');
  }
  fCtx.fillStyle = '#ffffff';
  fCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
  fCtx.drawImage(img, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
  const finalUrl = fallbackCanvas.toDataURL('image/jpeg', 0.5);
  if (finalUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error('Photo file is too large even after compression. Please retake closer to the meter.');
  }
  return { dataUrl: finalUrl, mimeType: 'image/jpeg' };
}
