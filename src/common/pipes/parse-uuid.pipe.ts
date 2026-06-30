// src/common/pipes/parse-uuid.pipe.ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes.js';

// UUID v4 regex
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ParseUUIDPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID_V4_REGEX.test(value)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Parameter harus berupa UUID v4 yang valid, diterima: "${value}"`,
      });
    }
    return value;
  }
}
