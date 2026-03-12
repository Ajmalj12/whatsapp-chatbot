import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY as string,
});

export type AppointmentIntentType = 'VIEW_UPCOMING' | 'CANCEL' | 'RESCHEDULE' | 'NONE';

export type AppointmentIntentResult = {
    intent: AppointmentIntentType;
    targetDate?: 'TODAY' | 'TOMORROW' | null;
    doctorHint?: string | null;
    timeHint?: string | null;
};

const APPOINTMENT_INTENT_SYSTEM_PROMPT = `You are a clinic receptionist helping over WhatsApp.

Your job: look at the user's message and classify their intent about appointments. Respond with JSON only. No other text.

Possible intents:
- VIEW_UPCOMING: The user is asking when their appointment is, or what appointments they have.
  Examples: "when is my appointment", "ente appointment eppol aanu", "do I have any booking today", "any appointments tomorrow", "my appointments".
- CANCEL: The user wants to cancel an appointment.
  Examples: "cancel my appointment", "booking cancel cheyyu", "cancel today's appointment", "naale appointment cancel", "I don't want the appointment".
- RESCHEDULE: The user wants to move an existing appointment to another time/date.
  Examples: "reschedule my appointment", "booking reschedule cheyyanam", "can we change the time of my appointment", "move my cardiology appointment to tomorrow".
- NONE: Message is not about viewing/cancelling/rescheduling appointments.

You must choose ONE primary intent: VIEW_UPCOMING, CANCEL, RESCHEDULE, or NONE.

Extra fields:
- targetDate: "TODAY" | "TOMORROW" | null
  - TODAY: If they clearly talk about today (e.g. "today's appointment", "innathe appointment").
  - TOMORROW: If they clearly talk about tomorrow (e.g. "tomorrow's appointment", "naale appointment").
  - null: If date is not clear or not mentioned.
- doctorHint: if they mention a doctor's name or department in text form (e.g. "cardiology", "Dr Rahul"), copy a short string hint; otherwise null.
- timeHint: if they mention a specific time or part of day (e.g. "4pm", "evening"), copy a short string hint; otherwise null.

Understand English, Malayalam, and Manglish (Malayalam written in Latin letters).

Respond with ONLY a JSON object in this exact format (no markdown, no code block):
{"intent":"VIEW_UPCOMING|CANCEL|RESCHEDULE|NONE","targetDate":"TODAY|TOMORROW"|null,"doctorHint":string|null,"timeHint":string|null}`;

function parseJsonFromContent(content: string): Record<string, unknown> | null {
    const trimmed = content.trim();
    const withoutBlock = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    try {
        return JSON.parse(withoutBlock) as Record<string, unknown>;
    } catch {
        return null;
    }
}

// Broad keyword hints including common misspellings (e.g. "reshedule") and Manglish/Malayalam terms.
const APPOINTMENT_KEYWORD_HINTS =
    /\b(appointment|appointm(?:ent)?|booking|booked|slot|resched|reschedule|reshedule|re[\s-]?schedule|cancel|time|when|timing|samayam|naale|innu)\b/i;

export async function classifyAppointmentIntent(
    userMessage: string,
    preferredLanguage?: string | null
): Promise<AppointmentIntentResult> {
    const fallback: AppointmentIntentResult = {
        intent: 'NONE',
        targetDate: null,
        doctorHint: null,
        timeHint: null,
    };

    if (!APPOINTMENT_KEYWORD_HINTS.test(userMessage.toLowerCase())) {
        return fallback;
    }

    try {
        const langLine = preferredLanguage ? ` Preferred reply language: ${preferredLanguage}.` : '';
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            config: {
                systemInstruction: APPOINTMENT_INTENT_SYSTEM_PROMPT + langLine,
            },
        });
        const raw = (response.text || '').trim();
        const parsed = parseJsonFromContent(raw);
        if (!parsed) return fallback;

        const intentStr = typeof parsed.intent === 'string' ? parsed.intent.toUpperCase() : 'NONE';
        const intent: AppointmentIntentType =
            intentStr === 'VIEW_UPCOMING' || intentStr === 'CANCEL' || intentStr === 'RESCHEDULE'
                ? (intentStr as AppointmentIntentType)
                : 'NONE';

        const td = typeof parsed.targetDate === 'string' ? parsed.targetDate.toUpperCase() : null;
        const targetDate: 'TODAY' | 'TOMORROW' | null = td === 'TODAY' || td === 'TOMORROW' ? td : null;

        const doctorHint =
            typeof parsed.doctorHint === 'string' && parsed.doctorHint.trim().length > 0
                ? parsed.doctorHint.trim()
                : null;
        const timeHint =
            typeof parsed.timeHint === 'string' && parsed.timeHint.trim().length > 0
                ? parsed.timeHint.trim()
                : null;

        return { intent, targetDate, doctorHint, timeHint };
    } catch (err) {
        console.error('[classifyAppointmentIntent] Gemini error:', err);
        return fallback;
    }
}

