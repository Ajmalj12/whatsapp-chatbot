import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWhatsAppMessage, sendWhatsAppButtons } from '@/lib/whatsapp';
import { getAIResponse } from '@/lib/groq';
import { parseNaturalTime, containsTimeRequest, formatAppointmentTime } from '@/lib/timeParser';
import { findBestSlots, formatSlotMatches } from '@/lib/slotMatcher';

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
        console.log(`[Webhook] Message from: ${from}`);

        let text = "";
        if (message.type === 'text') {
            text = message.text.body;
        } else if (message.type === 'interactive') {
            text = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
        }
        console.log(`[Webhook] Extracted Text: "${text}"`);

        let session = await prisma.session.findUnique({
            where: { phone: from },
        });

        // 1. GLOBAL RESET: Allow starting over at any time
        const cleanText = text.toLowerCase().trim();
        if (['hi', 'hello', 'menu', 'reset', 'start', 'restart', '0'].includes(cleanText)) {
            console.log(`[Webhook] Global reset triggered for ${from}`);
            if (session) {
                await prisma.session.delete({ where: { phone: from } });
            }
            session = await prisma.session.create({
                data: { phone: from, currentStep: 'LANGUAGE_SELECTION' },
            });
            await sendWhatsAppButtons(from, "Welcome to ABC Hospital! Please select your language 👇", ["English", "മലയാളം"]);
            return NextResponse.json({ status: 'ok' });
        }

        if (!session) {
            console.log(`[Webhook] New session for ${from}`);
            session = await prisma.session.create({
                data: {
                    phone: from,
                    currentStep: 'LANGUAGE_SELECTION',
                },
            });
            await sendWhatsAppButtons(from, "Welcome! Please select your language 👇", ["English", "മലയാളം"]);
            return NextResponse.json({ status: 'ok' });
        }

        const currentData = JSON.parse(session.data || '{}');

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
                await sendWhatsAppButtons(from, welcome, ["Book Appointment", "Need to know more"]);
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
                } else if (text.includes('know more') || text.includes('Need')) {
                    await prisma.session.update({
                        where: { phone: from },
                        data: { currentStep: 'KNOWLEDGE_QUERY' },
                    });
                    await sendWhatsAppMessage(from, "Sure! What would you like to know? (e.g. Opening hours, Specialists, etc.)");
                } else {
                    await sendWhatsAppButtons(from, "Please select an option 👇", ["Book Appointment", "Need to know more"]);
                }
                break;

            case 'KNOWLEDGE_QUERY':
                if (text.toLowerCase().includes('book') || text.toLowerCase().includes('appointment')) {
                    // Transition to booking
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });
                    await prisma.session.update({
                        where: { phone: from },
                        data: { currentStep: 'DOCTOR_SELECTION' },
                    });
                    const doctorList = doctors.map((d: any) => `🩺 ${d.name} (${d.department})`).join('\n');
                    await sendWhatsAppButtons(from, `Please choose a doctor 👇\n\n${doctorList}`, doctors.map((d: any) => d.name));
                } else {
                    // AI Reply with dynamic context (no need to pass static context)
                    const aiReply = await getAIResponse(text);

                    await sendWhatsAppButtons(from, aiReply, ["Book Appointment"]);
                }
                break;


            case 'DOCTOR_SELECTION':
                console.log(`[Webhook] Searching for doctor matching: "${text}"`);
                const selectedDoctor = await prisma.doctor.findFirst({
                    where: { name: { contains: text, mode: 'insensitive' } }
                });

                if (selectedDoctor) {
                    console.log(`[Webhook] Found doctor: ${selectedDoctor.name}`);

                    // Check if user mentioned a date/time in the same message
                    const parsedTimeInMessage = containsTimeRequest(text) ? parseNaturalTime(text) : null;

                    if (parsedTimeInMessage) {
                        // User said something like "book tomorrow for dr anil"
                        console.log(`[Webhook] Detected date in message: ${parsedTimeInMessage.date}`);

                        const requestedDate = parsedTimeInMessage.date;
                        const startOfDay = new Date(requestedDate);
                        startOfDay.setHours(0, 0, 0, 0);
                        const endOfDay = new Date(requestedDate);
                        endOfDay.setHours(23, 59, 59, 999);

                        // Get all slots for that specific day
                        const slotsForDay = await prisma.availability.findMany({
                            where: {
                                doctorId: selectedDoctor.id,
                                isBooked: false,
                                startTime: {
                                    gte: startOfDay,
                                    lte: endOfDay
                                }
                            },
                            orderBy: { startTime: 'asc' },
                        });

                        if (slotsForDay.length === 0) {
                            await sendWhatsAppMessage(
                                from,
                                `Sorry, ${selectedDoctor.name} has no available slots on ${formatAppointmentTime(requestedDate)}. Would you like to:\\n\\n1. Choose another date\\n2. Choose another doctor`
                            );
                            return NextResponse.json({ status: 'ok' });
                        }

                        // Show all available slots for that day
                        const slotButtons = slotsForDay.slice(0, 10).map((slot: any) => {
                            const time = new Date(slot.startTime);
                            return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        });

                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'TIME_SELECTION',
                                data: JSON.stringify({
                                    ...currentData,
                                    doctorId: selectedDoctor.id,
                                    doctorName: selectedDoctor.name,
                                    selectedDate: requestedDate.toISOString(),
                                    availableSlots: slotsForDay.map((s: any) => ({
                                        id: s.id,
                                        startTime: s.startTime,
                                        endTime: s.endTime
                                    }))
                                })
                            },
                        });

                        const dateStr = requestedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                        await sendWhatsAppButtons(
                            from,
                            `📅 Available slots for ${selectedDoctor.name} on ${dateStr}:\\n\\nPlease select a time 👇`,
                            slotButtons
                        );
                        return NextResponse.json({ status: 'ok' });
                    }

                    // No date mentioned, ask for preferred time
                    const slots = await prisma.availability.findMany({
                        where: {
                            doctorId: selectedDoctor.id,
                            isBooked: false,
                            startTime: { gte: new Date() }
                        },
                        orderBy: { startTime: 'asc' },
                    });

                    if (slots.length === 0) {
                        console.log(`[Webhook] No slots for ${selectedDoctor.name}`);
                        await sendWhatsAppMessage(from, `Sorry, ${selectedDoctor.name} has no available slots at the moment. Please try another doctor or check back later.`);
                        const doctors = await prisma.doctor.findMany({ where: { active: true } });
                        const doctorList = doctors.map((d: any) => `🩺 ${d.name} (${d.department})`).join('\n');
                        await sendWhatsAppButtons(from, `Please choose another doctor 👇\n\n${doctorList}`, doctors.map((d: any) => d.name));
                        return NextResponse.json({ status: 'ok' });
                    }

                    // Ask for preferred time or browse slots
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'TIME_REQUEST',
                            data: JSON.stringify({ ...currentData, doctorId: selectedDoctor.id, doctorName: selectedDoctor.name })
                        },
                    });

                    await sendWhatsAppMessage(
                        from,
                        `Great! Do you have a preferred date and time?\n\nExamples:\n• "Tomorrow at 3 PM"\n• "Feb 15 at 10:30"\n• "Next Monday 2pm"\n\nOr reply "Browse slots" to see available times.`
                    );
                } else {
                    console.log(`[Webhook] No doctor matched "${text}". Resending list.`);
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });
                    const doctorList = doctors.map((d: any) => `🩺 ${d.name} (${d.department})`).join('\n');
                    await sendWhatsAppButtons(from, `I couldn't find that doctor. Please choose from the list 👇\n\n${doctorList}`, doctors.map((d: any) => d.name));
                }
                break;


            case 'TIME_REQUEST':
                const doctorId = currentData.doctorId;
                const doctorName = currentData.doctorName;

                if (text.toLowerCase().includes('browse') || text.toLowerCase().includes('show')) {
                    // Fallback to original date selection flow
                    const slots = await prisma.availability.findMany({
                        where: {
                            doctorId,
                            isBooked: false,
                            startTime: { gte: new Date() }
                        },
                        orderBy: { startTime: 'asc' },
                    });

                    const uniqueDates: string[] = Array.from(new Set<string>(slots.map((s: any) =>
                        new Date(s.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                    ))).slice(0, 3);

                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'DATE_SELECTION',
                            data: JSON.stringify(currentData)
                        },
                    });

                    await sendWhatsAppButtons(from, `Please select a date for your appointment with ${doctorName} 👇`, uniqueDates);
                } else {
                    // Parse natural language time
                    const parsedTime = parseNaturalTime(text);

                    if (!parsedTime) {
                        await sendWhatsAppMessage(from, "I couldn't understand that time. Please try again with a format like:\n• \"Tomorrow at 3 PM\"\n• \"Feb 15 at 10:30\"\n\nOr reply \"Browse slots\" to see available times.");
                        return NextResponse.json({ status: 'ok' });
                    }

                    console.log(`[Webhook] Parsed time: ${parsedTime.date}`);

                    // Find best matching slots
                    const matches = await findBestSlots(doctorId, parsedTime.date, 3);

                    if (matches.length === 0) {
                        await sendWhatsAppMessage(from, `Sorry, no available slots found for ${doctorName}. Please try another doctor or time.`);
                        return NextResponse.json({ status: 'ok' });
                    }

                    if (matches[0].matchType === 'exact') {
                        // Exact match found - proceed directly to booking
                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'COLLECT_NAME',
                                data: JSON.stringify({ ...currentData, availabilityId: matches[0].slot.id })
                            },
                        });
                        await sendWhatsAppMessage(from, `✅ Perfect! ${formatAppointmentTime(matches[0].slot.startTime)} is available.\n\nPlease enter the Patient's Name:`);
                    } else {
                        // Show alternatives
                        const formattedSlots = formatSlotMatches(matches);
                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'ALTERNATIVE_SELECTION',
                                data: JSON.stringify({
                                    ...currentData,
                                    alternativeSlots: matches.map(m => m.slot.id)
                                })
                            },
                        });

                        await sendWhatsAppMessage(
                            from,
                            `Sorry, ${formatAppointmentTime(parsedTime.date)} is not available.\n\nHere are 3 alternative times:\n\n${formattedSlots}\n\nReply with the number (1, 2, or 3) to book.`
                        );
                    }
                }
                break;

            case 'ALTERNATIVE_SELECTION':
                const slotIndex = parseInt(text.trim()) - 1;
                const alternativeSlots = currentData.alternativeSlots || [];

                if (slotIndex >= 0 && slotIndex < alternativeSlots.length) {
                    const selectedSlotId = alternativeSlots[slotIndex];
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'COLLECT_NAME',
                            data: JSON.stringify({ ...currentData, availabilityId: selectedSlotId })
                        },
                    });
                    await sendWhatsAppMessage(from, "Great! Please enter the Patient's Name:");
                } else {
                    await sendWhatsAppMessage(from, "Please reply with 1, 2, or 3 to select a time slot.");
                }
                break;

            case 'TIME_SELECTION':
                // User selected a time from the available slots shown
                const selectedTimeText = text.trim();
                const availableSlotsData = currentData.availableSlots || [];

                // Find the slot that matches the selected time
                const matchedSlot = availableSlotsData.find((slot: any) => {
                    const slotTime = new Date(slot.startTime);
                    const timeStr = slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    return timeStr === selectedTimeText;
                });

                if (matchedSlot) {
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'COLLECT_NAME',
                            data: JSON.stringify({ ...currentData, availabilityId: matchedSlot.id })
                        },
                    });
                    await sendWhatsAppMessage(from, `✅ Great! Your appointment is set for ${formatAppointmentTime(matchedSlot.startTime)}.\n\nPlease enter the Patient's Name:`);
                } else {
                    await sendWhatsAppMessage(from, "Please select one of the available time slots from the buttons above.");
                }
                break;

            case 'DATE_SELECTION':
                const selectedDate = text;
                const dId = currentData.doctorId;
                console.log(`[Webhook] Date selected: ${selectedDate} for Dr ID: ${dId}`);

                const availableSlots = await prisma.availability.findMany({
                    where: {
                        doctorId: dId,
                        isBooked: false,
                        startTime: { gte: new Date() }
                    },
                    orderBy: { startTime: 'asc' }
                });

                // Filter slots that match the selected date string
                const filteredSlots = availableSlots.filter((s: any) =>
                    new Date(s.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === selectedDate
                ).slice(0, 3);

                if (filteredSlots.length === 0) {
                    await sendWhatsAppMessage(from, "Sorry, no slots available for that date. Please choose another date.");
                    // Reprompt dates logic here if needed, or redirect to doctor selection
                    return NextResponse.json({ status: 'ok' });
                }

                await prisma.session.update({
                    where: { phone: from },
                    data: {
                        currentStep: 'AVAILABILITY_SELECTION',
                        data: JSON.stringify({ ...currentData, selectedDate })
                    },
                });

                const slotList = filteredSlots.map((s: any, i: number) =>
                    `${i + 1}️⃣ ${new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                ).join('\n');

                await sendWhatsAppButtons(from, `Available slots on ${selectedDate}:\n\n${slotList}\n\nSelect a time slot 👇`, filteredSlots.map((s: any, i: number) => `Slot ${i + 1}`));
                break;

            case 'AVAILABILITY_SELECTION':
                const docId = currentData.doctorId;
                const sDate = currentData.selectedDate;

                const allSlots = await prisma.availability.findMany({
                    where: { doctorId: docId, isBooked: false, startTime: { gte: new Date() } },
                    orderBy: { startTime: 'asc' }
                });

                const daySlots = allSlots.filter((s: any) =>
                    new Date(s.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === sDate
                ).slice(0, 3);

                const slotIdx = parseInt(text.replace('Slot ', '')) - 1;
                if (!isNaN(slotIdx) && daySlots[slotIdx]) {
                    const selectedSlot = daySlots[slotIdx];
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
