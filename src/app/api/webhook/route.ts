import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWhatsAppMessage, sendWhatsAppButtons } from '@/lib/whatsapp';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('--- Incoming WhatsApp Webhook ---');
        console.log(JSON.stringify(body, null, 2));

        // Check if it's a valid WhatsApp message
        if (!body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            console.log('No message found in webhook body');
            return NextResponse.json({ status: 'ignored' });
        }

        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from; // Sender's phone number
        console.log(`Message from: ${from}`);

        let text = "";
        if (message.type === 'text') {
            text = message.text.body;
        } else if (message.type === 'interactive') {
            text = message.interactive.button_reply.title;
        }

        let session = await prisma.session.findUnique({
            where: { phone: from },
        });

        if (!session) {
            session = await prisma.session.create({
                data: {
                    phone: from,
                    currentStep: 'LANGUAGE_SELECTION',
                },
            });
            await sendWhatsAppButtons(from, "Please select your language 👇", ["English", "മലയാളം"]);
            return NextResponse.json({ status: 'ok' });
        }

        const currentData = JSON.parse(session.data);

        switch (session.currentStep) {
            case 'LANGUAGE_SELECTION':
                const lang = text === 'മലയാളം' ? 'malayalam' : 'english';
                await prisma.session.update({
                    where: { phone: from },
                    data: {
                        language: lang,
                        currentStep: 'MAIN_MENU',
                    },
                });
                const welcome = lang === 'english' ? "Welcome to ABC Hospital 👋\nHow can we help you today?" : "ABC ആശുപത്രിയിലേക്ക് സ്വാഗതം 👋\nഎങ്ങനെ സഹായിക്കാം?";
                await sendWhatsAppButtons(from, welcome, ["Book Appointment", "Contact Hospital", "Location"]);
                break;

            case 'MAIN_MENU':
                if (text.includes('Book')) {
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });
                    await prisma.session.update({
                        where: { phone: from },
                        data: { currentStep: 'DOCTOR_SELECTION' },
                    });
                    const doctorList = doctors.map((d: any) => `🩺 ${d.name} (${d.department})`).join('\n');
                    await sendWhatsAppButtons(from, `Please choose a doctor 👇\n\n${doctorList}`, doctors.map((d: any) => d.name));
                }
                break;

            case 'DOCTOR_SELECTION':
                const selectedDoctor = await prisma.doctor.findFirst({
                    where: { name: { contains: text } }
                });
                if (selectedDoctor) {
                    const slots = await prisma.availability.findMany({
                        where: {
                            doctorId: selectedDoctor.id,
                            isBooked: false,
                            startTime: { gte: new Date() }
                        },
                        orderBy: { startTime: 'asc' },
                        take: 5
                    });

                    if (slots.length === 0) {
                        await sendWhatsAppMessage(from, `Sorry, ${selectedDoctor.name} has no available slots at the moment. Please try another doctor or check back later.`);
                        await sendWhatsAppButtons(from, "How else can we help you?", ["Book Appointment", "Contact Hospital", "Location"]);
                        await prisma.session.update({
                            where: { phone: from },
                            data: { currentStep: 'MAIN_MENU' }
                        });
                        return NextResponse.json({ status: 'ok' });
                    }

                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'AVAILABILITY_SELECTION',
                            data: JSON.stringify({ ...currentData, doctorId: selectedDoctor.id })
                        },
                    });
                    const slotList = slots.map((s: any, i: number) => `${i + 1}️⃣ ${new Date(s.startTime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`).join('\n');
                    await sendWhatsAppButtons(from, `${selectedDoctor.name} is available on:\n\n${slotList}\n\nSelect a time slot 👇`, slots.map((s: any, i: number) => `Slot ${i + 1}`));
                }
                break;

            case 'AVAILABILITY_SELECTION':
                const doctorId = currentData.doctorId;
                const slotsForSelection = await prisma.availability.findMany({
                    where: { doctorId, isBooked: false },
                    take: 5
                });
                const slotIndex = parseInt(text.replace('Slot ', '')) - 1;
                if (!isNaN(slotIndex) && slotsForSelection[slotIndex]) {
                    const selectedSlot = slotsForSelection[slotIndex];
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'COLLECT_NAME',
                            data: JSON.stringify({ ...currentData, availabilityId: selectedSlot.id })
                        },
                    });
                    await sendWhatsAppMessage(from, "Great! Please enter the Patient's Name:");
                }
                break;

            case 'COLLECT_NAME':
                await prisma.session.update({
                    where: { phone: from },
                    data: {
                        currentStep: 'COLLECT_AGE',
                        data: JSON.stringify({ ...currentData, patientName: text })
                    },
                });
                await sendWhatsAppMessage(from, `Got it. What is ${text}'s age?`);
                break;

            case 'COLLECT_AGE':
                const finalAgeData = { ...currentData, patientAge: text };
                const doc = await prisma.doctor.findUnique({ where: { id: finalAgeData.doctorId } });
                const slot = await prisma.availability.findUnique({ where: { id: finalAgeData.availabilityId } });

                await prisma.appointment.create({
                    data: {
                        doctorId: finalAgeData.doctorId,
                        availabilityId: finalAgeData.availabilityId,
                        patientName: finalAgeData.patientName,
                        patientAge: text,
                        patientPhone: from,
                    }
                });

                await prisma.availability.update({
                    where: { id: finalAgeData.availabilityId },
                    data: { isBooked: true }
                });

                await prisma.session.delete({ where: { phone: from } });

                const confirmMsg = `✅ Appointment Confirmed!\n\nDoctor: ${doc?.name}\nDate: ${new Date(slot?.startTime!).toLocaleDateString()}\nTime: ${new Date(slot?.startTime!).toLocaleTimeString()}\n\nOur team will contact you shortly.`;
                await sendWhatsAppMessage(from, confirmMsg);
                break;

            default:
                await sendWhatsAppMessage(from, "Sorry, I didn't understand that. Type 'Hi' to restart.");
                break;
        }

        return NextResponse.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
}
