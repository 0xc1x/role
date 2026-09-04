import { describe, expect, test } from 'bun:test';
import { PushNotificationsMapper } from './push-notifications.mapper';
import type {
  PushNotificationRow,
  PushTemplateRow,
} from './push-notifications.repository';

describe('PushNotificationsMapper.toTemplateDto', () => {
  test('mapea template con fechas ISO', () => {
    const dto = PushNotificationsMapper.toTemplateDto({
      id: 'tpl-1',
      name: 'Ofertas',
      title: 'Nuevas ofertas',
      body: 'Ven por tu pack',
      data: { route: '/ofertas' },
      is_active: true,
      created_by: null,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-02T00:00:00Z'),
      deleted_at: null,
    } as PushTemplateRow);
    expect(dto.data).toEqual({ route: '/ofertas' });
    expect(dto.created_at).toBe('2025-01-01T00:00:00.000Z');
    expect(dto.deleted_at).toBeNull();
  });

  test('data nula → objeto vacío', () => {
    const dto = PushNotificationsMapper.toTemplateDto({
      id: 'tpl-1',
      name: 'N',
      title: 'T',
      body: 'B',
      data: null,
      is_active: true,
      created_by: null,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
      deleted_at: null,
    } as unknown as PushTemplateRow);
    expect(dto.data).toEqual({});
  });
});

describe('PushNotificationsMapper.toNotificationDto', () => {
  test('defaultea arreglos', () => {
    const dto = PushNotificationsMapper.toNotificationDto({
      id: 'n-1',
      template_id: null,
      title: 'T',
      body: 'B',
      type: 'broadcast',
      data: null,
      segment_ids: null,
      include_user_ids: null,
      exclude_user_ids: null,
      total_targeted: 0,
      sent_count: 0,
      failed_count: 0,
      status: 'draft',
      created_by: null,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
    } as unknown as PushNotificationRow);
    expect(dto.segment_ids).toEqual([]);
    expect(dto.include_user_ids).toEqual([]);
    expect(dto.total_targeted).toBe(0);
  });
});

describe('PushNotificationsMapper.toTokenDto', () => {
  test('mapea join token×perfil', () => {
    const dto = PushNotificationsMapper.toTokenDto({
      id: 'tok-1',
      user_id: 'user-1',
      user_email: 'a@b.cl',
      user_full_name: 'Ana',
      token: 'ExponentPushToken[x]',
      platform: 'android',
      is_active: true,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
    });
    expect(dto.token).toBe('ExponentPushToken[x]');
    expect(dto.platform).toBe('android');
    expect(dto.user_email).toBe('a@b.cl');
  });
});
