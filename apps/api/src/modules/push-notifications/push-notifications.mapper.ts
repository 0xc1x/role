import type {
  PushNotificationDto,
  PushTemplateDto,
  PushTokenDto,
} from '@0xc1x/role-commons';
import type {
  PushNotificationRow,
  PushTemplateRow,
} from './push-notifications.repository';

/** Filas DB → DTOs de commons (fechas Date → ISO, nunca filas crudas). */
export class PushNotificationsMapper {
  static toTemplateDto(row: PushTemplateRow): PushTemplateDto {
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      body: row.body,
      data: (row.data as Record<string, unknown>) ?? {},
      is_active: row.is_active,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      deleted_at: row.deleted_at?.toISOString() ?? null,
    };
  }

  static toNotificationDto(row: PushNotificationRow): PushNotificationDto {
    return {
      id: row.id,
      template_id: row.template_id ?? null,
      title: row.title,
      body: row.body,
      type: row.type as PushNotificationDto['type'],
      data: (row.data as Record<string, unknown>) ?? {},
      segment_ids: row.segment_ids ?? [],
      include_user_ids: row.include_user_ids ?? [],
      exclude_user_ids: row.exclude_user_ids ?? [],
      total_targeted: row.total_targeted,
      sent_count: row.sent_count,
      failed_count: row.failed_count,
      status: row.status as PushNotificationDto['status'],
      created_by: row.created_by ?? null,
      created_at: row.created_at.toISOString(),
    };
  }

  /** Fila del join device_tokens × profiles (listTokens) → DTO. */
  static toTokenDto(row: {
    id: string;
    user_id: string;
    user_email: string | null;
    user_full_name: string | null;
    token: string;
    platform: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): PushTokenDto {
    return {
      id: row.id,
      user_id: row.user_id,
      user_email: row.user_email,
      user_full_name: row.user_full_name,
      token: row.token,
      platform: row.platform as PushTokenDto['platform'],
      is_active: row.is_active,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
