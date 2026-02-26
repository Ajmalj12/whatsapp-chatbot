/**
 * Centralized, human-like bot messages. Pick randomly for variety.
 */

export const welcome = [
    "Hello! Welcome to CarePlus Clinic. How can I help you today?",
    "Hi! Thanks for reaching out. What do you need?",
    "Hello 👍 Welcome to CarePlus Clinic. How can I help you today?",
];

export const reAskName = [
    "No worries. Please share the patient's name.",
    "Sure. What's the patient's name?",
    "Got it. When you're ready, send me the patient's name.",
];

export const reAskAge = [
    "No problem. What's the patient's age? (Just the number, e.g. 25)",
    "Sure. Please enter the patient's age (1-99).",
    "Got it. Share the age when you're ready.",
];

export const askAgeAfterName = [
    "Got it. What is {name}'s age?",
    "Thanks. How old is {name}?",
    "Noted. What's {name}'s age?",
];

export const confirmBooking = [
    "Appointment confirmed. See you soon!",
    "Done! We'll see you then.",
    "Confirmed 👍 Please arrive a few minutes early.",
];

export const confirmBookingNextSlot = [
    "Confirmed 👍 Please arrive early.",
];

export const invalidAge = [
    "Could you share the age as a number between 1 and 99?",
    "Please enter a valid age (number only, 1-99).",
];

export const bookingCancelled = [
    "Booking cancelled. You can start over by typing 'Hi' or click below.",
];

export const confirmOrCancel = [
    "Please confirm or cancel your booking using the buttons below 👇",
];

export const defaultConfused = [
    "Sorry, I didn't understand that. Type 'Hi' to restart.",
];

export function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function askAgeForName(name: string): string {
    return pick(askAgeAfterName).replace('{name}', name);
}
