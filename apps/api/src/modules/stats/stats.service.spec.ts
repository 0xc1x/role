import { StatsService } from './stats.service';

/** Builder drizzle simulado: thenable, resuelve con el count dado. */
function makeBuilder(result: { count: number }) {
  const builder: Record<string, unknown> = {};
  builder.from = jest.fn(() => builder);
  builder.where = jest.fn(() => builder);
  builder.select = jest.fn(() => builder);
  builder.then = (
    resolve: (value: [{ count: number }]) => unknown,
    reject: (reason?: unknown) => unknown,
  ) => Promise.resolve([result]).then(resolve, reject);
  return builder;
}

describe('StatsService', () => {
  let service: StatsService;
  let db: { select: jest.Mock };

  beforeEach(() => {
    db = {
      select: jest
        .fn()
        .mockImplementationOnce(() => makeBuilder({ count: 4 }))
        .mockImplementationOnce(() => makeBuilder({ count: 12 }))
        .mockImplementationOnce(() => makeBuilder({ count: 20 })),
    };
    service = new StatsService(db as never);
  });

  it('devuelve stats reales de usuarios, negocios y comidas salvadas', async () => {
    const stats = await service.getPlatformStats();
    expect(stats).toEqual({ users: 4, businesses: 12, meals_saved: 20 });
  });

  it('devuelve ceros si las consultas no encuentran filas', async () => {
    db.select = jest
      .fn()
      .mockImplementation(() => makeBuilder({ count: 0 }));
    const stats = await service.getPlatformStats();
    expect(stats).toEqual({ users: 0, businesses: 0, meals_saved: 0 });
  });
});
