import { describe, expect, it } from 'vitest';
import { UpdateCommissionSchema } from '../schemas/commission.schema';

describe('UpdateCommissionSchema', () => {
  it('accepts valid commission rate', () => {
    expect(UpdateCommissionSchema.safeParse({ commission_rate: 0.1 }).success).toBe(true);
  });

  it('rejects rate above 1', () => {
    expect(UpdateCommissionSchema.safeParse({ commission_rate: 1.5 }).success).toBe(false);
  });
});
