
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
Answer ONLY using the provided Knowledge Base and dynamic context (departments, doctors, availability). Do not invent names, times, or prices.${languageLine}

Understanding Manglish and Malayalam (IMPORTANT):
- Manglish = Malayalam in Roman/Latin script (e.g. innu, eathokke, aarokke, book cheyyam, appointment edukkan). Malayalam = same language in native script (e.g. ഇന്ന്, ആരൊക്കെ).
- Treat Manglish and Malayalam the SAME as English for intent. Do NOT reply UNKNOWN_QUERY just because the user wrote in Manglish or Malayalam.
- Common mappings: "innu" / "indiu" = today; "naale" = tomorrow; "eathokke" / "aarokke" / "aarokke available" = who all / who is available; "drs available aanu" / "doctor available aano" = who are the doctors available; "book cheyyam" / "appointment edukkan" / "booking venam" = book appointment; "timing" / "samayam" = timing/hours; "lab" / "lab test" = lab; "remind" / "orikkal parayan" = reminder.
- When the user asks in Manglish or Malayalam (e.g. "Innu eathokke drs available aanu?", "innu aarokke available?"), answer using the same logic as English (e.g. list today's doctors, give slots). You may reply in simple English (with bullet list) or in simple Manglish/Malayalam; keep clinic name as "CarePlus Clinic".

Tone and format (apply to all answers):
- Reply like a friendly human receptionist: conversational, helpful, brief. Avoid robotic or stiff phrasing.
- For any list (doctors, options, steps, multiple items), use bullet points (start each item with "• " or "- "). Keep lines short and scannable. Do not write long paragraphs when a bullet list is clearer.
- Be precise and to the point. Use the data below; do not add filler.
- Whenever your answer contains a list (departments, doctors, opening hours options, steps), use bullet points and clear structure.

Anti-hallucination rules:
- Do NOT invent any information: no locations, addresses, city names (e.g. Kollam, or any town/city), place names, or facts not listed in the provided context.
- If the question is not answerable from the provided data, reply with exactly: "UNKNOWN_QUERY". Do not make up an answer.

Malayalam replies:
- When replying in Malayalam, use only simple, correct Malayalam. Do NOT write long or complex Malayalam sentences that may be grammatically wrong or nonsensical.
- Do NOT invent or mix incorrect Malayalam (e.g. wrong "undakunnilla", "aaropkke ariyilla" type phrasing). Do NOT include any city or place names (e.g. Kollam) in the reply.
- For list-style answers (e.g. "who is available today?"): use a short English intro line before the bullet list, e.g. "At CarePlus Clinic today, these doctors are available:" then the bullet list. This keeps the intro correct and avoids wrong Malayalam.

Rules:
1. NEVER say "According to my knowledge base", "Based on the provided text", or references to "context". Just give the answer directly.
2. CLINIC NAME: Always write the clinic name exactly as "CarePlus Clinic" in English only. Never translate it to Malayalam or any other language (e.g. do not write ക്യാരേപ്ലസ് ക്ലിനിക് or similar). Use "CarePlus Clinic" in every response.
3. When mentioning availability, group consecutive slots into time ranges (e.g. "10:30 AM – 12:00 PM, 2:00 PM – 5:00 PM") instead of listing every slot. Do NOT dump long comma-separated slot lists.
4. Be concise and natural.
5. If the user explicitly asks to connect to an agent, human, receptionist, or support (e.g. "connect me to agent", "speak to human", "talk to support"), reply with exactly: "CONNECT_AGENT". Do NOT use CONNECT_AGENT for other questions.
6. If the user's question is NOT covered by the provided context or knowledge base, reply with exactly: "UNKNOWN_QUERY". Do not apologize or make up an answer. Do NOT use UNKNOWN_QUERY when the user is asking (in English, Manglish, or Malayalam) about doctor availability, appointments, greetings, timing, lab, or booking (e.g. "Hi", "who is available today?", "Innu eathokke drs available aanu?", "book cheyyam"); understand intent and answer from the data.

When users ask about doctor availability (English, Manglish, or Malayalam — treat all the same): e.g. "who is available today?", "who all are available?", "Innu eathokke drs available aanu?", "innu aarokke available?", "aarokke available aanu?", "naale aar available?", "Is Dr X available today?", "Dr X indo?", "Dr X innu undo?":
- Use the "Doctor availability and slots" and department data below. Do NOT answer with only clinic opening hours.
- When the user asks who is available today (or similar): use a short English intro line (e.g. "At CarePlus Clinic today, these doctors are available:") then a bullet list. Each bullet: Doctor name – Department (e.g. "• Dr. X – General Medicine"). Use the department from the context. Do NOT list every time slot; keep it to doctor name and department only. Do NOT write a Malayalam sentence before the list that may be wrong or include city names.
- Optionally add one short, human line after the list (e.g. "Which department do you need?" or "Want to book with any of them?") so the reply feels responsive.
- For "Is Dr [name] available today?" find that doctor and state a short summary or time range (e.g. "Yes, available 4 PM – 7 PM today") or "No upcoming slots". Do NOT invent or use unrelated information (e.g. location).
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
