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
      hidden_reason: 'Lenguaje abusivo',
      author_name: 'Bruno',
      business_name: 'Panadería Sur',
    });
  });

  it('una reseña nunca moderada sale con los tres campos en null, no con texto de relleno', () => {
    const dto = ReviewModerationMapper.toDto(
      makeRow({
        is_hidden: false,
        moderated_at: null,
        moderated_by: null,
        moderated_by_name: null,
        hidden_reason: null,
      }),
    );
    // `null` distingue "nunca se moderó" de "la cuenta se borró". Un
    // "Desconocido" en los dos casos sería inventar un dato que no está.
    expect(dto.moderated_at).toBeNull();
    expect(dto.moderated_by).toBeNull();
    expect(dto.moderated_by_name).toBeNull();
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
