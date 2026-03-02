import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('Cleaning existing data...')
    await prisma.appointment.deleteMany({})
    await prisma.availability.deleteMany({})
    await prisma.doctor.deleteMany({})

    const departmentNames = ['Cardiology', 'General Medicine', 'Orthopedic', 'Dermatology']
    for (const name of departmentNames) {
        await prisma.department.upsert({
            where: { name },
            create: { name, active: true, displayOrder: departmentNames.indexOf(name) },
            update: {},
        })
    }

    const doctors = [
        { name: 'Dr. Anil', department: 'Cardiology' },
        { name: 'Dr. Meera', department: 'General Medicine' },
        { name: 'Dr. Faisal', department: 'Orthopedic' },
        { name: 'Dr. Rahul', department: 'General Medicine' },
        { name: 'Dr. Ayesha', department: 'Dermatology' },
        { name: 'Dr. Ahmed', department: 'General Medicine' },
    ]

    console.log('Seeding doctors and availability...')
    for (const doc of doctors) {
        const createdDoctor = await prisma.doctor.create({
            data: {
                name: doc.name,
                department: doc.department,
                active: true,
            },
        })

        const isRahul = doc.name === 'Dr. Rahul'
        const isAyesha = doc.name === 'Dr. Ayesha'
        const isAhmed = doc.name === 'Dr. Ahmed'

        if (isRahul) {
            const today = new Date()
            for (const [h, m] of [[17, 30], [18, 15]]) {
                const startTime = new Date(today)
                startTime.setHours(h, m, 0, 0)
                if (startTime <= today) continue
                const endTime = new Date(startTime)
                endTime.setMinutes(endTime.getMinutes() + 45)
                await prisma.availability.create({
                    data: { doctorId: createdDoctor.id, startTime, endTime, isBooked: false },
                })
            }
        } else if (isAyesha) {
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            for (const hour of [13, 14, 15, 16]) {
                const startTime = new Date(tomorrow)
                startTime.setHours(hour, 0, 0, 0)
                const endTime = new Date(startTime)
                endTime.setHours(startTime.getHours() + 1)
                await prisma.availability.create({
                    data: { doctorId: createdDoctor.id, startTime, endTime, isBooked: false },
                })
            }
        } else if (isAhmed) {
            const today = new Date()
            for (const hour of [16, 17, 18, 19]) {
                for (const min of [0, 45]) {
                    if (hour === 19 && min === 45) continue
                    const startTime = new Date(today)
                    startTime.setHours(hour, min, 0, 0)
                    if (startTime <= today) continue
                    const endTime = new Date(startTime)
                    endTime.setMinutes(endTime.getMinutes() + 45)
                    await prisma.availability.create({
                        data: { doctorId: createdDoctor.id, startTime, endTime, isBooked: false },
                    })
                }
            }
        } else {
            for (let i = 1; i <= 3; i++) {
                const startTime = new Date()
                startTime.setDate(startTime.getDate() + 1)
                startTime.setHours(9 + i, 0, 0, 0)
                const endTime = new Date(startTime)
                endTime.setHours(startTime.getHours() + 1)
                await prisma.availability.create({
                    data: { doctorId: createdDoctor.id, startTime, endTime, isBooked: false },
                })
            }
        }
    }

    const kbEntries = [
        // Clinic timings (English + Manglish/Malayalam)
        { question: 'What are the clinic timings?', answer: "We're open 9 AM – 9 PM." },
        { question: 'What are your opening hours?', answer: "We're open from 9 AM – 9 PM." },
        { question: 'When do you open?', answer: "We're open 9 AM – 9 PM." },
        { question: 'When was open?', answer: "We're open 9 AM – 9 PM." },
        { question: 'Opening time?', answer: "We're open 9 AM – 9 PM." },
        { question: 'eppol thurakkum?', answer: "CarePlus Clinic opens 9 AM – 9 PM." },
        { question: 'samayam ethra?', answer: "We're open 9 AM – 9 PM." },
        { question: 'Is the clinic open tomorrow?', answer: 'Yes 👍 We\'re open from 9 AM – 9 PM.' },
        { question: 'Is clinic open tomorrow?', answer: 'Yes 👍 We\'re open from 9 AM – 9 PM.' },
        // Full body / lab / home sample
        { question: 'Full body checkup cost?', answer: '₹1999 👍 Includes 70+ tests.' },
        { question: 'How much is full body checkup?', answer: '₹1999 👍 Includes 70+ tests.' },
        { question: 'Home sample?', answer: 'Yes. Which date should we schedule?' },
        { question: 'Do you do home sample collection?', answer: 'Yes. Which date should we schedule?' },
        { question: 'Tomorrow morning lab sample', answer: 'Booked 👍 Sample pickup tomorrow 7–9 AM.' },
        { question: 'Lab test tomorrow morning', answer: 'Booked 👍 Sample pickup tomorrow 7–9 AM.' },
        { question: 'Schedule home sample tomorrow morning', answer: 'Booked 👍 Sample pickup tomorrow 7–9 AM.' },
        // Doctor availability
        { question: 'Doctor undo?', answer: 'Yes, doctor is available.' },
        { question: 'Doctor available?', answer: 'Yes, doctor is available.' },
        { question: 'time eppazha', answer: 'Please check the available slots above, or ask for a specific doctor and date.' },
        { question: 'What time?', answer: 'Please check the available slots above, or ask for a specific doctor and date.' },
        // Manglish / Malayalam booking and availability
        { question: 'innu aarokke available?', answer: 'Ask "who is available today?" and I\'ll list today\'s doctors and slots.' },
        { question: 'eathokke drs available?', answer: 'Ask "who is available today?" or "tomorrow" and I\'ll show doctors and slots.' },
        { question: 'book cheyyam', answer: 'Sure! Say "Book Appointment" or tell me the doctor and date (e.g. tomorrow with Dr. Rahul).' },
        { question: 'appointment edukkan', answer: 'Sure! Say "Book Appointment" or tell me the doctor and date.' },
        { question: 'booking venam', answer: 'Sure! Say "Book Appointment" or tell me which doctor and day you need.' },
        // Location / address (edit the answer in Knowledge Base portal with your real address)
        { question: 'Where is the clinic?', answer: 'CarePlus Clinic – Demo location. Update this in the admin Knowledge Base with your real address.' },
        { question: 'Clinic address?', answer: 'CarePlus Clinic – Demo location. Update this in the admin Knowledge Base with your real address.' },
        { question: 'Ningalude sthalam ewde anu?', answer: 'CarePlus Clinic – Demo location. Update this in the admin Knowledge Base with your real address.' },
        { question: 'Place ewde?', answer: 'CarePlus Clinic – Demo location. Update this in the admin Knowledge Base with your real address.' },
        // Demo clinic
        { question: 'Is this a demo?', answer: 'This is a demo clinic for testing the WhatsApp bot. You can book slots, ask about doctors and timings.' },
    ]

    console.log('Seeding knowledge base...')
    for (const entry of kbEntries) {
        const existing = await prisma.knowledgeBase.findFirst({ where: { question: entry.question } })
        if (!existing) {
            await prisma.knowledgeBase.create({ data: entry })
        }
    }
    console.log('Seeding complete.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
