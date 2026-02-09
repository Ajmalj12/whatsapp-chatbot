
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

        // 2. Doctor availability by department
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

            contexts.push(deptInfo);
        }

        // 3. Static knowledge base
        const kb = await prisma.knowledgeBase.findMany();
        contexts.push(...kb.map(k => `Q: ${k.question}\nA: ${k.answer}`));

    } catch (error) {
        console.error('Error generating dynamic context:', error);
    }

    return contexts;
}

export async function getAIResponse(userQuery: string, staticContext?: string[]) {
    if (!process.env.GROQ_API_KEY) {
        return "I'm sorry, my AI brain is currently offline (API Key missing). Please contact support.";
    }

    try {
        // Combine dynamic and static context
        const dynamicContext = await getDynamicContext();
        const allContext = [...dynamicContext, ...(staticContext || [])];
        const context = allContext.join("\n\n");

        const systemPrompt = `You are a helpful, friendly receptionist at ABC Hospital.

Rules:
1. NEVER say "According to my knowledge base", "Based on the provided text", or references to "context". Just give the answer directly.
2. When mentioning availability, group consecutive slots into ranges (e.g., say "Dr. Smith is available from 10:00 AM to 12:00 PM" instead of listing "10:00, 10:30, 11:00...").
3. Be concise and natural.

When users ask about doctor availability:
- Check the parsed department/doctor info.
- State the specific available time ranges for the requested date.
- Suggest booking.

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
