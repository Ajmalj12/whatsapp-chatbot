const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/app/api/webhook/route.ts');
const content = fs.readFileSync(filePath, 'utf8');

// 1. Fix department matching logic (whole word match)
// Replace any occurrence of if (input.includes(deptName)) with whole word match
const patchedContent = content.replace(/if \(input\.includes\(deptName\)\) return true;/g,
    "// Use whole word matching to avoid 'ent' in 'appointment'\n                        const regex = new RegExp(`\\\\b${deptName}\\\\b`, 'i');\n                        if (regex.test(input)) return true;");

// 2. Make department selection mandatory
// We look for "if (doctors.length > 10) {" and replace the whole if/else block
// This is done by finding a unique marker for that block
const marker = "if (doctors.length > 10) {";
const startIdx = patchedContent.indexOf(marker);

if (startIdx !== -1) {
    // We need to find the end of the if/else block.
    // In this specific code, the block ends after the sendWhatsAppList call in the else branch.
    // The else branch contains: rows: doctors.slice(0, 10).map((d: any) => ({ ... })) }] ); }
    const endMarker = "description: d.department\n                                }))\n                            }]\n                        );\n                    }";
    const endIdx = patchedContent.indexOf(endMarker, startIdx);

    if (endIdx !== -1) {
        const fullEndIdx = endIdx + endMarker.length;
        const replacement = `// Always show departments first (mandatory selection)
                    const departments = await prisma.department.findMany({ 
                        where: { active: true }, 
                        orderBy: { displayOrder: 'asc' } 
                    });

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
                                id: \`dept_\${dept.id}\`,
                                title: dept.name,
                                description: dept.description?.slice(0, 72)
                            }))
                        }]
                    );`;

        const finalContent = patchedContent.substring(0, startIdx) + replacement + patchedContent.substring(fullEndIdx);
        fs.writeFileSync(filePath, finalContent, 'utf8');
        console.log("Successfully patched route.ts!");
    } else {
        console.log("Error: Could not find end of selection block.");
    }
} else {
    console.log("Error: Could not find mandatory selection block marker.");
}
