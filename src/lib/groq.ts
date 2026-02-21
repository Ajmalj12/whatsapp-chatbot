
import Groq from 'groq-sdk';
import prisma from './prisma';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

/**
 * Generate dynamic context from database for AI responses
 */
async function getDynamicContext(): Promise<string[]> {
    const contexts: string[] = [];

    try {
        // 1. Department information
        const departments = await prisma.department.findMany({
            where: { active: true },
            orderBy: { displayOrder: 'asc' }
        });

        if (departments.length > 0) {
            const deptList = departments.map(d =>
                `- ${d.name}${d.description ? ': ' + d.description : ''}`
            ).join('\n');
            contexts.push(`Available Departments:\n${deptList}`);
        }

        // 2. Doctor availability and slots (use this for "who is available", "Dr X available today?", etc.)
        const doctors = await prisma.doctor.findMany({
            where: { active: true },
            include: {
                availability: {
                    where: {
                        isBooked: false,
                        startTime: { gte: new Date() }
                    },
                    orderBy: { startTime: 'asc' },
                    take: 20
                }
            }
        });

        // Group doctors by department
        const doctorsByDept: { [key: string]: any[] } = {};
        for (const doctor of doctors) {
            if (!doctorsByDept[doctor.department]) {
                doctorsByDept[doctor.department] = [];
            }
            doctorsByDept[doctor.department].push(doctor);
        }

        // Add department-wise doctor info with detailed slots
        const doctorAvailabilityLines: string[] = [];
        for (const [dept, deptDoctors] of Object.entries(doctorsByDept)) {
            let deptInfo = `${dept} Department:\n`;

            deptDoctors.forEach(doc => {
                const slotsByDate: { [key: string]: string[] } = {};
                doc.availability.forEach((s: any) => {
                    const dateKey = s.startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const timeStr = s.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = [];
                    slotsByDate[dateKey].push(timeStr);
                });

                const formattedSlots = Object.entries(slotsByDate)
                    .map(([date, times]) => `${date} [${times.join(', ')}]`)
                    .join('; ');

                deptInfo += `- Dr. ${doc.name}: ${formattedSlots ? formattedSlots : 'No upcoming slots'}\n`;
            });

            doctorAvailabilityLines.push(deptInfo);
        }
        if (doctorAvailabilityLines.length > 0) {
            contexts.push('Doctor availability and slots (use this for "who is available today?", "Dr X available?", etc.):\n' + doctorAvailabilityLines.join('\n'));
        }

        // 3. Static knowledge base
        const kb = await prisma.knowledgeBase.findMany();
        contexts.push(...kb.map(k => `Q: ${k.question}\nA: ${k.answer}`));

    } catch (error) {
        console.error('Error generating dynamic context:', error);
    }

    return contexts;
}

export async function getAIResponse(userQuery: string, staticContext?: string[], preferredLanguage?: string | null) {
    if (!process.env.GROQ_API_KEY) {
        return "I'm sorry, my AI brain is currently offline (API Key missing). Please contact support.";
    }

    try {
        // Combine dynamic and static context
        const dynamicContext = await getDynamicContext();
        const allContext = [...dynamicContext, ...(staticContext || [])];
        const context = allContext.join("\n\n");

        const languageLine = preferredLanguage ? `\nPreferred reply language: ${preferredLanguage}. Respond in this language when appropriate.` : '';
        const systemPrompt = `You are a helpful, friendly receptionist at CarePlus Clinic.
Answer ONLY using the provided Knowledge Base and dynamic context (departments, doctors, availability). Do not invent names, times, or prices. Understand Malayalam and Manglish (Roman script) and respond in the same language when appropriate.${languageLine}

Anti-hallucination rules:
- Do NOT invent any information: no locations, addresses, city names, or facts not listed in the provided context.
- If the question is not answerable from the provided data, reply with exactly: "UNKNOWN_QUERY". Do not make up an answer.

Rules:
1. NEVER say "According to my knowledge base", "Based on the provided text", or references to "context". Just give the answer directly.
2. Always write the clinic name as "CarePlus Clinic" in English in every response, regardless of the language of the rest of the reply (e.g. even when replying in Malayalam).
3. When mentioning availability, group consecutive slots into ranges (e.g., say "Dr. Smith is available from 10:00 AM to 12:00 PM" instead of listing "10:00, 10:30, 11:00...").
4. Be concise and natural.
5. If the user asks to speak to a human, receptionist, or support, reply with exactly: "UNKNOWN_QUERY".
6. If the user's question is NOT covered by the provided context or knowledge base, reply with exactly: "UNKNOWN_QUERY". Do not apologize or make up an answer.

When users ask about doctor availability (e.g. "who is available today?", "who all are available?", "aarokke available?", "innu aarokke available aanu?", "Is Dr X available today?", "Dr X indo?"):
- Use the "Doctor availability and slots" section below: list the doctors and their time slots for the requested date (today/tomorrow). Do NOT answer with only clinic opening hours.
- For "Is Dr [name] available today?" find that doctor in the context and state their slots for the requested date, or "No upcoming slots" if none. Do NOT invent or use unrelated information (e.g. location).
- Prefer the doctor/slot data over generic KB answers when the user is asking about who is available or which doctor has slots.

Use ONLY the data below. Do not add any information that is not listed here.

Knowledge Base:
${context}
`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userQuery },
            ],
            model: 'llama-3.1-8b-instant',
        });

        return completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
    } catch (error) {
        console.error("Groq API Error:", error);
        return "I'm having trouble connecting to my AI service right now.";
    }
}
