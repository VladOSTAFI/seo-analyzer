import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Minimal Zod-backed validation pipe. The codebase already validates env with
 * Zod (see config/env.validation.ts); reusing Zod here avoids pulling in
 * class-validator/class-transformer just for the API. Construct with a schema
 * and attach via `@Body(new ZodValidationPipe(schema))` / `@Query(...)`.
 *
 * On failure it throws a NestJS BadRequestException (→ HTTP 400) carrying a
 * flattened, human-readable list of issues. On success it returns the parsed
 * (and coerced/defaulted) value, so downstream handlers get typed, clean input.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      );
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: messages,
      });
    }
    return result.data;
  }
}
