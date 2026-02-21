const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const doctors = await prisma.doctor.findMany({
        select: { name: true, department: true }
    });
    doctors.forEach(d => console.log(`- ${d.name} (${d.department})`));
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
