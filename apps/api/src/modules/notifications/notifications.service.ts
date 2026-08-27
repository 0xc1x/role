import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseRedisUrl } from '../../common/utils/redis';
import type { Env } from '../../config/env.schema';
import { NotificationsRepository } from './notifications.repository';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type EnqueuePushJob = {
  userIds: string[];
  payload: PushPayload;
  prefFlag?: string;
};

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private fcmAccessToken: string | null = null;
  private fcmTokenExpiry = 0;
  private queue: import('bullmq').Queue | null = null;
  private worker: import('bullmq').Worker | null = null;

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    if (!redisUrl) {
      this.logger.log('REDIS_URL not set — notifications run in direct mode (no queue)');
      return;
    }
    try {
      const { Queue, Worker } = await import('bullmq');
      const connection = this.parseRedisUrl(redisUrl);
      this.queue = new Queue('notifications', { connection: connection as never });
      this.worker = new Worker(
        'notifications',
        async (job: import('bullmq').Job<EnqueuePushJob>) => {
          if (job.name === 'send-push') await this.processSend(job.data);
        },
        { connection: connection as never, concurrency: 5 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.warn(`Queue job ${job?.name} failed: ${err.message}`),
      );
      this.logger.log('BullMQ notifications queue ready');
    } catch (err) {
      this.logger.warn(`BullMQ init failed, falling back to direct: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async send(
    userIds: string[],
    payload: PushPayload,
    opts?: { prefFlag?: string },
  ): Promise<void> {
    if (userIds.length === 0) return;
    const job: EnqueuePushJob = { userIds, payload, prefFlag: opts?.prefFlag };
    if (this.queue) {
      await this.queue.add('send-push', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 500,
      });
    } else {
      // ponytail: direct call when no Redis, BullMQ if retry matters
      await this.processSend(job);
    }
  }

  async processSend(job: EnqueuePushJob): Promise<void> {
    let userIds = job.userIds;
    if (job.prefFlag) {
      userIds = await this.repo.filterByConsumerPrefs(userIds, job.prefFlag as never);
      if (userIds.length === 0) return;
    }
    const pushAllowed = await this.repo.filterByConsumerPrefs(userIds, 'push_enabled' as never);
    userIds = pushAllowed;
    if (userIds.length === 0) return;

    const quietFiltered: string[] = [];
    for (const id of userIds) {
      if (!(await this.repo.isInQuietHours(id))) quietFiltered.push(id);
    }
    userIds = quietFiltered;
    if (userIds.length === 0) return;

    const targets = await this.repo.findActiveTokens(userIds);
    if (targets.length === 0) return;

    const corsOrigins = this.config.get('CORS_ORIGINS', { infer: true });
    const base = corsOrigins.split(',')[0]?.trim() ?? '';
    const link = job.payload.data?.link ?? '';
    const absoluteLink = link ? (link.startsWith('http') ? link : `${base}${link}`) : '';

    await Promise.allSettled(
      targets.map(async (t) => {
        try {
          const ok = await this.sendToToken(t, {
            ...job.payload,
            data: { ...job.payload.data, link: absoluteLink },
          });
          if (!ok) await this.repo.deactivateToken(t.token);
        } catch (err) {
          this.logger.warn(`Push failed ${t.platform} ${t.token.slice(0, 10)}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  }

  private async sendToToken(
    target: { token: string; platform: string },
    payload: PushPayload,
  ): Promise<boolean> {
    if (target.platform === 'web') return this.sendFcm(target.token, payload);
    return this.sendExpo(target.token, payload);
  }

  private async sendFcm(token: string, payload: PushPayload): Promise<boolean> {
    const saJson = this.config.get('FCM_SERVICE_ACCOUNT', { infer: true });
    const projectId = this.config.get('FCM_PROJECT_ID', { infer: true }) || this.extractProjectId(saJson);
    if (!saJson || !projectId) {
      this.logger.debug('FCM_SERVICE_ACCOUNT not set — mock send (no-op)');
      return true;
    }
    try {
      const accessToken = await this.getFcmAccessToken(saJson);
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { token, notification: { title: payload.title, body: payload.body }, data: payload.data },
        }),
      });
      if (res.ok) return true;
      const body = await res.text();
      if (body.includes('UNREGISTERED') || body.includes('NOT_FOUND') || res.status === 404) return false;
      this.logger.warn(`FCM send failed ${res.status}: ${body}`);
      return true;
    } catch (err) {
      this.logger.warn(`FCM error: ${err instanceof Error ? err.message : String(err)}`);
      return true;
    }
  }

  private async sendExpo(token: string, payload: PushPayload): Promise<boolean> {
    const accessToken = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ to: token, title: payload.title, body: payload.body, data: payload.data }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        errors?: Array<{ code: string }>;
        data?: { status?: string; details?: { error?: string } };
      };
      const errCode = json.errors?.[0]?.code ?? json.data?.details?.error ?? '';
      if (errCode === 'DeviceNotRegistered') return false;
      return true;
    } catch {
      return true;
    }
  }

  private extractProjectId(saJson: string): string {
    try { return (JSON.parse(saJson) as { project_id?: string }).project_id ?? ''; } catch { return ''; }
  }

  private async getFcmAccessToken(saJson: string): Promise<string> {
    if (this.fcmAccessToken && Date.now() < this.fcmTokenExpiry) return this.fcmAccessToken;
    const { JWT } = await import('google-auth-library');
    const creds = JSON.parse(saJson) as { client_email: string; private_key: string };
    const client = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    const tokens = await client.authorize();
    this.fcmAccessToken = tokens.access_token ?? null;
    this.fcmTokenExpiry = Date.now() + 50 * 60 * 1000;
    if (!this.fcmAccessToken) throw new Error('No FCM access token');
    return this.fcmAccessToken;
  }

  private parseRedisUrl(url: string): import('ioredis').RedisOptions {
    return parseRedisUrl(url);
  }
}
