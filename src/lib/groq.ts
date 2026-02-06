
import Groq from 'groq-sdk';
import prisma from './prisma';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'dummy_key',
});

export async function getAIResponse(userQuery: string, contextStrings: string[]) {
    if (!process.env.GROQ_API_KEY) {
        return "I'm sorry, my AI brain is currently offline (API Key missing). Please contact support.";
    }

    try {
        const context = contextStrings.join("\n\n");
        const systemPrompt = `You are a helpful assistant for ABC Hospital.
Use the following Knowledge Base to answer the user's question.
If the answer is not in the knowledge base, politely say you don't know and suggest they book an appointment.
Keep answers concise and friendly.
Review Knowledge Base:
${context}
`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userQuery },
            ],
            model: 'llama3-8b-8192', // or another available model
        });

        return completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
    } catch (error) {
        console.error("Groq API Error:", error);
        return "I'm having trouble connecting to my AI service right now.";
    }
}
