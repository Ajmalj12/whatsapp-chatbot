import prisma from './prisma';
import { isAfter, isBefore, differenceInMinutes, addMinutes, startOfDay, endOfDay } from 'date-fns';

export interface SlotMatch {
    slot: {
        id: string;
        startTime: Date;
        endTime: Date;
        doctorId: string;
    };
    matchType: 'exact' | 'nearby' | 'alternative';
    timeDifference?: number; // minutes from requested time
    reason?: string;
}

/**
 * Find the best available slots for a doctor based on requested time
 * Returns up to maxAlternatives slots, prioritizing exact matches
 */
export async function findBestSlots(
    doctorId: string,
    requestedTime: Date,
    maxAlternatives: number = 3
): Promise<SlotMatch[]> {
    // Fetch all available slots for the doctor
    const availableSlots = await prisma.availability.findMany({
        where: {
            doctorId,
            isBooked: false,
            startTime: { gte: new Date() } // Only future slots
        },
        orderBy: { startTime: 'asc' }
    });

    if (availableSlots.length === 0) {
        return [];
    }

    const matches: SlotMatch[] = [];
    const exactMatchWindow = 15; // ±15 minutes for "exact" match

    // 1. Look for exact match (within 15 minutes)
    const exactMatch = availableSlots.find(slot => {
        const diff = Math.abs(differenceInMinutes(slot.startTime, requestedTime));
        return diff <= exactMatchWindow;
    });

    if (exactMatch) {
        matches.push({
            slot: {
                id: exactMatch.id,
                startTime: exactMatch.startTime,
                endTime: exactMatch.endTime,
                doctorId: exactMatch.doctorId
            },
            matchType: 'exact',
            timeDifference: differenceInMinutes(exactMatch.startTime, requestedTime),
            reason: 'Available at your requested time'
        });
        return matches; // Return immediately if exact match found
    }

    // 2. Find nearby slots on the same day
    const requestedDayStart = startOfDay(requestedTime);
    const requestedDayEnd = endOfDay(requestedTime);

    const sameDaySlots = availableSlots
        .filter(slot =>
            isAfter(slot.startTime, requestedDayStart) &&
            isBefore(slot.startTime, requestedDayEnd)
        )
        .map(slot => ({
            slot: {
                id: slot.id,
                startTime: slot.startTime,
                endTime: slot.endTime,
                doctorId: slot.doctorId
            },
            matchType: 'nearby' as const,
            timeDifference: Math.abs(differenceInMinutes(slot.startTime, requestedTime)),
            reason: 'Available on the same day'
        }))
        .sort((a, b) => (a.timeDifference || 0) - (b.timeDifference || 0));

    matches.push(...sameDaySlots.slice(0, maxAlternatives));

    // 3. If we still need more alternatives, get next available slots from other days
    if (matches.length < maxAlternatives) {
        const otherDaySlots = availableSlots
            .filter(slot =>
                !sameDaySlots.some(s => s.slot.id === slot.id)
            )
            .slice(0, maxAlternatives - matches.length)
            .map(slot => ({
                slot: {
                    id: slot.id,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    doctorId: slot.doctorId
                },
                matchType: 'alternative' as const,
                timeDifference: Math.abs(differenceInMinutes(slot.startTime, requestedTime)),
                reason: 'Next available slot'
            }));

        matches.push(...otherDaySlots);
    }

    return matches.slice(0, maxAlternatives);
}

/**
 * Find next available slot for a doctor (used for department views)
 */
export async function findNextAvailableSlot(doctorId: string): Promise<{
    date: string;
    time: string;
    availabilityId: string;
} | null> {
    const nextSlot = await prisma.availability.findFirst({
        where: {
            doctorId,
            isBooked: false,
            startTime: { gte: new Date() }
        },
        orderBy: { startTime: 'asc' }
    });

    if (!nextSlot) {
        return null;
    }

    return {
        date: nextSlot.startTime.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        }),
        time: nextSlot.startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }),
        availabilityId: nextSlot.id
    };
}

/**
 * Get available slots count for a specific date range
 */
export async function getAvailableSlotsCount(
    doctorId: string,
    startDate: Date,
    endDate: Date
): Promise<number> {
    return await prisma.availability.count({
        where: {
            doctorId,
            isBooked: false,
            startTime: {
                gte: startDate,
                lte: endDate
            }
        }
    });
}

/**
 * Format slot matches into user-friendly message
 */
export function formatSlotMatches(matches: SlotMatch[]): string {
    if (matches.length === 0) {
        return 'No available slots found.';
    }

    return matches.map((match, index) => {
        const timeStr = match.slot.startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        const dateStr = match.slot.startTime.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });

        return `${index + 1}. ${dateStr} at ${timeStr}${match.reason ? ` (${match.reason})` : ''}`;
    }).join('\n');
}
