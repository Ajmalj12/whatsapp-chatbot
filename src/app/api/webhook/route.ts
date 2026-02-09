import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWhatsAppMessage, sendWhatsAppButtons, sendWhatsAppList } from '@/lib/whatsapp';
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
            case 'LANGUAGE_SELECTION': {
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
            }

            case 'MAIN_MENU': {
                if (text.includes('Book') || text.toLowerCase().includes('doctor') || text.toLowerCase().includes('find')) {
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });

                    if (doctors.length > 10) {
                        const departments = await prisma.department.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } });
                        await prisma.session.update({
                            where: { phone: from },
                            data: { currentStep: 'DEPARTMENT_SELECTION' },
                        });

                        await sendWhatsAppList(
                            from,
                            "Please choose a department first 👇",
                            "Select Department",
                            [{
                                title: "Departments",
                                rows: departments.map((dept: any) => ({
                                    id: `dept_${dept.id}`,
                                    title: dept.name,
                                    description: dept.description?.slice(0, 72)
                                }))
                            }]
                        );
                    } else {
                        await prisma.session.update({
                            where: { phone: from },
                            data: { currentStep: 'DOCTOR_SELECTION' },
                        });

                        await sendWhatsAppList(
                            from,
                            "Please choose a doctor 👇",
                            "Select Doctor",
                            [{
                                title: "Available Doctors",
                                rows: doctors.map((d: any) => ({
                                    id: `doc_${d.id}`,
                                    title: d.name,
                                    description: d.department
                                }))
                            }]
                        );
                    }
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
            }

            case 'KNOWLEDGE_QUERY': {
                if (text.toLowerCase().includes('book') || text.toLowerCase().includes('appointment')) {
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });

                    if (doctors.length > 10) {
                        const departments = await prisma.department.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } });
                        await prisma.session.update({
                            where: { phone: from },
                            data: { currentStep: 'DEPARTMENT_SELECTION' },
                        });

                        await sendWhatsAppList(
                            from,
                            "Please choose a department first 👇",
                            "Select Department",
                            [{
                                title: "Departments",
                                rows: departments.map((dept: any) => ({
                                    id: `dept_${dept.id}`,
                                    title: dept.name,
                                    description: dept.description?.slice(0, 72)
                                }))
                            }]
                        );
                    } else {
                        await prisma.session.update({
                            where: { phone: from },
                            data: { currentStep: 'DOCTOR_SELECTION' },
                        });

                        await sendWhatsAppList(
                            from,
                            "Please choose a doctor 👇",
                            "Select Doctor",
                            [{
                                title: "Available Doctors",
                                rows: doctors.map((d: any) => ({
                                    id: `doc_${d.id}`,
                                    title: d.name,
                                    description: d.department
                                }))
                            }]
                        );
                    }
                } else {
                    // AI Reply with dynamic context (no need to pass static context)
                    const aiReply = await getAIResponse(text);

                    await sendWhatsAppButtons(from, aiReply, ["Book Appointment"]);
                }
                break;
            }

            case 'DEPARTMENT_SELECTION': {
                console.log(`[Webhook] Department selected: "${text}"`);
                const doctorsInDept = await prisma.doctor.findMany({
                    where: { department: text, active: true }
                });

                if (doctorsInDept.length === 0) {
                    await sendWhatsAppMessage(from, `Sorry, no doctors are currently available in ${text}. Please try another department.`);
                    const departmentsAll = await prisma.department.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } });
                    await sendWhatsAppList(
                        from,
                        "Please choose a different department 👇",
                        "Select Department",
                        [{
                            title: "Departments",
                            rows: departmentsAll.map((dept: any) => ({
                                id: `dept_${dept.id}`,
                                title: dept.name,
                                description: dept.description?.slice(0, 72)
                            }))
                        }]
                    );
                    return NextResponse.json({ status: 'ok' });
                }

                await prisma.session.update({
                    where: { phone: from },
                    data: {
                        currentStep: 'DOCTOR_SELECTION',
                        data: JSON.stringify({ ...currentData, selectedDepartment: text })
                    },
                });

                await sendWhatsAppList(
                    from,
                    `Available doctors in ${text} 👇`,
                    "Select Doctor",
                    [{
                        title: text,
                        rows: doctorsInDept.map((d: any) => ({
                            id: `doc_${d.id}`,
                            title: d.name,
                            description: d.specialization || d.department
                        }))
                    }]
                );
                break;
            }


            case 'DOCTOR_SELECTION': {
                // No longer need explicit "View All Doctors" check here because it's the default UI now
                console.log(`[Webhook] Searching for doctor matching: "${text}"`);
                const selectedDoctor = await prisma.doctor.findFirst({
                    where: { name: { contains: text, mode: 'insensitive' } }
                });

                if (selectedDoctor) {
                    console.log(`[Webhook] Found doctor: ${selectedDoctor.name}`);

                    // Check if user mentioned a date/time in the same message (e.g., "book tomorrow for dr anil")
                    const parsedTimeInMessage = containsTimeRequest(text) ? parseNaturalTime(text) : null;

                    if (parsedTimeInMessage) {
                        // SHORTCUT: User said something like "book tomorrow for dr anil"
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
                                `Sorry, ${selectedDoctor.name} has no available slots on ${formatAppointmentTime(requestedDate)}. Would you like to:\n\n1. Choose another date\n2. Choose another doctor`
                            );
                            return NextResponse.json({ status: 'ok' });
                        }

                        // Show all available slots for that day
                        const slotButtons = slotsForDay.slice(0, 10).map((slot: any) => {
                            const timeStr = new Date(slot.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                            return timeStr;
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

                        const dateSlStr = requestedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                        await sendWhatsAppList(
                            from,
                            `📅 Available slots for ${selectedDoctor.name} on ${dateSlStr}:\n\nPlease select a time 👇`,
                            "Select Time",
                            [{
                                title: "Time Slots",
                                rows: slotButtons.map((time, idx) => ({
                                    id: `slot_${idx}`,
                                    title: time
                                }))
                            }]
                        );
                        return NextResponse.json({ status: 'ok' });
                    }

                    // ORIGINAL FLOW: Show available dates first
                    const allSlotsForDoc = await prisma.availability.findMany({
                        where: {
                            doctorId: selectedDoctor.id,
                            isBooked: false,
                            startTime: { gte: new Date() }
                        },
                        orderBy: { startTime: 'asc' },
                    });

                    if (allSlotsForDoc.length === 0) {
                        console.log(`[Webhook] No slots for ${selectedDoctor.name}`);
                        await sendWhatsAppMessage(from, `Sorry, ${selectedDoctor.name} has no available slots at the moment. Please try another doctor or check back later.`);

                        const doctorsAll = await prisma.doctor.findMany({ where: { active: true } });

                        await sendWhatsAppList(
                            from,
                            "Please choose another doctor 👇",
                            "Select Doctor",
                            [{
                                title: "Doctors",
                                rows: doctorsAll.map((d: any) => ({
                                    id: `doc_${d.id}`,
                                    title: d.name,
                                    description: d.department
                                }))
                            }]
                        );
                        return NextResponse.json({ status: 'ok' });
                    }

                    // Show available dates (original flow)
                    const uniqueDates: string[] = Array.from(new Set<string>(allSlotsForDoc.map((s: any) =>
                        new Date(s.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                    ))).slice(0, 3);

                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'DATE_SELECTION',
                            data: JSON.stringify({ ...currentData, doctorId: selectedDoctor.id, doctorName: selectedDoctor.name })
                        },
                    });

                    await sendWhatsAppList(
                        from,
                        `Please select a date for your appointment with ${selectedDoctor.name} 👇`,
                        "Select Date",
                        [{
                            title: "Available Dates",
                            rows: uniqueDates.map((date, idx) => ({
                                id: `date_${idx}`,
                                title: date
                            }))
                        }]
                    );
                } else {
                    console.log(`[Webhook] No doctor matched "${text}". Resending list.`);
                    const doctorsAllList = await prisma.doctor.findMany({ where: { active: true } });

                    if (doctorsAllList.length > 10) {
                        const departments = await prisma.department.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } });
                        await prisma.session.update({
                            where: { phone: from },
                            data: { currentStep: 'DEPARTMENT_SELECTION' },
                        });

                        await sendWhatsAppList(
                            from,
                            "I couldn't find that doctor. Please choose a department first 👇",
                            "Select Department",
                            [{
                                title: "Departments",
                                rows: departments.map((dept: any) => ({
                                    id: `dept_${dept.id}`,
                                    title: dept.name,
                                    description: dept.description?.slice(0, 72)
                                }))
                            }]
                        );
                    } else {
                        await sendWhatsAppList(
                            from,
                            "I couldn't find that doctor. Please choose from the list 👇",
                            "Select Doctor",
                            [{
                                title: "Available Doctors",
                                rows: doctorsAllList.map((d: any) => ({
                                    id: `doc_${d.id}`,
                                    title: d.name,
                                    description: d.department
                                }))
                            }]
                        );
                    }
                }
                break;
            }


            case 'TIME_REQUEST': {
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

                    await sendWhatsAppList(
                        from,
                        `Please select a date for your appointment with ${doctorName} 👇`,
                        "Select Date",
                        [{
                            title: "Available Dates",
                            rows: uniqueDates.map((date, idx) => ({
                                id: `date_${idx}`,
                                title: date
                            }))
                        }]
                    );
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
            }

            case 'ALTERNATIVE_SELECTION': {
                const slotIndex = parseInt(text.trim()) - 1;
                const altSlots = currentData.alternativeSlots || [];

                if (slotIndex >= 0 && slotIndex < altSlots.length) {
                    const selectedSlotId = altSlots[slotIndex];
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
            }

            case 'TIME_SELECTION': {
                // User selected a time from the available slots shown
                const selectTimeText = text.trim();
                const slotsData = currentData.availableSlots || [];

                // Find the slot that matches the selected time
                const matchedSltShortcut = slotsData.find((slot: any) => {
                    const slotTime = new Date(slot.startTime);
                    const tStr = slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    return tStr === selectTimeText;
                });

                if (matchedSltShortcut) {
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'COLLECT_NAME',
                            data: JSON.stringify({ ...currentData, availabilityId: matchedSltShortcut.id })
                        },
                    });
                    await sendWhatsAppMessage(from, `✅ Great! Your appointment is set for ${formatAppointmentTime(matchedSltShortcut.startTime)}.\n\nPlease enter the Patient's Name:`);
                } else {
                    await sendWhatsAppMessage(from, "Please select one of the available time slots.");
                }
                break;
            }

            case 'DATE_SELECTION': {
                const selDate = text;
                const docIdForSlots = currentData.doctorId;
                console.log(`[Webhook] Date selected: ${selDate} for Dr ID: ${docIdForSlots}`);

                const slotsAll = await prisma.availability.findMany({
                    where: {
                        doctorId: docIdForSlots,
                        isBooked: false,
                        startTime: { gte: new Date() }
                    },
                    orderBy: { startTime: 'asc' }
                });

                // Filter slots that match the selected date string
                const filteredSlots = slotsAll.filter((s: any) =>
                    new Date(s.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === selDate
                );

                if (filteredSlots.length === 0) {
                    await sendWhatsAppMessage(from, "Sorry, no slots available for that date. Please choose another date.");
                    return NextResponse.json({ status: 'ok' });
                }

                await prisma.session.update({
                    where: { phone: from },
                    data: {
                        currentStep: 'AVAILABILITY_SELECTION',
                        data: JSON.stringify({ ...currentData, selectedDate: selDate, availableSlots: filteredSlots.map((s: any) => ({ id: s.id, startTime: s.startTime })) })
                    },
                });

                await sendWhatsAppList(
                    from,
                    `Available slots on ${selDate} 👇`,
                    "Select Time",
                    [{
                        title: "Time Slots",
                        rows: filteredSlots.map((s: any, idx: number) => ({
                            id: `slot_${idx}`,
                            title: new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
                        }))
                    }]
                );
                break;
            }

            case 'AVAILABILITY_SELECTION': {
                const doctorIdSel = currentData.doctorId;
                const selectedDateStr = currentData.selectedDate;
                const avSlotsData = currentData.availableSlots || [];

                // Handle selection
                const selTimeText = text.trim();

                // Find the slot that matches the selected time
                const matchedSlt = avSlotsData.find((slot: any) => {
                    const slotTime = new Date(slot.startTime);
                    const timeStr = slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    return timeStr === selTimeText;
                });

                if (matchedSlt) {
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'COLLECT_NAME',
                            data: JSON.stringify({ ...currentData, availabilityId: matchedSlt.id })
                        },
                    });
                    await sendWhatsAppMessage(from, `✅ Great! Your appointment is set for ${formatAppointmentTime(matchedSlt.startTime)}.\n\nPlease enter the Patient's Name:`);
                } else {
                    // Always use the list format for consistency if selection is invalid or first time entering
                    await sendWhatsAppList(
                        from,
                        `All available slots for on ${selectedDateStr} 👇`,
                        "Select Time",
                        [{
                            title: "Time Slots",
                            rows: avSlotsData.slice(0, 10).map((slot: any, idx: number) => {
                                const time = new Date(slot.startTime);
                                return {
                                    id: `slot_${idx}`,
                                    title: time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                };
                            })
                        }]
                    );
                }
                break;
            }

            case 'COLLECT_NAME': {
                await prisma.session.update({
                    where: { phone: from },
                    data: {
                        currentStep: 'COLLECT_AGE',
                        data: JSON.stringify({ ...currentData, patientName: text })
                    },
                });
                await sendWhatsAppMessage(from, `Got it. What is ${text}'s age?`);
                break;
            }

            case 'COLLECT_AGE': {
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
            }

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
