import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const doctors = [
        { name: 'Dr. Anil', department: 'Cardiology' },
        { name: 'Dr. Meera', department: 'General Medicine' },
        { name: 'Dr. Faisal', department: 'Orthopedic' },
    ]

    console.log('Seeding doctors...')
    for (const doc of doctors) {
        await prisma.doctor.create({
            data: {
                name: doc.name,
                department: doc.department,
                active: true,
            },
        })
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
