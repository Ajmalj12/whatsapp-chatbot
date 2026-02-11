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

        // 2. GLOBAL RESET: Allow starting over at any time
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
                await sendWhatsAppMessage(from, `Sorry, ${selectedDoctor.name} has no available slots at the moment.`);
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
                if (text.includes('Book') || text.toLowerCase().includes('doctor') || text.toLowerCase().includes('find') || text.toLowerCase().includes('appointment')) {
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });

                    // Natural Language Shortcut: Check if a doctor is mentioned in the message
                    const mentionedDoctor = doctors.find(d => text.toLowerCase().includes(d.name.toLowerCase()));

                    if (mentionedDoctor) {
                        console.log(`[Webhook] Shortcut: Doctor "${mentionedDoctor.name}" detected in message`);
                        return await handleDoctorSelection(from, text, `doc_${mentionedDoctor.id}`, mentionedDoctor, currentData);
                    }

                    // Natural Language Shortcut: Check if a DEPARTMENT is mentioned
                    const allDepartments = await prisma.department.findMany({ where: { active: true } });
                    let mentionedDept = allDepartments.find(d => {
                        const deptName = d.name.toLowerCase();
                        const input = text.toLowerCase();
                        if (input.includes(deptName)) return true;
                        if (input.includes('ent') && (deptName.includes('ear') || deptName.includes('ent'))) return true;
                        if (input.includes('cardio') && deptName.includes('cardiology')) return true;
                        if (input.includes('ortho') && deptName.includes('orthopedics')) return true;
                        if (input.includes('derma') && deptName.includes('dermatology')) return true;
                        if (input.includes('pedia') && deptName.includes('pediatrics')) return true;
                        return false;
                    });

                    if (mentionedDept) {
                        console.log(`[Webhook] Shortcut: Department "${mentionedDept.name}" detected in message`);
                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'DOCTOR_SELECTION',
                                data: JSON.stringify({ ...currentData, selectedDepartment: mentionedDept.name })
                            },
                        });

                        const doctorsInDept = await prisma.doctor.findMany({
                            where: { department: mentionedDept.name, active: true }
                        });

                        await sendWhatsAppList(
                            from,
                            `Available doctors in ${mentionedDept.name} 👇`,
                            "Select Doctor",
                            [{
                                title: mentionedDept.name,
                                rows: doctorsInDept.slice(0, 10).map((d: any) => ({
                                    id: `doc_${d.id}`,
                                    title: d.name,
                                    description: d.specialization || d.department
                                }))
                            }]
                        );
                        return NextResponse.json({ status: 'ok' });
                    }

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
                                rows: departments.slice(0, 10).map((dept: any) => ({
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
                                rows: doctors.slice(0, 10).map((d: any) => ({
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
                if (text.toLowerCase().includes('book') ||
                    text.toLowerCase().includes('appointment') ||
                    text.toLowerCase().includes('consult')) {
                    const doctors = await prisma.doctor.findMany({ where: { active: true } });

                    // Natural Language Shortcut: Check if a doctor is mentioned
                    const mentionedDoctor = doctors.find(d => text.toLowerCase().includes(d.name.toLowerCase()));

                    if (mentionedDoctor) {
                        console.log(`[Webhook] Shortcut: Doctor "${mentionedDoctor.name}" detected in query`);
                        return await handleDoctorSelection(from, text, `doc_${mentionedDoctor.id}`, mentionedDoctor, currentData);
                    }

                    // Natural Language Shortcut: Check if a DEPARTMENT is mentioned
                    const allDepartments = await prisma.department.findMany({ where: { active: true } });
                    let mentionedDept = allDepartments.find(d => {
                        const deptName = d.name.toLowerCase();
                        const input = text.toLowerCase();
                        if (input.includes(deptName)) return true;
                        if (input.includes('ent') && (deptName.includes('ear') || deptName.includes('ent'))) return true;
                        if (input.includes('cardio') && deptName.includes('cardiology')) return true;
                        if (input.includes('ortho') && deptName.includes('orthopedics')) return true;
                        if (input.includes('derma') && deptName.includes('dermatology')) return true;
                        if (input.includes('pedia') && deptName.includes('pediatrics')) return true;
                        return false;
                    });

                    if (mentionedDept) {
                        console.log(`[Webhook] Shortcut: Department "${mentionedDept.name}" detected in query`);
                        await prisma.session.update({
                            where: { phone: from },
                            data: {
                                currentStep: 'DOCTOR_SELECTION',
                                data: JSON.stringify({ ...currentData, selectedDepartment: mentionedDept.name })
                            },
                        });

                        const doctorsInDept = await prisma.doctor.findMany({
                            where: { department: mentionedDept.name, active: true }
                        });

                        await sendWhatsAppList(
                            from,
                            `Available doctors in ${mentionedDept.name} 👇`,
                            "Select Doctor",
                            [{
                                title: mentionedDept.name,
                                rows: doctorsInDept.slice(0, 10).map((d: any) => ({
                                    id: `doc_${d.id}`,
                                    title: d.name,
                                    description: d.specialization || d.department
                                }))
                            }]
                        );
                        return NextResponse.json({ status: 'ok' });
                    }

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
                                rows: departments.slice(0, 10).map((dept: any) => ({
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
                                rows: doctors.slice(0, 10).map((d: any) => ({
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

                    if (aiReply.trim() === 'UNKNOWN_QUERY') {
                        // Create escalation ticket
                        await prisma.supportTicket.create({
                            data: {
                                phone: from,
                                query: text,
                                status: 'OPEN',
                                messages: {
                                    create: {
                                        sender: 'USER',
                                        content: text
                                    }
                                }
                            }
                        });

                        // Send escalation message
                        await sendWhatsAppButtons(from, "Sorry, I don't have the answer to that. I am connecting you to our team and they will reply shortly. 👨‍💻", ["Book Appointment"]);
                    } else {
                        await sendWhatsAppButtons(from, aiReply, ["Book Appointment"]);
                    }
                }
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

                    // 2. Keyword match (e.g., "ent" matches "ENT" or "Otorhinolaryngology")
                    if (!matchedDept) {
                        matchedDept = allDepartments.find(d => {
                            const deptName = d.name.toLowerCase();
                            const input = text.toLowerCase();
                            // Check if input is part of name or common abbreviations
                            if (deptName.includes(input)) return true;
                            if (input === 'ent' && (deptName.includes('ear') || deptName.includes('ent'))) return true;
                            if (input === 'cardio' && deptName.includes('cardiology')) return true;
                            if (input === 'ortho' && deptName.includes('orthopedics')) return true;
                            if (input === 'derma' && deptName.includes('dermatology')) return true;
                            if (input === 'pedia' && deptName.includes('pediatrics')) return true;
                            return false;
                        });
                    }

                    if (matchedDept) {
                        selectedDeptName = matchedDept.name;
                    }
                }

                if (!selectedDeptName) {
                    console.log(`[Webhook] No department matched for "${text}"`);
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
                const selectTimeText = text.trim();
                const slotsData = currentData.availableSlots || [];

                let matchedSltShortcut = null;
                if (interactiveId.startsWith('slot_')) {
                    const slotIdx = parseInt(interactiveId.replace('slot_', ''));
                    matchedSltShortcut = slotsData[slotIdx];
                } else {
                    // Fallback to text matching
                    matchedSltShortcut = slotsData.find((slot: any) => {
                        const slotTime = new Date(slot.startTime);
                        const tStr = slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        return tStr === selectTimeText;
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

                    const confirmMsg = `✅ *Appointment Confirmed!*\n\nDoctor: ${doc?.name}\nDate: ${new Date(slot?.startTime!).toLocaleDateString()}\nTime: ${new Date(slot?.startTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}\n\nOur team will contact you shortly if needed. Thank you!`;
                    await sendWhatsAppButtons(from, confirmMsg, ["Book Appointment"]);
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
