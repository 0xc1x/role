import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  name: z.string().min(2),
  age: z.number().int().positive(),
});

describe('ZodValidationPipe', () => {
  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(schema);
  });

  it('devuelve los datos parseados cuando son válidos', () => {
    const out = pipe.transform({ name: 'Café', age: 5 });
    expect(out).toEqual({ name: 'Café', age: 5 });
  });

  it('aplica coercion/defaults del schema', () => {
    const withDefault = new ZodValidationPipe(
      z.object({ page: z.coerce.number().default(1) }),
    );
    expect(withDefault.transform({})).toEqual({ page: 1 });
    expect(withDefault.transform({ page: '3' })).toEqual({ page: 3 });
  });

  it('rechaza con BadRequest y detalles por issue con path', () => {
    try {
      pipe.transform({ name: 'x', age: -1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        message: string;
        details: { path: string; message: string }[];
      };
      expect(response.message).toBe('Validation failed');
      const paths = response.details.map((d) => d.path).sort();
      expect(paths).toEqual(['age', 'name']);
    }
  });

  it('anida el path de campos anidados con puntos', () => {
    const nested = new ZodValidationPipe(
      z.object({ address: z.object({ city: z.string().min(1) }) }),
    );
    try {
      nested.transform({ address: { city: '' } });
      throw new Error('should have thrown');
    } catch (err) {
      const response = (err as BadRequestException).getResponse() as {
        details: { path: string }[];
      };
      expect(response.details[0]!.path).toBe('address.city');
    }
  });
});
