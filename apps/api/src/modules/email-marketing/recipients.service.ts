import { Injectable } from '@nestjs/common';
import {
  SEGMENT_FILTER_FIELDS,
  type SegmentFilters,
} from '@0xc1x/role-commons';
import { EmailMarketingRepository } from './email-marketing.repository';

export interface Recipient {
  userId: string;
  email: string;
  fullName: string | null;
}

/**
 * Resolución de destinatarios:
 * segment_ids (estáticos/dinámicos) ∪ include − exclude, filtrando SIEMPRE
 * por marketing_preferences (is_subscribed + categoría aceptada).
 */
@Injectable()
export class RecipientsService {
  constructor(private readonly repository: EmailMarketingRepository) {}

  async resolve(
    input: {
      segmentIds: string[];
      includeUserIds: string[];
      excludeUserIds: string[];
    },
    category: string,
  ): Promise<Recipient[]> {
    const idSet = new Set<string>(input.includeUserIds);

    for (const segmentId of input.segmentIds) {
      const segment = await this.repository.findSegmentById(segmentId);
      // Un segmento solo aplica a campañas de su misma categoría.
      if (!segment?.is_active || segment.category !== category) continue;

      if (segment.type === 'static') {
        for (const id of await this.repository.getSegmentUserIds(segmentId)) {
          idSet.add(id);
        }
      } else if (segment.filters) {
        const filters = segment.filters as SegmentFilters;
        const valid = (filters.and ?? []).filter((f) =>
          (SEGMENT_FILTER_FIELDS as readonly string[]).includes(f.field),
        ) as { field: string; op: string; value: unknown }[];
        for (const id of await this.repository.findIdsMatchingFilters(valid)) {
          idSet.add(id);
        }
      }
    }

    for (const id of input.excludeUserIds) idSet.delete(id);

    const rows = await this.repository.findSubscribedRecipients(
      [...idSet],
      category,
    );
    // Dedup por email: un email = un envío.
    const seen = new Set<string>();
    return rows
      .filter((r) => {
        if (!r.email || seen.has(r.email)) return false;
        seen.add(r.email);
        return true;
      })
      .map((r) => ({
        userId: r.user_id,
        email: r.email,
        fullName: r.full_name ?? null,
      }));
  }
}
