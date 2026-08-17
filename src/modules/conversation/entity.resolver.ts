import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/db/database.types';
import type { ExtractedEntities } from '../conversation/conversation.types';
import { listServices } from '../calendar/calendar.service';
import { listProfessionals } from '../calendar/calendar.service';
import Fuse from 'fuse.js';

/** 
 * Resolves string entities extracted by the AI into database IDs.
 * @param client - The Supabase client.
 * @param organizationSlug - The slug of the organization.
 * @param userId - The ID of the user making the request (for RLS).
 * @param entities - The entities extracted by the AI.
 * @returns A partial workflow state with resolved IDs.
 */
export async function resolveEntities(
    client: SupabaseClient<Database>,
    organizationSlug: string,
    userId: string,
    entities: ExtractedEntities,
): Promise<Record<string, any>> {
    const resolvedState: Record<string, any> = {};

    // Resolve Service
    if (entities.service) {
        const services = await listServices(client, userId, organizationSlug);
        const activeServices = services.filter(s => s.status === 'active');
        const fuse = new Fuse(activeServices, {
            keys: ['name'],
            threshold: 0.4,
            includeScore: true,
        });

        const results = fuse.search(entities.service);

        if (results.length > 0 && results[0].score! < 0.4) {
            resolvedState.serviceId = results[0].item.id;
        } else {
            resolvedState.serviceNameUnresolved = entities.service;
        }
    }

    // Resolve Professional
    if (entities.professional) {
        const professionals = await listProfessionals(client, userId, organizationSlug);
        const activeProfessionals = professionals.filter(p => p.status === 'active');
        const fuse = new Fuse(activeProfessionals, {
            keys: ['name'],
            threshold: 0.4,
            includeScore: true,
        });

        const results = fuse.search(entities.professional);

        if (results.length > 0 && results[0].score! < 0.4) {
            // For now, take the best match. Disambiguation can be added if multiple results are close.
            resolvedState.professionalId = results[0].item.id;
            resolvedState.professionalPreference = 'specific';
        } else if (results.length > 1 && results[0].score! < 0.5) {
            resolvedState.ambiguousProfessionalName = entities.professional; // For disambiguation
        } else {
            resolvedState.professionalNameUnresolved = entities.professional;
        }
    }

    // Resolve Date & Time (using a date parsing library like 'chrono-node' would be ideal here)
    if (entities.date) {
        // Placeholder for robust date parsing logic
        resolvedState.date = entities.date; // e.g., 'tomorrow' would be converted to '2026-08-14'
    }

    return resolvedState;
}