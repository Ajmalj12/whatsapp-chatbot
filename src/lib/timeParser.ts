import * as chrono from 'chrono-node';
import { addDays, addHours, setHours, setMinutes, startOfDay, isAfter, isBefore } from 'date-fns';

export interface ParsedTime {
    date: Date;
    confidence: 'high' | 'medium' | 'low';
    originalText: string;
    isTimeCertain: boolean;
}

/**
 * Parse natural language time input into a Date object
 * Examples: "tomorrow at 3 PM", "10:30", "next Monday 2pm", "Feb 15 at 10:30"
 */
export function parseNaturalTime(text: string, referenceDate: Date = new Date()): ParsedTime | null {
    const cleanText = text.trim();

    // Try chrono-node first (handles complex natural language)
    const chronoResults = chrono.parse(cleanText, referenceDate, { forwardDate: true });

    if (chronoResults.length > 0) {
        const result = chronoResults[0];
        const parsedDate = result.start.date();

        // Ensure the date is in the future
        if (isAfter(parsedDate, referenceDate)) {
            return {
                date: parsedDate,
                confidence: result.start.isCertain('hour') ? 'high' : 'medium',
                originalText: cleanText,
                isTimeCertain: result.start.isCertain('hour')
            };
        }
    }

    // Fallback: Try simple time patterns (e.g., "10:30", "2 PM", "14:00")
    const simpleTimeResult = parseSimpleTime(cleanText, referenceDate);
    if (simpleTimeResult) {
        return simpleTimeResult;
    }

    return null;
}

/**
 * Parse simple time patterns like "10:30", "2 PM", "14:00"
 * Assumes today if no date is specified
 */
function parseSimpleTime(text: string, referenceDate: Date): ParsedTime | null {
    const timePatterns = [
        // 12-hour format with AM/PM: "2 PM", "10:30 AM", "2:45pm"
        /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
        // 24-hour format: "14:00", "09:30"
        /^(\d{1,2}):(\d{2})$/,
        // Just hour: "2", "14"
        /^(\d{1,2})$/
    ];

    for (const pattern of timePatterns) {
        const match = text.match(pattern);
        if (match) {
            let hours = parseInt(match[1]);
            const minutes = match[2] ? parseInt(match[2]) : 0;
            const meridiem = match[3]?.toLowerCase();

            // Convert 12-hour to 24-hour
            if (meridiem) {
                if (meridiem === 'pm' && hours !== 12) {
                    hours += 12;
                } else if (meridiem === 'am' && hours === 12) {
                    hours = 0;
                }
            }

            // Validate hours and minutes
            if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                let parsedDate = setMinutes(setHours(startOfDay(referenceDate), hours), minutes);

                // If the time is in the past today, assume tomorrow
                if (isBefore(parsedDate, referenceDate)) {
                    parsedDate = addDays(parsedDate, 1);
                }

                return {
                    date: parsedDate,
                    confidence: 'medium',
                    originalText: text,
                    isTimeCertain: true
                };
            }
        }
    }

    return null;
}

/**
 * Extract relative time keywords and convert to Date
 * Examples: "tomorrow", "next week", "in 2 days"
 */
export function parseRelativeTime(text: string, referenceDate: Date = new Date()): Date | null {
    const lowerText = text.toLowerCase();

    // Common relative time patterns
    if (lowerText.includes('tomorrow')) {
        return addDays(startOfDay(referenceDate), 1);
    }

    if (lowerText.includes('today')) {
        return startOfDay(referenceDate);
    }

    // "in X days/hours"
    const inPattern = /in (\d+) (day|hour|week)s?/i;
    const inMatch = lowerText.match(inPattern);
    if (inMatch) {
        const amount = parseInt(inMatch[1]);
        const unit = inMatch[2];

        if (unit === 'day') return addDays(referenceDate, amount);
        if (unit === 'hour') return addHours(referenceDate, amount);
        if (unit === 'week') return addDays(referenceDate, amount * 7);
    }

    return null;
}

/**
 * Check if the text contains a time-related request
 */
export function containsTimeRequest(text: string): boolean {
    const timeKeywords = [
        'at', 'tomorrow', 'today', 'next', 'am', 'pm',
        ':', 'morning', 'afternoon', 'evening', 'noon',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ];

    const lowerText = text.toLowerCase();
    return timeKeywords.some(keyword => lowerText.includes(keyword)) || /\d{1,2}/.test(text);
}

/**
 * Format a Date object into a user-friendly string
 */
export function formatAppointmentTime(dateInput: Date | string): string {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

    if (isNaN(date.getTime())) {
        return "Invalid Date";
    }

    const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    return `${dateStr} at ${timeStr}`;
}
