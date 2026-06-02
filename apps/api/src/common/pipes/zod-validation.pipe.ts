import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = (result.error as ZodError).issues.map((e: { path: PropertyKey[]; message: string }) => ({
        field: e.path.map(String).join('.'),
        message: e.message,
      }));
      throw new BadRequestException({ message: '輸入資料驗證失敗', errors });
    }
    return result.data;
  }
}
