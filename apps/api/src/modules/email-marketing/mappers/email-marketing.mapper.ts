import type {
  CampaignDto,
  EmailComponentDto,
  EmailSendDto,
  EmailTemplateDto,
  SegmentDto,
} from '@0xc1x/role-commons';
import type {
  CampaignRow,
  ComponentRow,
  SegmentRow,
  SendRow,
  TemplateRow,
} from '../email-marketing.repository';

/** Campos comunes de las filas con auditoría (componentes/plantillas no tienen description). */
type BaseRow = Pick<
  CampaignRow,
  'id' | 'name' | 'created_at' | 'updated_at' | 'deleted_at'
> & { description?: string | null };

/** Filas DB → DTOs de commons (fechas Date → ISO). */
export class EmailMarketingMapper {
  static iso(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
  }

  private static base(row: BaseRow) {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      deleted_at: row.deleted_at?.toISOString() ?? null,
    };
  }

  static toComponentDto(row: ComponentRow): EmailComponentDto {
    return {
      ...this.base(row),
      type: row.type,
      html_content: row.html_content,
      is_active: row.is_active,
    };
  }

  static toTemplateDto(row: TemplateRow): EmailTemplateDto {
    return {
      ...this.base(row),
      subject: row.subject,
      body_html: row.body_html,
      header_id: row.header_id ?? null,
      footer_id: row.footer_id ?? null,
      variables: Array.isArray(row.variables)
        ? (row.variables as string[])
        : [],
      is_active: row.is_active,
      deleted_at: row.deleted_at?.toISOString() ?? null,
    };
  }

  static toSegmentDto(row: SegmentRow): SegmentDto {
    return {
      ...this.base(row),
      type: row.type,
      filters: (row.filters as SegmentDto['filters']) ?? null,
      is_active: row.is_active,
      estimated_count: row.estimated_count ?? null,
      category: row.category as SegmentDto['category'],
      deleted_at: row.deleted_at?.toISOString() ?? null,
    };
  }

  static toCampaignDto(row: CampaignRow): CampaignDto {
    return {
      id: row.id,
      name: row.name,
      template_id: row.template_id ?? null,
      subject_override: row.subject_override ?? null,
      body_override: row.body_override ?? null,
      category: row.category as CampaignDto['category'],
      segment_ids: row.segment_ids ?? [],
      include_user_ids: row.include_user_ids ?? [],
      exclude_user_ids: row.exclude_user_ids ?? [],
      scheduled_at: this.iso(row.scheduled_at),
      status: row.status,
      sent_at: this.iso(row.sent_at),
      total_recipients: row.total_recipients ?? 0,
      total_sent: row.total_sent ?? 0,
      total_delivered: row.total_delivered ?? 0,
      total_opened: row.total_opened ?? 0,
      total_clicked: row.total_clicked ?? 0,
      total_bounced: row.total_bounced ?? 0,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      deleted_at: row.deleted_at?.toISOString() ?? null,
    };
  }

  static toSendDto(row: SendRow): EmailSendDto {
    return {
      id: row.id,
      campaign_id: row.campaign_id,
      user_id: row.user_id ?? null,
      email: row.email,
      resend_id: row.resend_id ?? null,
      status: row.status,
      sent_at: this.iso(row.sent_at),
      delivered_at: this.iso(row.delivered_at),
      opened_at: this.iso(row.opened_at),
      clicked_at: this.iso(row.clicked_at),
      bounced_at: this.iso(row.bounced_at),
      error_message: row.error_message ?? null,
      created_at: row.created_at.toISOString(),
    };
  }
}
