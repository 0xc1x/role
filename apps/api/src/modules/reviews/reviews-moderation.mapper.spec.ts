import { ReviewModerationMapper } from './reviews-moderation.mapper';

const makeRow = (overrides: Record<string, any> = {}) => ({
  id: 'review-1',
  user_id: 'user-1',
  business_id: 'business-1',
  order_id: 'order-1',
  rating: null,
  comment: 'Pésimo',
  product_rating: 1,
  business_rating: 1,
  created_at: new Date('2026-09-27T00:00:00Z'),
  updated_at: new Date('2026-09-27T01:00:00Z'),
  is_hidden: true,
  moderated_at: new Date('2026-09-27T02:00:00Z'),
  moderated_by: 'admin-1',
  moderation_reason: 'insults_or_hate_speech',
  hidden_reason: 'Lenguaje abusivo',
  author_name: 'Bruno',
  business_name: 'Panadería Sur',
  moderated_by_name: 'Ana',
  ...overrides,
});

describe('ReviewModerationMapper', () => {
  it('mapea la fila de moderación completa, con nombres y no uuids sueltos', () => {
    expect(ReviewModerationMapper.toDto(makeRow())).toEqual({
      id: 'review-1',
      user_id: 'user-1',
      business_id: 'business-1',
      order_id: 'order-1',
      rating: null,
      comment: 'Pésimo',
      product_rating: 1,
      business_rating: 1,
      created_at: '2026-09-27T00:00:00.000Z',
      updated_at: '2026-09-27T01:00:00.000Z',
      is_hidden: true,
      moderated_at: '2026-09-27T02:00:00.000Z',
      moderated_by: 'admin-1',
      moderated_by_name: 'Ana',
      moderation_reason: 'insults_or_hate_speech',
      hidden_reason: 'Lenguaje abusivo',
      author_name: 'Bruno',
      business_name: 'Panadería Sur',
    });
  });

  it('viaja el token crudo del motivo, no la etiqueta en español', () => {
    // El token es lo que se filtra y se compara; la etiqueta es copy del panel.
    // Traducirlo acá ataría el identificador estable al copy, y corregir cómo se
    // nombra un motivo dejaría obsoletas las reseñas ya moderadas.
    const dto = ReviewModerationMapper.toDto(
      makeRow({ moderation_reason: 'identity_discrimination' }),
    );
    expect(dto.moderation_reason).toBe('identity_discrimination');
  });

  it('un token que el contrato ya no conoce viaja igual, sin recortarse', () => {
    // Una fila moderada en el pasado puede tener un token retirado del
    // contrato. El DTO la tiene que poder mostrar: es la fila que el operador
    // tiene que revisar para responder una apelación.
    const dto = ReviewModerationMapper.toDto(
      makeRow({ moderation_reason: 'motivo_ya_retirado' }),
    );
    expect(dto.moderation_reason).toBe('motivo_ya_retirado');
  });

  it('una reseña nunca moderada sale con los tres campos en null, no con texto de relleno', () => {
    const dto = ReviewModerationMapper.toDto(
      makeRow({
        is_hidden: false,
        moderated_at: null,
        moderated_by: null,
        moderated_by_name: null,
        moderation_reason: null,
        hidden_reason: null,
      }),
    );
    // `null` distingue "nunca se moderó" de "la cuenta se borró". Un
    // "Desconocido" en los dos casos sería inventar un dato que no está.
    expect(dto.moderated_at).toBeNull();
    expect(dto.moderated_by).toBeNull();
    expect(dto.moderated_by_name).toBeNull();
    expect(dto.moderation_reason).toBeNull();
    expect(dto.hidden_reason).toBeNull();
  });

  it('una razón nombrada sin detalle sale con detalle null, que es un valor legítimo', () => {
    const dto = ReviewModerationMapper.toDto(makeRow({ hidden_reason: null }));
    expect(dto.moderation_reason).toBe('insults_or_hate_speech');
    expect(dto.hidden_reason).toBeNull();
  });

  it('un perfil sin nombre se emite como null, no como string vacío', () => {
    const dto = ReviewModerationMapper.toDto(
      makeRow({ author_name: null, business_name: null }),
    );
    expect(dto.author_name).toBeNull();
    expect(dto.business_name).toBeNull();
  });
});
