import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWhatsAppMessage, sendWhatsAppButtons, sendWhatsAppList } from '@/lib/whatsapp';
import { getAIResponse } from '@/lib/groq';
import { parseNaturalTime, parseRelativeTime, containsTimeRequest, formatAppointmentTime } from '@/lib/timeParser';
import { findBestSlots, formatSlotMatches, getDoctorsWithSlotsOnDate } from '@/lib/slotMatcher';

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
        let interactiveId = "";
        if (message.type === 'text') {
            text = message.text.body;
        } else if (message.type === 'interactive') {
            text = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
            interactiveId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "";
        }
        console.log(`[Webhook] Extracted Text: "${text}", ID: "${interactiveId}"`);

        let session = await prisma.session.findUnique({
            where: { phone: from },
        });

        // 1. CHECK FOR ACTIVE TICKET (Escalation Mode) - ORIGINALITY PRESERVED
        const activeTicket = await prisma.supportTicket.findFirst({
            where: { phone: from, status: 'OPEN' }
        });

        if (activeTicket) {
            // Special case: If user clicks "Book Appointment" button, close ticket and start booking
            if (text === 'Book Appointment') {
                console.log(`[Webhook] User clicked Book Appointment during active ticket. Closing ticket and starting booking flow.`);
                await prisma.supportTicket.update({
                    where: { id: activeTicket.id },
                    data: { status: 'RESOLVED' }
                });
                // Delete session to start fresh
                if (session) {
                    await prisma.session.delete({ where: { phone: from } });
                }
                // Create new session for booking
                session = await prisma.session.create({
                    data: { phone: from, currentStep: 'CHAT', data: '{}' },
                });
                await sendWhatsAppMessage(from, "Hello 👍 Welcome to CarePlus Clinic. How can I help you today?");
                return NextResponse.json({ status: 'ok' });
            }

            console.log(`[Webhook] Active ticket found for ${from}. Appending message.`);
            await prisma.ticketMessage.create({
                data: {
                    ticketId: activeTicket.id,
                    sender: 'USER',
                    content: text
                }
            });
            return NextResponse.json({ status: 'ok' });
        }

        // 2. MESSAGE-FIRST: Greeting or reset always resets to CHAT and sends welcome (human-like)
        const cleanText = text.toLowerCase().trim();
        const GREETING_OR_RESET = /^(hi|hello|hey|hai|hlw|hlo|vanakkam|namaskaram|menu|reset|start|restart|0)$/i;

        if (GREETING_OR_RESET.test(cleanText)) {
            console.log(`[Webhook] Greeting/reset triggered for ${from}, resetting to CHAT`);
            if (session) {
                await prisma.session.delete({ where: { phone: from } });
            }
            session = await prisma.session.create({
                data: { phone: from, currentStep: 'CHAT', data: '{}' },
            });
            await sendWhatsAppMessage(from, "Hello 👍 Welcome to CarePlus Clinic. How can I help you today?");
            return NextResponse.json({ status: 'ok' });
        }

        if (!session) {
            console.log(`[Webhook] New session for ${from}`);
            session = await prisma.session.create({
                data: {
                    phone: from,
                    currentStep: 'CHAT',
                    data: '{}',
                },
            });
            await sendWhatsAppMessage(from, "Hello 👍 Welcome to CarePlus Clinic. How can I help you today?");
            return NextResponse.json({ status: 'ok' });
        }

        const currentData = JSON.parse(session.data || '{}');

        // Helper to handle doctor selection (shared between menu shortcut and explicit selection)
        const handleDoctorSelection = async (from: string, text: string, interactiveId: string, selectedDoctor: any, currentData: any) => {
            console.log(`[Webhook] Processing selection for doctor: ${selectedDoctor.name}`);

            // Check if user mentioned a date/time in the same message (e.g., "book tomorrow for dr anil")
            const parsedTimeInMessage = containsTimeRequest(text) ? parseNaturalTime(text) : null;

            if (parsedTimeInMessage) {
                console.log(`[Webhook] Detected date in shortcut: ${parsedTimeInMessage.date}, Time Certain: ${parsedTimeInMessage.isTimeCertain}`);

                // CASE 1: Date matched but NO specific time (e.g., "book tomorrow with dr anil")
                // Action: Show slots for that specific date
                if (!parsedTimeInMessage.isTimeCertain) {
                    const startOfDay = new Date(parsedTimeInMessage.date);
                    startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(parsedTimeInMessage.date);
                    endOfDay.setHours(23, 59, 59, 999);

                    const slotsForDate = await prisma.availability.findMany({
                        where: {
                            doctorId: selectedDoctor.id,
                            isBooked: false,
                            startTime: {
                                gte: startOfDay,
                                lte: endOfDay
                            }
                        },
                        orderBy: { startTime: 'asc' }
                    });

                    if (slotsForDate.length > 0) {
                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'TIME_SELECTION', // Skip DATE_SELECTION
                                data: JSON.stringify({ ...currentData, doctorId: selectedDoctor.id, doctorName: selectedDoctor.name, selectedDate: parsedTimeInMessage.date })
                            },
                        });

                        await sendWhatsAppList(
                            from,
                            `Here are the available slots for ${selectedDoctor.name} on ${startOfDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} 👇`,
                            "Select Time",
                            [{
                                title: "Available Slots",
                                rows: slotsForDate.slice(0, 10).map((slot: any) => ({
                                    id: `slot_${slot.id}`,
                                    title: slot.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                }))
                            }]
                        );
                        return NextResponse.json({ status: 'ok' });
                    } else {
                        // No slots on that specific date, fall back to showing all available dates
                        await sendWhatsAppMessage(from, `Sorry, ${selectedDoctor.name} has no available slots on ${startOfDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.`);
                        // Let it fall through to show all dates below
                    }
                }

                // CASE 2: Specific time requested (e.g., "book tomorrow at 4pm")
                else {
                    const requestedDate = parsedTimeInMessage.date;
                    const matches = await findBestSlots(selectedDoctor.id, requestedDate);

                    if (matches.length > 0 && matches[0].matchType === 'exact') {
                        // Exact match found - proceed directly to booking
                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'COLLECT_NAME',
                                data: JSON.stringify({ ...currentData, doctorId: selectedDoctor.id, doctorName: selectedDoctor.name, availabilityId: matches[0].slot.id })
                            },
                        });
                        await sendWhatsAppMessage(from, `✅ Perfect! ${formatAppointmentTime(matches[0].slot.startTime)} is available with ${selectedDoctor.name}.\n\nPlease enter the Patient's Name:`);
                        return NextResponse.json({ status: 'ok' });
                    } else {
                        // No exact match or only alternatives
                        const alternatives = matches; // findBestSlots returns alternatives if no exact match

                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'ALTERNATIVE_SELECTION',
                                data: JSON.stringify({
                                    ...currentData,
                                    doctorId: selectedDoctor.id,
                                    doctorName: selectedDoctor.name,
                                    alternativeSlots: alternatives.map(m => ({ id: m.slot.id, startTime: m.slot.startTime }))
                                })
                            },
                        });

                        await sendWhatsAppList(
                            from,
                            `Sorry, ${formatAppointmentTime(requestedDate)} is not available with ${selectedDoctor.name}. 👇`,
                            "Select Alternative",
                            [{
                                title: "Alternative Slots",
                                rows: alternatives.slice(0, 10).map((m, idx) => ({
                                    id: `alt_${idx}`,
                                    title: new Date(m.slot.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                                    description: new Date(m.slot.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                                }))
                            }]
                        );
                        return NextResponse.json({ status: 'ok' });
                    }
                }
            }

            // Use selectedDate from context (e.g. from "tomorrow available?" flow) when no date in message
            const prefilledDate = currentData.selectedDate ? new Date(currentData.selectedDate) : null;
            if (prefilledDate && !isNaN(prefilledDate.getTime())) {
                const startOfDay = new Date(prefilledDate);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDayDate = new Date(prefilledDate);
                endOfDayDate.setHours(23, 59, 59, 999);

                const slotsForDate = await prisma.availability.findMany({
                    where: {
                        doctorId: selectedDoctor.id,
                        isBooked: false,
                        startTime: {
                            gte: startOfDay,
                            lte: endOfDayDate
                        }
                    },
                    orderBy: { startTime: 'asc' }
                });

                if (slotsForDate.length > 0) {
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'TIME_SELECTION',
                            data: JSON.stringify({ ...currentData, doctorId: selectedDoctor.id, doctorName: selectedDoctor.name, selectedDate: prefilledDate })
                        },
                    });

                    await sendWhatsAppList(
                        from,
                        `Here are the available slots for ${selectedDoctor.name} on ${startOfDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} 👇`,
                        "Select Time",
                        [{
                            title: "Available Slots",
                            rows: slotsForDate.slice(0, 10).map((slot: any) => ({
                                id: `slot_${slot.id}`,
                                title: slot.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                            }))
                        }]
                    );
                    return NextResponse.json({ status: 'ok' });
                }
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
                await prisma.session.update({
                    where: { phone: from },
                    data: { currentStep: 'CHAT', data: '{}' },
                });
                await sendWhatsAppMessage(from, `Sorry, ${selectedDoctor.name} has no available slots at the moment. You can ask for another doctor or day, or say Hi to start over.`);
                return NextResponse.json({ status: 'ok' });
            }

            // Show available dates
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
            return NextResponse.json({ status: 'ok' });
        };

        // --- GLOBAL SHORTCUTS ---
        // If a known doctor is mentioned, bypass current step and jump to doctor selection
        if (session.currentStep !== 'COLLECT_NAME' && session.currentStep !== 'COLLECT_AGE' && text.length > 3) {
            const allDoctors = await prisma.doctor.findMany({ where: { active: true } });

            // Normalize text and doctor names for comparison
            // "Dr. Kevin" -> "kevin", "Dr Kevin" -> "kevin", "Kevin" -> "kevin"
            const cleanInput = text.toLowerCase().replace(/dr\.?\s*/g, '');

            const matchedDoctor = allDoctors.find(d => {
                const cleanDocName = d.name.toLowerCase().replace(/dr\.?\s*/g, '');
                // Split doctor name into parts (e.g. "kevin taylor" -> ["kevin", "taylor"])
                const nameParts = cleanDocName.split(' ').filter(part => part.length > 2);

                // Check if ANY significant part of the name is in the input as a whole word
                return nameParts.some(part => {
                    const regex = new RegExp(`\\b${part}\\b`, 'i');
                    return regex.test(cleanInput);
                });
            });

            if (matchedDoctor) {
                console.log(`[Webhook] Global Shortcut: Doctor "${matchedDoctor.name}" detected in message "${text}"`);
                return await handleDoctorSelection(from, text, `doc_${matchedDoctor.id}`, matchedDoctor, currentData);
            }
        }

        switch (session.currentStep) {
            case 'REMINDER_REPLY': {
                const appointmentId = currentData.appointmentId;
                if (text.trim() === '1' && appointmentId) {
                    await prisma.session.update({
                        where: { phone: from },
                        data: { currentStep: 'CHAT', data: '{}' },
                    });
                    await sendWhatsAppMessage(from, "Perfect 👍 See you tomorrow!");
                } else if (text.trim() === '2' && appointmentId) {
                    const apt = await prisma.appointment.findUnique({
                        where: { id: appointmentId },
                        select: { availabilityId: true },
                    });
                    if (apt) {
                        await prisma.appointment.update({
                            where: { id: appointmentId },
                            data: { status: 'Cancelled' },
                        });
                        await prisma.availability.update({
                            where: { id: apt.availabilityId },
                            data: { isBooked: false },
                        });
                    }
                    await prisma.session.update({
                        where: { phone: from },
                        data: { currentStep: 'CHAT', data: '{}' },
                    });
                    await sendWhatsAppMessage(from, "No problem. Say when you'd like to reschedule, or ask for available doctors to book a new slot.");
                } else {
                    await sendWhatsAppMessage(from, "Please reply 1 to confirm or 2 to reschedule.");
                }
                break;
            }

            case 'CHAT': {
                const isGreeting = /^(hi|hello|hey|vanakkam|namaskaram|hai|hlw|hlo)$/i.test(cleanText) || cleanText === 'hi' || cleanText === 'hello';
                if (isGreeting) {
                    await sendWhatsAppMessage(from, "Hello 👍 Welcome to CarePlus Clinic. How can I help you today?");
                    break;
                }

                const isAvailabilityForDate = /\b(tomorrow|today)\b.*\b(available|open|free|slot|who)\b|\b(available|open|free|who).*(tomorrow|today)\b|(tomorrow|today)\s*(available|open)?\s*\??/i.test(cleanText) ||
                    /(available|open|slot).*(tomorrow|today)/i.test(cleanText);
                let availabilityDate: Date | null = null;
                if (isAvailabilityForDate) {
                    availabilityDate = parseRelativeTime(text) || (parseNaturalTime(text)?.date ?? null);
                }
                if (availabilityDate && !isNaN(availabilityDate.getTime())) {
                    const doctorsOnDate = await getDoctorsWithSlotsOnDate(availabilityDate);
                    const dateStr = availabilityDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    if (doctorsOnDate.length === 0) {
                        await sendWhatsAppMessage(from, `Sorry, no doctors have available slots on ${dateStr}. Would you like to check another day?`);
                    } else {
                        const names = doctorsOnDate.map(d => `Dr. ${d.name}`).join(', ');
                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'AVAILABILITY_SHOWN',
                                data: JSON.stringify({ selectedDate: availabilityDate.toISOString() }),
                            },
                        });
                        await sendWhatsAppMessage(from, `${names} ${doctorsOnDate.length === 1 ? 'is' : 'are'} available on ${dateStr}. Which doctor would you like to book?`);
                    }
                    break;
                }

                const isBookIntent = /\b(book|appointment|consult)\b/i.test(cleanText);
                if (isBookIntent) {
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });
                    const mentionedDoctor = doctors.find(d => {
                        const cleanDocName = d.name.toLowerCase().replace(/dr\.?\s*/g, '');
                        const nameParts = cleanDocName.split(' ').filter(part => part.length > 2);
                        return nameParts.some(part => new RegExp(`\\b${part}\\b`, 'i').test(cleanText));
                    });
                    if (mentionedDoctor) {
                        return await handleDoctorSelection(from, text, `doc_${mentionedDoctor.id}`, mentionedDoctor, currentData);
                    }
                    const allDepartments = await prisma.department.findMany({ where: { active: true } });
                    let mentionedDept = allDepartments.find(d => new RegExp(`\\b${d.name.toLowerCase()}\\b`).test(cleanText));
                    if (!mentionedDept) {
                        if (/\bgeneral\b/i.test(cleanText)) mentionedDept = allDepartments.find(d => d.name.toLowerCase().includes('general'));
                        if (!mentionedDept && /\bskin\b/i.test(cleanText)) mentionedDept = allDepartments.find(d => d.name.toLowerCase().includes('dermatology') || d.name.toLowerCase().includes('skin'));
                    }
                    if (mentionedDept) {
                        const doctorsInDept = await prisma.doctor.findMany({ where: { department: mentionedDept.name, active: true } });
                        if (doctorsInDept.length === 1) {
                            const doc = doctorsInDept[0];
                            await prisma.session.update({
                                where: { phone: from },
                                data: {
                                    currentStep: 'MORNING_EVENING_CHOICE',
                                    data: JSON.stringify({
                                        doctorId: doc.id,
                                        doctorName: doc.name,
                                        selectedDepartment: mentionedDept.name,
                                        selectedDate: new Date().toISOString(),
                                    }),
                                },
                            });
                            const displayName = doc.name.startsWith('Dr') ? doc.name : `Dr. ${doc.name}`;
                            await sendWhatsAppMessage(from, `${displayName} is available today. Morning or evening?`);
                        } else {
                            await prisma.session.update({
                                where: { phone: from },
                                data: {
                                    currentStep: 'DOCTOR_SELECTION',
                                    data: JSON.stringify({ ...currentData, selectedDepartment: mentionedDept.name }),
                                },
                            });
                            await sendWhatsAppList(from, `Available doctors in ${mentionedDept.name} 👇`, "Select Doctor", [{
                                title: mentionedDept.name,
                                rows: doctorsInDept.slice(0, 10).map((d: any) => ({ id: `doc_${d.id}`, title: d.name, description: d.specialization || d.department }))
                            }]);
                        }
                        break;
                    }
                    const departmentsList = await prisma.department.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } });
                    await prisma.session.update({ where: { phone: from }, data: { currentStep: 'DEPARTMENT_SELECTION' } });
                    const bookNowPhrasing = /\b(book\s+now|can i book|can i get an appointment)\b/i.test(cleanText);
                    await sendWhatsAppList(from, bookNowPhrasing ? "Of course 👍 Which doctor do you need?" : "Sure 👍 Which doctor would you like to consult?", "Select Department", [{
                        title: "Departments",
                        rows: departmentsList.slice(0, 10).map((dept: any) => ({ id: `dept_${dept.id}`, title: dept.name, description: dept.description?.slice(0, 72) }))
                    }]);
                    break;
                }

                const aiReply = await getAIResponse(text, undefined, session.language);
                if (aiReply.trim() === 'UNKNOWN_QUERY') {
                    await prisma.supportTicket.create({
                        data: { phone: from, query: text, status: 'OPEN', messages: { create: { sender: 'USER', content: text } } },
                    });
                    await sendWhatsAppButtons(from, "Sorry, I don't have the answer to that. I am connecting you to our team and they will reply shortly. 👨‍💻", ["Book Appointment"]);
                } else {
                    const showBookButton = /\b(book|appointment|available|slot|doctor|consult)\b/i.test(cleanText);
                    if (showBookButton) await sendWhatsAppButtons(from, aiReply, ["Book Appointment"]);
                    else await sendWhatsAppMessage(from, aiReply);
                }
                break;
            }

            case 'AVAILABILITY_SHOWN': {
                const doctors = await prisma.doctor.findMany({ where: { active: true } });
                const mentionedDoctor = doctors.find(d => {
                    const cleanDocName = d.name.toLowerCase().replace(/dr\.?\s*/g, '');
                    const nameParts = cleanDocName.split(' ').filter(part => part.length > 2);
                    return nameParts.some(part => new RegExp(`\\b${part}\\b`, 'i').test(cleanText));
                });
                if (mentionedDoctor) {
                    return await handleDoctorSelection(from, text, `doc_${mentionedDoctor.id}`, mentionedDoctor, currentData);
                }
                if (/\b(book|yes|ok)\b/i.test(cleanText)) {
                    await sendWhatsAppMessage(from, "Which doctor would you like to book? Please type the doctor's name (e.g. Dr. Rahul).");
                } else {
                    const aiReply = await getAIResponse(text, undefined, session.language);
                    if (aiReply.trim() === 'UNKNOWN_QUERY') {
                        await sendWhatsAppMessage(from, "Which doctor would you like to book? Please type the doctor's name.");
                    } else {
                        const showBookButton = /\b(book|appointment|available|slot|doctor|consult)\b/i.test(cleanText);
                        if (showBookButton) await sendWhatsAppButtons(from, aiReply, ["Book Appointment"]);
                        else await sendWhatsAppMessage(from, aiReply);
                    }
                }
                break;
            }

            case 'LANGUAGE_SELECTION':
            case 'MAIN_MENU':
            case 'KNOWLEDGE_QUERY': {
                await prisma.session.update({
                    where: { phone: from },
                    data: { currentStep: 'CHAT', data: '{}' },
                });
                await sendWhatsAppMessage(from, "Hello 👍 Welcome to CarePlus Clinic. How can I help you today?");
                break;
            }

            case 'MORNING_EVENING_CHOICE': {
                const choice = cleanText.replace(/\s+/g, ' ');
                const isEvening = /\bevening\b|eve\b|afternoon\b/i.test(choice);
                const isMorning = /\bmorning\b|morn\b|am\b/i.test(choice);
                if (!isMorning && !isEvening) {
                    await sendWhatsAppMessage(from, "Please reply with Morning or Evening.");
                    break;
                }
                const doctorId = currentData.doctorId;
                const doctorName = currentData.doctorName;
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date();
                todayEnd.setHours(23, 59, 59, 999);
                const slots = await prisma.availability.findMany({
                    where: {
                        doctorId,
                        isBooked: false,
                        startTime: { gte: todayStart, lte: todayEnd },
                    },
                    orderBy: { startTime: 'asc' },
                });
                const filtered = isMorning
                    ? slots.filter((s: any) => new Date(s.startTime).getHours() < 12)
                    : slots.filter((s: any) => new Date(s.startTime).getHours() >= 12);
                if (filtered.length === 0) {
                    await sendWhatsAppMessage(from, `Sorry, no ${isMorning ? 'morning' : 'evening'} slots available today. Would you like to pick another day?`);
                    break;
                }
                const timeStrs = filtered.slice(0, 10).map((s: any) =>
                    new Date(s.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                );
                await prisma.session.update({
                    where: { phone: from },
                    data: {
                        currentStep: 'TIME_SELECTION',
                        data: JSON.stringify({
                            ...currentData,
                            selectedDate: currentData.selectedDate,
                            availableSlots: filtered.map((s: any) => ({ id: s.id, startTime: s.startTime })),
                        }),
                    },
                });
                await sendWhatsAppMessage(from, `Available slots: ${timeStrs.join(', ')}`);
                break;
            }

            case 'DEPARTMENT_SELECTION': {
                console.log(`[Webhook] Department selection input - Text: "${text}", ID: "${interactiveId}"`);

                // SHORTCUT: Check if input is actually a DOCTOR's name (e.g. "Book dr kevin")
                if (!interactiveId.startsWith('dept_')) {
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });
                    const mentionedDoctor = doctors.find(d => text.toLowerCase().includes(d.name.toLowerCase()));

                    if (mentionedDoctor) {
                        console.log(`[Webhook] Shortcut: Doctor "${mentionedDoctor.name}" detected in DEPARTMENT_SELECTION`);
                        return await handleDoctorSelection(from, text, `doc_${mentionedDoctor.id}`, mentionedDoctor, currentData);
                    }
                }

                let selectedDeptName = "";

                if (interactiveId.startsWith('dept_')) {
                    const deptId = interactiveId.replace('dept_', '');
                    const dept = await prisma.department.findUnique({ where: { id: deptId } });
                    if (dept) selectedDeptName = dept.name;
                } else {
                    // Fuzzy match logic for text input
                    const allDepartments = await prisma.department.findMany({ where: { active: true } });

                    // 1. Direct match (case-insensitive)
                    let matchedDept = allDepartments.find(d => d.name.toLowerCase() === text.toLowerCase());

                    // 2. Keyword match (e.g., "ent", "general", "skin")
                    if (!matchedDept) {
                        const input = text.toLowerCase();
                        if (input.includes('general')) matchedDept = allDepartments.find(d => d.name.toLowerCase().includes('general'));
                        if (!matchedDept && (input.includes('skin') || input.includes('derma'))) matchedDept = allDepartments.find(d => d.name.toLowerCase().includes('dermatology') || d.name.toLowerCase().includes('skin'));
                        if (!matchedDept) {
                            matchedDept = allDepartments.find(d => {
                                const deptName = d.name.toLowerCase();
                                if (deptName.includes(input)) return true;
                                if (input === 'ent' && (deptName.includes('ear') || deptName.includes('ent'))) return true;
                                if (input === 'cardio' && deptName.includes('cardiology')) return true;
                                if (input === 'ortho' && deptName.includes('orthopedics')) return true;
                                if (input === 'derma' && deptName.includes('dermatology')) return true;
                                if (input === 'pedia' && deptName.includes('pediatrics')) return true;
                                return false;
                            });
                        }
                    }

                    if (matchedDept) {
                        selectedDeptName = matchedDept.name;
                    }
                }

                if (!selectedDeptName) {
                    console.log(`[Webhook] No department matched for "${text}"`);
                    const looksLikeQuestion = text.includes('?') || text.length > 40 || /\b(innu|eathokke|drs?|indu|doctor|available|today|tomorrow)\b/i.test(cleanText);
                    if (looksLikeQuestion && !interactiveId.startsWith('dept_')) {
                        await prisma.session.update({
                            where: { phone: from },
                            data: { currentStep: 'CHAT', data: '{}' },
                        });
                        const aiReply = await getAIResponse(text, undefined, session.language);
                        if (aiReply.trim() === 'UNKNOWN_QUERY') {
                            await prisma.supportTicket.create({
                                data: { phone: from, query: text, status: 'OPEN', messages: { create: { sender: 'USER', content: text } } },
                            });
                            await sendWhatsAppButtons(from, "Sorry, I don't have the answer to that. I am connecting you to our team. 👨‍💻", ["Book Appointment"]);
                        } else {
                            const showBookButton = /\b(book|appointment|available|slot|doctor|consult)\b/i.test(cleanText);
                            if (showBookButton) await sendWhatsAppButtons(from, aiReply, ["Book Appointment"]);
                            else await sendWhatsAppMessage(from, aiReply);
                        }
                        return NextResponse.json({ status: 'ok' });
                    }
                    const departmentsAll = await prisma.department.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } });
                    await sendWhatsAppList(
                        from,
                        `I couldn't find a department matching "${text}". Please select from the list 👇`,
                        "Select Department",
                        [{
                            title: "Departments",
                            rows: departmentsAll.slice(0, 10).map((dept: any) => ({
                                id: `dept_${dept.id}`,
                                title: dept.name,
                                description: dept.description?.slice(0, 72)
                            }))
                        }]
                    );
                    return NextResponse.json({ status: 'ok' });
                }

                const doctorsInDept = await prisma.doctor.findMany({
                    where: { department: selectedDeptName, active: true }
                });

                if (doctorsInDept.length === 0) {
                    await sendWhatsAppMessage(from, `Sorry, no doctors are currently available in ${selectedDeptName}. Please try another department.`);
                    const departmentsAll = await prisma.department.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } });
                    await sendWhatsAppList(
                        from,
                        "Please choose a different department 👇",
                        "Select Department",
                        [{
                            title: "Departments",
                            rows: departmentsAll.slice(0, 10).map((dept: any) => ({
                                id: `dept_${dept.id}`,
                                title: dept.name,
                                description: dept.description?.slice(0, 72)
                            }))
                        }]
                    );
                    return NextResponse.json({ status: 'ok' });
                }

                if (doctorsInDept.length === 1) {
                    const doc = doctorsInDept[0];
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'MORNING_EVENING_CHOICE',
                            data: JSON.stringify({
                                doctorId: doc.id,
                                doctorName: doc.name,
                                selectedDepartment: selectedDeptName,
                                selectedDate: new Date().toISOString(),
                            }),
                        },
                    });
                    const displayName = doc.name.startsWith('Dr') ? doc.name : `Dr. ${doc.name}`;
                    await sendWhatsAppMessage(from, `${displayName} is available today. Morning or evening?`);
                } else {
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'DOCTOR_SELECTION',
                            data: JSON.stringify({ ...currentData, selectedDepartment: selectedDeptName })
                        },
                    });
                    await sendWhatsAppList(
                        from,
                        `Available doctors in ${selectedDeptName} 👇`,
                        "Select Doctor",
                        [{
                            title: selectedDeptName,
                            rows: doctorsInDept.slice(0, 10).map((d: any) => ({
                                id: `doc_${d.id}`,
                                title: d.name,
                                description: d.specialization || d.department
                            }))
                        }]
                    );
                }
                break;
            }


            case 'DOCTOR_SELECTION': {
                console.log(`[Webhook] Doctor selection input - Text: "${text}", ID: "${interactiveId}"`);

                let selectedDoctor = null;
                if (interactiveId.startsWith('doc_')) {
                    const docId = interactiveId.replace('doc_', '');
                    selectedDoctor = await prisma.doctor.findUnique({ where: { id: docId } });
                } else {
                    selectedDoctor = await prisma.doctor.findFirst({
                        where: { name: { contains: text, mode: 'insensitive' } }
                    });
                }

                if (selectedDoctor) {
                    return await handleDoctorSelection(from, text, interactiveId, selectedDoctor, currentData);
                } else {
                    console.log(`[Webhook] No doctor matched "${text}".`);
                    const looksLikeQuestion = text.includes('?') || text.length > 40 || /\b(innu|eathokke|drs?|indu|doctor|available|today|tomorrow)\b/i.test(cleanText);
                    if (looksLikeQuestion && !interactiveId.startsWith('doc_')) {
                        await prisma.session.update({
                            where: { phone: from },
                            data: { currentStep: 'CHAT', data: '{}' },
                        });
                        const aiReply = await getAIResponse(text, undefined, session.language);
                        if (aiReply.trim() === 'UNKNOWN_QUERY') {
                            await prisma.supportTicket.create({
                                data: { phone: from, query: text, status: 'OPEN', messages: { create: { sender: 'USER', content: text } } },
                            });
                            await sendWhatsAppButtons(from, "Sorry, I don't have the answer to that. I am connecting you to our team. 👨‍💻", ["Book Appointment"]);
                        } else {
                            const showBookButton = /\b(book|appointment|available|slot|doctor|consult)\b/i.test(cleanText);
                            if (showBookButton) await sendWhatsAppButtons(from, aiReply, ["Book Appointment"]);
                            else await sendWhatsAppMessage(from, aiReply);
                        }
                        break;
                    }
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
                                rows: departments.slice(0, 10).map((dept: any) => ({
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
                                rows: doctorsAllList.slice(0, 10).map((d: any) => ({
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
                    // Try to parse time from text
                    const parsed = parseNaturalTime(text);
                    if (parsed) {
                        const matches = await findBestSlots(doctorId, parsed.date);
                        if (matches.length > 0 && matches[0].matchType === 'exact') {
                            await prisma.session.update({
                                where: { phone: from },
                                data: {
                                    currentStep: 'COLLECT_NAME',
                                    data: JSON.stringify({ ...currentData, availabilityId: matches[0].slot.id })
                                },
                            });
                            await sendWhatsAppMessage(from, `✅ Perfect! ${formatAppointmentTime(matches[0].slot.startTime)} is available.\n\nPlease enter the Patient's Name:`);
                        } else {
                            // Show alternatives via List UI
                            const alternatives = matches;
                            await prisma.session.update({
                                where: { phone: from },
                                data: {
                                    currentStep: 'ALTERNATIVE_SELECTION',
                                    data: JSON.stringify({
                                        ...currentData,
                                        alternativeSlots: alternatives.map(m => ({ id: m.slot.id, startTime: m.slot.startTime }))
                                    })
                                },
                            });

                            await sendWhatsAppList(
                                from,
                                `Sorry, ${formatAppointmentTime(parsed.date)} is not available. 👇`,
                                "Select Alternative",
                                [{
                                    title: "Alternative Slots",
                                    rows: alternatives.slice(0, 10).map((m, idx) => ({
                                        id: `alt_${idx}`,
                                        title: new Date(m.slot.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                                        description: new Date(m.slot.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                                    }))
                                }]
                            );
                        }
                    } else {
                        await sendWhatsAppMessage(from, "I couldn't understand that time. You can say things like 'tomorrow 3pm' or 'next monday morning'.");
                    }
                }
                break;
            }

            case 'ALTERNATIVE_SELECTION': {
                console.log(`[Webhook] Alternative selection input - Text: "${text}", ID: "${interactiveId}"`);
                const altSlots = currentData.alternativeSlots || [];
                let selectedSlot = null;

                if (interactiveId.startsWith('alt_')) {
                    const idx = parseInt(interactiveId.replace('alt_', ''));
                    selectedSlot = altSlots[idx];
                } else {
                    // Fallback to numeric or text matching
                    const slotIndex = parseInt(text.trim()) - 1;
                    if (slotIndex >= 0 && slotIndex < altSlots.length) {
                        selectedSlot = altSlots[slotIndex];
                    }
                }

                if (selectedSlot) {
                    await prisma.session.update({
                        where: { phone: from },
                        data: {
                            currentStep: 'COLLECT_NAME',
                            data: JSON.stringify({ ...currentData, availabilityId: selectedSlot.id })
                        },
                    });
                    await sendWhatsAppMessage(from, "Great! Please enter the Patient's Name:");
                } else {
                    await sendWhatsAppMessage(from, "Please select one of the alternative time slots.");
                }
                break;
            }

            case 'TIME_SELECTION': {
                // User selected a time from the available slots shown
                let selectTimeText = text.trim().toLowerCase();
                const slotsData = currentData.availableSlots || [];

                // Normalize "530", "615", "5:30" etc. to "5:30 PM" form for matching
                const normalizeTimeInput = (raw: string): string | null => {
                    const s = raw.replace(/\s/g, '');
                    let h: number; let min: number; let pm = true;
                    const fourDigit = s.match(/^(\d{1,2})(\d{2})$/); // 530 -> 5, 30
                    if (fourDigit) {
                        h = parseInt(fourDigit[1], 10);
                        min = parseInt(fourDigit[2], 10);
                        if (h <= 12 && min < 60) pm = h <= 7; // 530 = 5:30 PM, 615 = 6:15 PM; 830 = 8:30 AM
                    } else {
                        const withColon = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
                        if (withColon) {
                            h = parseInt(withColon[1], 10);
                            min = parseInt(withColon[2], 10);
                            if (withColon[3]) pm = withColon[3].toLowerCase() === 'pm';
                        } else return null;
                    }
                    if (h <= 12 && pm && h !== 12) h += 12;
                    if (h === 12 && !pm) h = 0;
                    const d = new Date(); d.setHours(h, min, 0, 0);
                    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                };
                const normalizedInput = normalizeTimeInput(selectTimeText) || selectTimeText;

                let matchedSltShortcut = null;
                if (interactiveId.startsWith('slot_')) {
                    const slotIdx = parseInt(interactiveId.replace('slot_', ''));
                    matchedSltShortcut = slotsData[slotIdx];
                } else {
                    matchedSltShortcut = slotsData.find((slot: any) => {
                        const slotTime = new Date(slot.startTime);
                        const tStr = slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        return tStr === selectTimeText || tStr === normalizedInput;
                    });
                }

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
                        rows: filteredSlots.slice(0, 10).map((s: any, idx: number) => ({
                            id: `slot_${idx}`,
                            title: new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
                        }))
                    }]
                );
                break;
            }

            case 'AVAILABILITY_SELECTION': {
                const selectedDateStr = currentData.selectedDate;
                const avSlotsData = currentData.availableSlots || [];
                const selTimeText = text.trim();

                let matchedSlt = null;
                if (interactiveId.startsWith('slot_')) {
                    const slotIdx = parseInt(interactiveId.replace('slot_', ''));
                    matchedSlt = avSlotsData[slotIdx];
                } else {
                    // Fallback to text matching
                    matchedSlt = avSlotsData.find((slot: any) => {
                        const slotTime = new Date(slot.startTime);
                        const timeStr = slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        return timeStr === selTimeText;
                    });
                }

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
                    // Re-send list if no match
                    await sendWhatsAppList(
                        from,
                        `All available slots for on ${selectedDateStr} 👇`,
                        "Select Time",
                        [{
                            title: "Time Slots",
                            rows: avSlotsData.slice(0, 10).map((slot: any, idx: number) => ({
                                id: `slot_${idx}`,
                                title: new Date(slot.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                            }))
                        }]
                    );
                }
                break;
            }

            case 'COLLECT_NAME': {
                // Guard: Ignore interactive replies (like double-delivered button clicks from previous step)
                if (interactiveId || text.length < 2) {
                    console.log("[Webhook] Ignoring interactive/short input in COLLECT_NAME");
                    return NextResponse.json({ status: 'ok' });
                }

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
                // Guard: Ignore interactive replies
                if (interactiveId) {
                    return NextResponse.json({ status: 'ok' });
                }

                // Validate age is numeric
                const ageText = text.trim();
                const ageNum = parseInt(ageText);
                if (!/^\d+$/.test(ageText) || ageNum < 1 || ageNum > 99) {
                    await sendWhatsAppMessage(from, "❌ Invalid age format. Please enter a valid age (number only):");
                    return NextResponse.json({ status: 'ok' });
                }

                const finalAgeData = { ...currentData, patientAge: ageText };
                const doc = await prisma.doctor.findUnique({ where: { id: finalAgeData.doctorId } });
                const slot = await prisma.availability.findUnique({ where: { id: finalAgeData.availabilityId } });

                // Transition to confirmation step
                await prisma.session.update({
                    where: { phone: from },
                    data: {
                        currentStep: 'CONFIRM_BOOKING',
                        data: JSON.stringify(finalAgeData)
                    },
                });

                const summaryMsg = `📋 *Booking Summary*\n\nPatient: ${finalAgeData.patientName}\nAge: ${ageText}\nDoctor: ${doc?.name}\nDate: ${new Date(slot?.startTime!).toLocaleDateString()}\nTime: ${new Date(slot?.startTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}\n\nPlease confirm your booking 👇`;

                await sendWhatsAppButtons(from, summaryMsg, ["Confirm Booking", "Cancel"]);
                break;
            }

            case 'CONFIRM_BOOKING': {
                console.log(`[Webhook] Confirm booking input - Text: "${text}", ID: "${interactiveId}"`);

                if (text === 'Confirm Booking') {
                    const doc = await prisma.doctor.findUnique({ where: { id: currentData.doctorId } });
                    const slot = await prisma.availability.findUnique({ where: { id: currentData.availabilityId } });

                    await prisma.appointment.create({
                        data: {
                            doctorId: currentData.doctorId,
                            availabilityId: currentData.availabilityId,
                            patientName: currentData.patientName,
                            patientAge: currentData.patientAge,
                            patientPhone: from,
                        }
                    });

                    await prisma.availability.update({
                        where: { id: currentData.availabilityId },
                        data: { isBooked: true }
                    });

                    await prisma.session.delete({ where: { phone: from } });

                    await sendWhatsAppMessage(from, "Appointment confirmed. See you soon!");
                } else if (text === 'Cancel') {
                    await prisma.session.delete({ where: { phone: from } });
                    await sendWhatsAppButtons(from, "❌ Booking cancelled. You can start over by typing 'Hi' or click below.", ["Book Appointment"]);
                } else {
                    await sendWhatsAppButtons(from, "Please confirm or cancel your booking using the buttons below 👇", ["Confirm Booking", "Cancel"]);
                }
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
