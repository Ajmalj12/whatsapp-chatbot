import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';

export async function POST() {
    try {
        // Get all active doctors
        const doctors = await prisma.doctor.findMany({
            where: { active: true }
        });

        if (doctors.length === 0) {
            return NextResponse.json({
                error: 'No active doctors found. Please add doctors first.'
            }, { status: 400 });
        }

        const slotsToCreate = [];
        const today = startOfDay(new Date());

        // Generate slots for next 3 days (including today)
        for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
            const currentDay = addDays(today, dayOffset);

            for (const doctor of doctors) {
                // Morning slots: 9 AM - 12 PM (every 30 minutes)
                for (let hour = 9; hour < 12; hour++) {
                    for (let minute of [0, 30]) {
                        const startTime = setMinutes(setHours(currentDay, hour), minute);
                        const endTime = setMinutes(setHours(currentDay, hour), minute + 30);

                        slotsToCreate.push({
                            doctorId: doctor.id,
                            startTime,
                            endTime,
                            isBooked: false
                        });
                    }
                }

                // Afternoon slots: 2 PM - 5 PM (every 30 minutes)
                for (let hour = 14; hour < 17; hour++) {
                    for (let minute of [0, 30]) {
                        const startTime = setMinutes(setHours(currentDay, hour), minute);
                        const endTime = setMinutes(setHours(currentDay, hour), minute + 30);

                        slotsToCreate.push({
                            doctorId: doctor.id,
                            startTime,
                            endTime,
                            isBooked: false
                        });
                    }
                }
            }
        }

        // Create all slots in bulk
        const result = await prisma.availability.createMany({
            data: slotsToCreate,
            skipDuplicates: true
        });

        return NextResponse.json({
            success: true,
            message: `Successfully created ${result.count} availability slots for ${doctors.length} doctor(s) across 3 days`,
            slotsCreated: result.count,
            doctorsCount: doctors.length,
            daysCount: 3
        });
    } catch (error) {
        console.error('Seed Availability Error:', error);
        return NextResponse.json({
            error: 'Failed to seed availability slots',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
