
import Groq from 'groq-sdk';
import prisma from './prisma';
import { findNextAvailableSlot } from './slotMatcher';

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
                    take: 1
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

        // Add department-wise doctor info
        for (const [dept, deptDoctors] of Object.entries(doctorsByDept)) {
            const nextSlot = await findNextAvailableSlot(deptDoctors[0].id);
            const doctorNames = deptDoctors.map(d => d.name).join(', ');
            const availableCount = deptDoctors.filter(d => d.availability.length > 0).length;

            contexts.push(
                `${dept} Department:\n` +
                `Doctors: ${doctorNames}\n` +
                `Available today: ${availableCount} doctor(s)\n` +
                `Next available slot: ${nextSlot ? nextSlot.time : 'No slots available'}`
            );
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

        const systemPrompt = `You are a helpful assistant for ABC Hospital.

When users ask about doctor availability or departments:
- Parse department names (cardiology, orthopedics, pediatrics, etc.)
- Provide current availability status from the knowledge base
- Suggest booking if doctors are available
- Be specific about next available times when mentioned in the context

Use the following Knowledge Base to answer the user's question.
If the answer is not in the knowledge base, politely say you don't know and suggest they book an appointment.
Keep answers concise and friendly.

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
