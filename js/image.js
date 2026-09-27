// 照片處理：壓縮尺寸、產生縮圖、讀取 EXIF 的 GPS 與拍攝時間
import { parse } from '../vendor/exifr-lite.esm.js';

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function resize(img, maxSize, quality) {
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function readMeta(file) {
  const meta = { lat: null, lng: null, takenAt: null };
  try {
    // lite 版不支援 pick 參數，直接解析預設區塊（含 EXIF 與 GPS）
    const exif = await parse(file);
    if (Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude)) {
      meta.lat = exif.latitude;
      meta.lng = exif.longitude;
    }
    const d = exif?.DateTimeOriginal || exif?.CreateDate;
    if (d instanceof Date && !isNaN(d)) meta.takenAt = d.getTime();
  } catch { /* 沒有 EXIF 資訊 */ }
  return meta;
}

export async function processPhoto(file) {
  const [meta, img] = await Promise.all([readMeta(file), loadImage(file)]);
  const [blob, thumb] = await Promise.all([resize(img, 1920, 0.85), resize(img, 480, 0.8)]);
  return { blob, thumb, ...meta };
}
