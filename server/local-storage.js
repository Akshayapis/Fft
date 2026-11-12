import fs from 'node:fs';
import path from 'node:path';
import { uid, HttpError } from '../shared/utils.js';

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

export function createLocalStorage({ dataDir }) {
  const root = path.join(dataDir, 'uploads');
  fs.mkdirSync(root, { recursive: true });
  return {
    root,
    async save(dataUrl, userId, kind = 'attachment') {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) throw new HttpError(400, 'Upload a valid image file.');
      const match = /^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
      if (!match) throw new HttpError(400, 'Only base64 PNG, JPG, WEBP, GIF or PDF uploads are accepted.');
      const ext = TYPES[match[1].toLowerCase()];
      if (!ext) throw new HttpError(400, 'Unsupported file type. Use PNG, JPG, WEBP, GIF or PDF.');
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 3 * 1024 * 1024) throw new HttpError(400, 'File is too large (max 3 MB).');
      const safeKind = String(kind).replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || 'attachment';
      const name = `${safeKind}_${uid('')}.${ext}`;
      const dir = path.join(root, String(userId).replace(/[^a-zA-Z0-9_-]/g, ''));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), buffer);
      return `/uploads/${path.basename(dir)}/${name}`;
    },
  };
}
