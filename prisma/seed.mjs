import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('Cleaning existing data...')
    await prisma.appointment.deleteMany({})
    await prisma.availability.deleteMany({})
    await prisma.doctor.deleteMany({})

    const doctors = [
        { name: 'Dr. Anil', department: 'Cardiology' },
        { name: 'Dr. Meera', department: 'General Medicine' },
        { name: 'Dr. Faisal', department: 'Orthopedic' },
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

        // Add 3 slots for each doctor starting from tomorrow
        for (let i = 1; i <= 3; i++) {
            const startTime = new Date();
            startTime.setDate(startTime.getDate() + 1); // Tomorrow
            startTime.setHours(9 + i, 0, 0, 0); // 10am, 11am, 12pm

            const endTime = new Date(startTime);
            endTime.setHours(startTime.getHours() + 1);

            await prisma.availability.create({
                data: {
                    doctorId: createdDoctor.id,
                    startTime,
                    endTime,
                    isBooked: false,
                }
            })
        }
    }

    const kbEntries = [
        { question: 'What are the clinic timings?', answer: "We're open 9 AM – 9 PM." },
        { question: 'What are your opening hours?', answer: "We're open from 9 AM – 9 PM." },
        { question: 'Is the clinic open tomorrow?', answer: 'Yes 👍 We\'re open from 9 AM – 9 PM.' },
        { question: 'Is clinic open tomorrow?', answer: 'Yes 👍 We\'re open from 9 AM – 9 PM.' },
        { question: 'Full body checkup cost?', answer: '1999 👍 Includes 70+ tests.' },
        { question: 'How much is full body checkup?', answer: '1999 👍 Includes 70+ tests.' },
        { question: 'Home sample?', answer: 'Yes. Which date should we schedule?' },
        { question: 'Do you do home sample collection?', answer: 'Yes. Which date should we schedule?' },
        { question: 'Tomorrow morning lab sample', answer: 'Booked 👍 Sample pickup tomorrow 7–9 AM.' },
        { question: 'Lab test tomorrow morning', answer: 'Booked 👍 Sample pickup tomorrow 7–9 AM.' },
        { question: 'Schedule home sample tomorrow morning', answer: 'Booked 👍 Sample pickup tomorrow 7–9 AM.' },
        { question: 'Doctor undo?', answer: 'Yes, doctor is available.' },
        { question: 'Doctor available?', answer: 'Yes, doctor is available.' },
        { question: 'time eppazha', answer: 'Please check the available slots above, or ask for a specific doctor and date.' },
        { question: 'What time?', answer: 'Please check the available slots above, or ask for a specific doctor and date.' },
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
