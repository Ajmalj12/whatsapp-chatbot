import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
    apiKey: 'AIzaSyB4EZSZ6F4rq1RMsMXqgT9jjMrf4i9Z8qU',
});

export type ClassifyNameResult = {
    isPatientName: boolean;
    extractedName: string | null;
    isQuestion: boolean;
    replyToUser: string | null;
};

export type ClassifyAgeResult = {
    isAge: boolean;
    extractedAge: number | null;
    isQuestion: boolean;
    replyToUser: string | null;
};

const NAME_SYSTEM_PROMPT = `You are a clinic receptionist. The user was just asked: "Please enter the Patient's Name."

Your job: classify their message and respond with JSON only. No other text.

Rules:
- If they gave a real person's name (any language: English, Malayalam, Manglish, etc.), set isPatientName: true and put the name in extractedName (trimmed, no extra words). Set isQuestion: false, replyToUser: null.
- If they asked a question (e.g. "when do you open?", "what time?", "when was open?", "eppol thurakkum?", "samayam ethra?", "clinic timing?") or made a comment that is NOT a name, set isQuestion: true and replyToUser to a helpful one-line answer (e.g. "We're open 9 AM – 9 PM."). Set isPatientName: false, extractedName: null.
- Understand Malayalam and Manglish. "eppol thurakkum", "samayam", "when open" = question about timing, not a name.
- If unclear, prefer isQuestion: true and give a short friendly reply; set isPatientName: false.

Respond with ONLY a JSON object in this exact format (no markdown, no code block):
{"isPatientName":true|false,"extractedName":string|null,"isQuestion":true|false,"replyToUser":string|null}`;

const AGE_SYSTEM_PROMPT = `You are a clinic receptionist. The user was just asked for the patient's age.

Your job: classify their message and respond with JSON only. No other text.

Rules:
- If they gave a number that is an age (1-99), e.g. "25", "I am 25", "25 years", "25 yrs", set isAge: true and put the number in extractedAge. Set isQuestion: false, replyToUser: null.
- If they asked a question (e.g. "when do you open?", "what time?") or said something that is NOT an age, set isQuestion: true and replyToUser to a helpful one-line answer. Set isAge: false, extractedAge: null.
- Understand Malayalam and Manglish. Extract age from "vayas 25" or "25 vayassu" etc.
- If unclear or not a valid age, set isAge: false, extractedAge: null. If it's a question, set isQuestion: true and replyToUser.

Respond with ONLY a JSON object in this exact format (no markdown, no code block):
{"isAge":true|false,"extractedAge":number|null,"isQuestion":true|false,"replyToUser":string|null}`;

function parseJsonFromContent(content: string): Record<string, unknown> | null {
    const trimmed = content.trim();
    // Strip markdown code block if present
    const withoutBlock = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    try {
        return JSON.parse(withoutBlock) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/** Obvious question keywords: if present and message doesn't look like a name, treat as question for fallback */
const QUESTION_HINTS = /\b(when|what time|open|timing|hours|eppol|samayam|ethra|thurakkum|where|address|how much|price|cost)\b/i;
/** Looks like a person name: 1-3 words, letters (and common diacritics), no digits */
function fallbackLooksLikeName(text: string): boolean {
    const t = text.trim();
    if (t.length < 2 || t.length > 80) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 3) return false;
    const lettersOnly = /^[\p{L}\s.'-]+$/u.test(t) && !/\d/.test(t);
    return lettersOnly;
}

export async function classifyNameInput(
    userMessage: string,
    preferredLanguage?: string | null
): Promise<ClassifyNameResult> {
    const fallback: ClassifyNameResult = {
        isPatientName: false,
        extractedName: null,
        isQuestion: false,
        replyToUser: null,
    };

    try {
        const langLine = preferredLanguage ? ` Preferred reply language for replyToUser: ${preferredLanguage}.` : '';
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            config: {
                systemInstruction: NAME_SYSTEM_PROMPT + langLine,
            }
        });
        const raw = response.text?.trim() || '';
        const parsed = parseJsonFromContent(raw);
        if (!parsed) {
            if (QUESTION_HINTS.test(userMessage)) return { ...fallback, isQuestion: true, replyToUser: "We're open 9 AM – 9 PM. Please share the patient's name." };
            if (fallbackLooksLikeName(userMessage)) return { isPatientName: true, extractedName: userMessage.trim(), isQuestion: false, replyToUser: null };
            return fallback;
        }
        const isPatientName = Boolean(parsed.isPatientName);
        const extractedName = typeof parsed.extractedName === 'string' ? parsed.extractedName.trim() || null : null;
        const isQuestion = Boolean(parsed.isQuestion);
        const replyToUser = typeof parsed.replyToUser === 'string' ? parsed.replyToUser.trim() || null : null;
        return { isPatientName, extractedName, isQuestion, replyToUser };
    } catch (err) {
        console.error('[classifyNameInput] Gemini error:', err);
        if (QUESTION_HINTS.test(userMessage)) return { ...fallback, isQuestion: true, replyToUser: "We're open 9 AM – 9 PM. Please share the patient's name." };
        if (fallbackLooksLikeName(userMessage)) return { isPatientName: true, extractedName: userMessage.trim(), isQuestion: false, replyToUser: null };
        return fallback;
    }
}

export async function classifyAgeInput(
    userMessage: string,
    preferredLanguage?: string | null
): Promise<ClassifyAgeResult> {
    const fallback: ClassifyAgeResult = {
        isAge: false,
        extractedAge: null,
        isQuestion: false,
        replyToUser: null,
    };

    const ageNum = parseInt(userMessage.trim(), 10);
    if (!Number.isNaN(ageNum) && ageNum >= 1 && ageNum <= 99 && /^\d+$/.test(userMessage.trim())) {
        return { isAge: true, extractedAge: ageNum, isQuestion: false, replyToUser: null };
    }

    try {
        const langLine = preferredLanguage ? ` Preferred reply language for replyToUser: ${preferredLanguage}.` : '';
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            config: {
                systemInstruction: AGE_SYSTEM_PROMPT + langLine,
            }
        });
        const raw = response.text?.trim() || '';
        const parsed = parseJsonFromContent(raw);
        if (!parsed) {
            const match = userMessage.match(/\b(\d{1,2})\b/);
            if (match) {
                const n = parseInt(match[1], 10);
                if (n >= 1 && n <= 99) return { isAge: true, extractedAge: n, isQuestion: false, replyToUser: null };
            }
            if (QUESTION_HINTS.test(userMessage)) return { ...fallback, isQuestion: true, replyToUser: "We're open 9 AM – 9 PM. Please enter the patient's age (1-99)." };
            return fallback;
        }
        const isAge = Boolean(parsed.isAge);
        const extractedAge = typeof parsed.extractedAge === 'number' && parsed.extractedAge >= 1 && parsed.extractedAge <= 99
            ? parsed.extractedAge
            : null;
        const isQuestion = Boolean(parsed.isQuestion);
        const replyToUser = typeof parsed.replyToUser === 'string' ? parsed.replyToUser.trim() || null : null;
        return { isAge, extractedAge, isQuestion, replyToUser };
    } catch (err) {
        console.error('[classifyAgeInput] Gemini error:', err);
        const match = userMessage.match(/\b(\d{1,2})\b/);
        if (match) {
            const n = parseInt(match[1], 10);
            if (n >= 1 && n <= 99) return { isAge: true, extractedAge: n, isQuestion: false, replyToUser: null };
        }
        if (QUESTION_HINTS.test(userMessage)) return { ...fallback, isQuestion: true, replyToUser: "We're open 9 AM – 9 PM. Please enter the patient's age (1-99)." };
        return fallback;
    }
}

