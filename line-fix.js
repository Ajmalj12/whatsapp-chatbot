const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/app/api/webhook/route.ts');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Target block starts around line 352
// We'll find the start and end by line content to be safe
let startLine = -1;
let endLine = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (doctors.length > 10) {')) {
        startLine = i;
    }
    // The end of the block in MAIN_MENU branch is before the know more check
    if (startLine !== -1 && i > startLine && lines[i].includes("} else if (text.includes('know more')")) {
        // The block ends 1 line before this
        endLine = i - 1;
        break;
    }
}

if (startLine !== -1 && endLine !== -1) {
    const replacement = [
        "                    // Mandatory department selection",
        "                    const departmentsList = await prisma.department.findMany({ ",
        "                        where: { active: true }, ",
        "                        orderBy: { displayOrder: 'asc' } ",
        "                    });",
        "",
        "                    await prisma.session.update({",
        "                        where: { phone: from },",
        "                        data: { currentStep: 'DEPARTMENT_SELECTION' },",
        "                    });",
        "",
        "                    await sendWhatsAppList(",
        "                        from,",
        "                        \"Please choose a department first 👇\",",
        "                        \"Select Department\",",
        "                        [{",
        "                            title: \"Departments\",",
        "                            rows: departmentsList.slice(0, 10).map((dept: any) => ({",
        "                                id: `dept_${dept.id}`,",
        "                                title: dept.name,",
        "                                description: dept.description?.slice(0, 72)",
        "                            }))",
        "                        }]",
        "                    );"
    ];

    // Remove old lines and insert new one
    lines.splice(startLine, (endLine - startLine + 1), ...replacement);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`Successfully replaced lines ${startLine + 1} to ${endLine + 1} with mandatory selection.`);
} else {
    console.log(`Error: Could not find block. Start: ${startLine}, End: ${endLine}`);
}
