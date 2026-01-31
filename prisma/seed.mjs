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
