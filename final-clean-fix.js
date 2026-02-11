const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/app/api/webhook/route.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the block in KNOWLEDGE_QUERY
let startLine = -1;
let endLine = -1;

for (let i = 0; i < lines.length; i++) {
    // Specifically looking for the block after the first mandatory selection fix (which is at ~353)
    // So we search from line 400 onwards
    if (i > 400 && lines[i].includes('if (doctors.length > 10) {')) {
        startLine = i;
    }
    if (startLine !== -1 && i > startLine && lines[i].includes('// AI Reply with dynamic context')) {
        // Find the matching closing brace for the KNOWLEDGE_QUERY "if book" block
        // Actually, the block we want to replace ends before the "else" of direct AI reply
        endLine = i - 2; // Adjusting based on previous view
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

    lines.splice(startLine, (endLine - startLine + 1), ...replacement);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`Success! Replaced block at lines ${startLine + 1} to ${endLine + 1}`);
} else {
    console.log(`Error: Block not found. Start: ${startLine}, End: ${endLine}`);
    // Print lines around 444 for debug
    console.log("Context:");
    for (let j = 440; j < 450; j++) console.log(`${j}: ${lines[j]}`);
}
