import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  /**
   * POST /upload/image
   * 上傳單張圖片(multipart/form-data,欄位名 file)。
   * 限 5MB、僅圖片格式;回傳可供前端使用的相對 URL。
   */
  @Post('image')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadImage(
    // 只取真正用到的欄位,避開 @types/multer 依賴(與 surveys.controller 一致)
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('缺少 file 欄位(multipart/form-data)');
    }
    if (!this.upload.isValidImage(file.mimetype ?? '')) {
      throw new BadRequestException('不支援的圖片格式。支援: JPEG, PNG, GIF, WebP, SVG');
    }
    const url = await this.upload.save({
      buffer: file.buffer,
      originalname: file.originalname ?? 'upload',
      mimetype: file.mimetype ?? '',
    });
    return { success: true, data: { url } };
  }

  /**
   * DELETE /upload
   * 依 URL 路徑刪除先前上傳的檔案。Body: { "url": "/uploads/xxx.png" }
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteImage(@Body('url') url: string) {
    await this.upload.delete(url);
    return { success: true };
  }
}
