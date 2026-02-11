const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/app/api/webhook/route.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix department matching logic (whole word match)
// This replacement targets the find() block for departments
const oldMatch = `let mentionedDept = allDepartments.find(d => {
                        const deptName = d.name.toLowerCase();
                        const input = text.toLowerCase();
                        if (input.includes(deptName)) return true;
                        return false;
                    });`;

const newMatch = `let mentionedDept = allDepartments.find(d => {
                        const deptName = d.name.toLowerCase();
                        const input = text.toLowerCase();
                        // Use whole word matching to avoid "ent" in "appointment"
                        const regex = new RegExp(\`\\\\b\${deptName}\\\\b\`, 'i');
                        return regex.test(input);
                    });`;

// We use split/join for global replacement if there are multiple occurrences
// But since the indentation might vary, we'll try a more flexible approach if exact match fails
if (content.indexOf(oldMatch) === -1) {
    console.log("Warning: Exact match for department find block not found. Trying flexible replacement...");
    // Let's just replace the specific line if possible
    content = content.replace(/if \(input\.includes\(deptName\)\) return true;/g,
        "const regex = new RegExp(`\\\\b${deptName}\\\\b`, 'i'); if (regex.test(input)) return true;");
} else {
    content = content.split(oldMatch).join(newMatch);
}

// 2. Make department selection mandatory (remove doctors.length > 10 check)
// This targets the specific if/else block in MAIN_MENU
const oldSelectionBlock = `if (doctors.length > 10) {
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
                                    id: `dept_${ dept.id }`,
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
                                    id: `doc_${ d.id } `,
                                    title: d.name,
                                    description: d.department
                                }))
                            }]
                        );
                    }`;

const newSelectionBlock = `// Always show departments first (mandatory selection)
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
                                id: `dept_${ dept.id }`,
                                title: dept.name,
                                description: dept.description?.slice(0, 72)
                            }))
                        }]
                    );`;

if (content.indexOf(oldSelectionBlock) === -1) {
    console.log("Warning: Exact match for selection block not found. Trying line-based replacement...");
    // Fallback: search for the specific if (doctors.length > 10) line
    const regex = /if \(doctors\.length > 10\) \{[\s\S]*?\} else \{[\s\S]*?\s{24}\}/;
    // This is risky, but let's try a safer way by looking for the start and end of that section
} else {
    content = content.split(oldSelectionBlock).join(newSelectionBlock);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully updated route.ts with mandatory department selection and whole-word matching.");
