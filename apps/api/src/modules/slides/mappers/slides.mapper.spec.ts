import { describe, expect, test } from 'bun:test';
import {
  SlideMapper,
  toSlideDto,
  toSlideInsert,
  toSlideUpdate,
} from './slides.mapper';
import type { SlideRow } from '../slides.repository';

const makeRow = (overrides: Partial<SlideRow> = {}): SlideRow =>
  ({
    id: 'slide-1',
    title: 'Bienvenido',
    caption: 'Hola',
    badge_text: null,
    cta_label: 'Ver más',
    redirect_url: null,
    coupon_code: null,
    image_url: 'https://x/y.png',
    text_color: null,
    button_color: null,
    type: 'info',
    priority: 1,
    start_at: null,
    end_at: null,
    active: true,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: null,
    deleted_at: null,
    ...overrides,
  }) as SlideRow;

describe('toSlideDto', () => {
  test('mapea fila con fechas ISO', () => {
    const dto = toSlideDto(makeRow());
    expect(dto.priority).toBe(1);
    expect(dto.created_at).toBe('2025-01-01T00:00:00.000Z');
    expect(dto.updated_at).toBeNull();
    expect(dto.start_at).toBeNull();
  });

  test('cta_label nulo → string vacío', () => {
    expect(toSlideDto(makeRow({ cta_label: '' })).cta_label).toBe('');
  });
});

describe('toSlideInsert', () => {
  test('strings vacíos → null, fechas → Date', () => {
    const out = toSlideInsert({
      title: 'T',
      caption: 'C',
      type: 'info',
      priority: 2,
      active: true,
      redirect_url: '',
      image_url: '',
      start_at: '2025-01-01T00:00:00.000Z',
    });
    expect(out.redirect_url).toBeNull();
    expect(out.image_url).toBeNull();
    expect(out.start_at).toEqual(new Date('2025-01-01T00:00:00.000Z'));
    expect(out.end_at).toBeNull();
    expect(out.cta_label).toBeNull();
  });
});

describe('toSlideUpdate', () => {
  test('solo definidos; vacíos → null', () => {
    expect(toSlideUpdate({ title: 'N' })).toEqual({ title: 'N' });
    expect(toSlideUpdate({ redirect_url: '' })).toEqual({ redirect_url: null });
    expect(toSlideUpdate({})).toEqual({});
  });
});

describe('SlideMapper', () => {
  test('expone los conversores', () => {
    expect(SlideMapper.toDto).toBe(toSlideDto);
    expect(SlideMapper.toInsert).toBe(toSlideInsert);
    expect(SlideMapper.toUpdate).toBe(toSlideUpdate);
  });
});
