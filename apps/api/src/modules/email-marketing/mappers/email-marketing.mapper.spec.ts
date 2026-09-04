import { describe, expect, test } from 'bun:test';
import { EmailMarketingMapper } from './email-marketing.mapper';

describe('EmailMarketingMapper.iso', () => {
  test('Date → ISO, nulo → nulo', () => {
    expect(EmailMarketingMapper.iso(new Date('2025-01-01T00:00:00Z'))).toBe(
      '2025-01-01T00:00:00.000Z',
    );
    expect(EmailMarketingMapper.iso(null)).toBeNull();
    expect(EmailMarketingMapper.iso(undefined)).toBeNull();
  });
});

describe('EmailMarketingMapper.toComponentDto', () => {
  test('mapea componente con base de auditoría', () => {
    const dto = EmailMarketingMapper.toComponentDto({
      id: 'c1',
      name: 'Header',
      type: 'header',
      html_content: '<h1>Hola</h1>',
      is_active: true,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-02T00:00:00Z'),
      deleted_at: null,
    });
    expect(dto.html_content).toBe('<h1>Hola</h1>');
    expect(dto.description).toBeNull();
    expect(dto.created_at).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('EmailMarketingMapper.toTemplateDto', () => {
  test('variables no-arreglo → []', () => {
    const dto = EmailMarketingMapper.toTemplateDto({
      id: 't1',
      name: 'Bienvenida',
      description: null,
      subject: 'Hola {{nombre}}',
      body_html: '<p>Hola</p>',
      header_id: null,
      footer_id: null,
      variables: null,
      is_active: true,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
      deleted_at: null,
    });
    expect(dto.variables).toEqual([]);
    expect(dto.header_id).toBeNull();
  });

  test('variables arreglo se preservan', () => {
    const dto = EmailMarketingMapper.toTemplateDto({
      id: 't1',
      name: 'B',
      description: null,
      subject: 'S',
      body_html: 'B',
      header_id: 'h1',
      footer_id: null,
      variables: ['nombre'],
      is_active: true,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
      deleted_at: null,
    });
    expect(dto.variables).toEqual(['nombre']);
  });
});

describe('EmailMarketingMapper.toCampaignDto', () => {
  test('defaultea arreglos y contadores', () => {
    const dto = EmailMarketingMapper.toCampaignDto({
      id: 'camp-1',
      name: 'C',
      template_id: null,
      subject_override: null,
      body_override: null,
      category: 'announcements',
      segment_ids: null,
      include_user_ids: null,
      exclude_user_ids: null,
      scheduled_at: null,
      status: 'draft',
      sent_at: null,
      total_recipients: null,
      total_sent: null,
      total_delivered: null,
      total_opened: null,
      total_clicked: null,
      total_bounced: null,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
      deleted_at: null,
    });
    expect(dto.segment_ids).toEqual([]);
    expect(dto.total_recipients).toBe(0);
    expect(dto.scheduled_at).toBeNull();
    expect(dto.status).toBe('draft');
  });
});

describe('EmailMarketingMapper.toSendDto', () => {
  test('defaultea attempts y max_attempts', () => {
    const dto = EmailMarketingMapper.toSendDto({
      id: 's1',
      type: 'campaign',
      source_type: null,
      source_id: null,
      template_id: 't1',
      user_id: null,
      email: 'a@b.cl',
      variables_used: null,
      resend_id: null,
      status: 'pending',
      attempts: null,
      max_attempts: null,
      error_message: null,
      error_code: null,
      scheduled_at: null,
      queued_at: null,
      processed_at: null,
      sent_at: null,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
    });
    expect(dto.attempts).toBe(0);
    expect(dto.max_attempts).toBe(5);
    expect(dto.email).toBe('a@b.cl');
  });
});
