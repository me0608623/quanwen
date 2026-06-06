import { Injectable } from '@nestjs/common';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join, extname, basename } from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

@Injectable()
export class UploadService {
  /** Ensure upload directory exists */
  async ensureDir(): Promise<void> {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  /** Validate mime type */
  isValidImage(mimetype: string): boolean {
    return ALLOWED_MIMES.includes(mimetype);
  }

  /** Max file size in bytes */
  get maxSize(): number {
    return MAX_SIZE;
  }

  /**
   * Save a file buffer to disk with a unique name.
   * Returns the relative URL path for serving.
   */
  async save(file: { buffer: Buffer; originalname: string; mimetype: string }): Promise<string> {
    await this.ensureDir();

    if (!this.isValidImage(file.mimetype)) {
      throw new Error(`不支援的圖片格式: ${file.mimetype}。支援: JPEG, PNG, GIF, WebP, SVG`);
    }

    const ext = extname(file.originalname) || this.mimeToExt(file.mimetype);
    const filename = `${randomUUID()}${ext}`;
    const filepath = join(UPLOAD_DIR, filename);

    await writeFile(filepath, file.buffer);

    return `/uploads/${filename}`;
  }

  /** Delete a previously uploaded file by its URL path */
  async delete(urlPath: string): Promise<void> {
    if (!urlPath?.startsWith('/uploads/')) return;
    const filename = urlPath.slice('/uploads/'.length);
    // 僅允許刪除上傳目錄內的單一檔案：阻擋路徑穿越（../、絕對路徑、子目錄）。
    // save() 產生的檔名一律是 `<uuid><ext>`，因此限定為純 basename。
    if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename.includes('..')) return;
    const filepath = join(UPLOAD_DIR, filename);
    if (filepath !== join(UPLOAD_DIR, basename(filename))) return;
    try {
      await unlink(filepath);
    } catch {
      // File may already be deleted — ignore
    }
  }

  private mimeToExt(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    return map[mimetype] ?? '.bin';
  }
}
