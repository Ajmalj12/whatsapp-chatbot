import prisma from '@/lib/prisma';
import { normalizePhone } from '@/lib/phone';
import { formatAppointmentTime } from '@/lib/timeParser';
import { formatDoctorName } from '@/lib/formatReply';

export async function getUpcomingAppointmentsForPhone(normalizedPhone: string) {
    const now = new Date();
    const appointments = await prisma.appointment.findMany({
        where: { status: 'Booked' },
        include: {
            doctor: true,
            availability: true,
        },
    });

    return appointments
        .filter((apt: any) => {
            if (!apt.availability || !apt.availability.startTime) return false;
            const aptPhone = normalizePhone(apt.patientPhone);
            return aptPhone === normalizedPhone && apt.availability.startTime >= now;
        })
        .sort((a: any, b: any) => {
            return a.availability.startTime.getTime() - b.availability.startTime.getTime();
        });
}

export function formatAppointmentsForUser(appointments: any[]): string {
    if (!appointments.length) return '';
    return appointments
        .map((apt: any, idx: number) => {
            const start = apt.availability?.startTime ? formatAppointmentTime(apt.availability.startTime) : '';
            const doctorName = apt.doctor ? formatDoctorName(apt.doctor.name) : 'Doctor';
            return `${idx + 1}. ${start} – ${doctorName}`;
        })
        .join('\n');
}

export async function cancelAppointmentById(appointmentId: string): Promise<void> {
    const apt = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { availabilityId: true },
    });
    if (!apt) return;

    await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'Cancelled' },
    });
    await prisma.availability.update({
        where: { id: apt.availabilityId },
        data: { isBooked: false },
    });
}

