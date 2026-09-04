import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationJobs } from './notification.jobs';
import { NotificationHandlers } from './notification.handlers';

describe('NotificationJobs', () => {
  let jobs: NotificationJobs;
  let handlers: jest.Mocked<NotificationHandlers>;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationJobs,
        {
          provide: NotificationHandlers,
          useValue: {
            pickupReminders: jest.fn(),
            weeklySummary: jest.fn(),
            dispatchNearbyOffers: jest.fn(),
            cleanupOldTokens: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn(() => true) } },
      ],
    }).compile();

    jobs = module.get(NotificationJobs);
    handlers = module.get(NotificationHandlers);
    config = module.get(ConfigService);
  });

  it('cada job delega en su handler correspondiente', async () => {
    handlers.pickupReminders.mockResolvedValue(3);
    handlers.weeklySummary.mockResolvedValue(0);
    handlers.dispatchNearbyOffers.mockResolvedValue(10);
    handlers.cleanupOldTokens.mockResolvedValue(4);

    await jobs.handlePickupReminders();
    await jobs.handleWeeklySummary();
    await jobs.handleNearbyOffers();
    await jobs.handleCleanupTokens();

    expect(handlers.pickupReminders).toHaveBeenCalledTimes(1);
    expect(handlers.weeklySummary).toHaveBeenCalledTimes(1);
    expect(handlers.dispatchNearbyOffers).toHaveBeenCalledTimes(1);
    expect(handlers.cleanupOldTokens).toHaveBeenCalledTimes(1);
  });

  it('dormido sin ENABLE_API_MIRROR_NOTIFICATIONS no ejecuta nada', async () => {
    config.get.mockReturnValue(false);

    await jobs.handlePickupReminders();
    await jobs.handleWeeklySummary();
    await jobs.handleNearbyOffers();
    await jobs.handleCleanupTokens();

    expect(handlers.pickupReminders).not.toHaveBeenCalled();
    expect(handlers.weeklySummary).not.toHaveBeenCalled();
    expect(handlers.dispatchNearbyOffers).not.toHaveBeenCalled();
    expect(handlers.cleanupOldTokens).not.toHaveBeenCalled();
  });

  it('un handler que falla no lanza y no bloquea los demás jobs', async () => {
    handlers.pickupReminders.mockRejectedValue(new Error('expo down'));
    handlers.cleanupOldTokens.mockResolvedValue(1);

    await expect(jobs.handlePickupReminders()).resolves.toBeUndefined();
    await expect(jobs.handleCleanupTokens()).resolves.toBeUndefined();
  });

  it('la guarda anti-reentrada es por job: dos jobs pueden solaparse', async () => {
    let releasePickup!: () => void;
    handlers.pickupReminders.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePickup = () => resolve(0);
        }),
    );
    handlers.cleanupOldTokens.mockResolvedValue(2);

    const pickupRun = jobs.handlePickupReminders();
    await jobs.handleCleanupTokens(); // distinta key → sí corre en paralelo

    expect(handlers.cleanupOldTokens).toHaveBeenCalledTimes(1);

    releasePickup();
    await pickupRun;
  });

  it('el mismo job solapado se salta y recupera la clave al terminar', async () => {
    let release!: () => void;
    handlers.weeklySummary.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(0);
        }),
    );

    const first = jobs.handleWeeklySummary();
    await jobs.handleWeeklySummary(); // misma key → skip
    expect(handlers.weeklySummary).toHaveBeenCalledTimes(1);

    release();
    await first;

    handlers.weeklySummary.mockResolvedValue(5);
    await jobs.handleWeeklySummary(); // clave liberada → corre de nuevo
    expect(handlers.weeklySummary).toHaveBeenCalledTimes(2);
  });
});
