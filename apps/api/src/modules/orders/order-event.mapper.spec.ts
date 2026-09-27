import { OrderEventMapper, type OrderEventRow } from './order-event.mapper';

const makeRow = (overrides: Partial<OrderEventRow> = {}): OrderEventRow => ({
  id: 'event-1',
  order_id: 'order-1',
  status: 'confirmed',
  previous_status: 'pending',
  changed_by: 'user-1',
  reason: 'Reserva creada',
  metadata: { source: 'database', dedupe: 'pickup_reminder' },
  created_at: new Date('2026-01-01T10:00:00Z'),
  ...overrides,
});

describe('OrderEventMapper', () => {
  it('maps a transition to the timeline projection', () => {
    expect(
      OrderEventMapper.toTimelineEvent(
        makeRow({
          status: 'ready_for_pickup',
          previous_status: 'confirmed',
          reason: null,
        }),
      ),
    ).toEqual({
      status: 'ready_for_pickup',
      previous_status: 'confirmed',
      reason: null,
      created_at: '2026-01-01T10:00:00.000Z',
    });
  });

  it('never exposes metadata', () => {
    const mapped = OrderEventMapper.toTimelineEvent(
      makeRow({ metadata: { source: 'database', dedupe: 'pickup_reminder' } }),
    );

    expect(Object.keys(mapped)).not.toContain('metadata');
    expect(JSON.stringify(mapped)).not.toContain('dedupe');
  });

  it('never exposes changed_by as a raw profile uuid', () => {
    const mapped = OrderEventMapper.toTimelineEvent(
      makeRow({ changed_by: 'user-1' }),
    );

    expect(Object.keys(mapped)).not.toContain('changed_by');
    expect(JSON.stringify(mapped)).not.toContain('user-1');
  });

  it('exposes exactly the four documented fields', () => {
    // If someone widens the projection, this is the test that has to be
    // updated on purpose — with the reason written down next to it.
    expect(Object.keys(OrderEventMapper.toTimelineEvent(makeRow())).sort()).toEqual([
      'created_at',
      'previous_status',
      'reason',
      'status',
    ]);
  });
});
