import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('🔍 Checking for orphaned availability records...')

    const allAvailability = await prisma.availability.findMany()
    console.log(`Found ${allAvailability.length} total availability records.`)

    let orphanedCount = 0
    for (const slot of allAvailability) {
        const doctor = await prisma.doctor.findUnique({
            where: { id: slot.doctorId }
        })

        if (!doctor) {
            console.log(`🗑️ Orphaned slot found: ID ${slot.id} (Doctor ID: ${slot.doctorId}). Deleting...`)
            await prisma.availability.delete({ where: { id: slot.id } })
            orphanedCount++
        }
    }

    console.log(`✅ Cleanup complete. Removed ${orphanedCount} orphaned records.`)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
