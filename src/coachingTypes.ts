export type Coach = { id: string; name: string; initials: string; specialty: string; bio: string; venue: string; hourlyRate: number; courses: { id: string; name: string; hours: number; price: number }[] };
export type Lesson = { id: string; slotId?: string; start: string; hours: number; status: 'scheduled' | 'completed' | 'cancelled' };
export type CoachSlot = { id: string; coachId: string; start: string; hours: number; price: number; status: 'open' | 'blocked' | 'booked' };
export type Enrollment = { id: string; coachId: string; student: string; phone: string; title: string; totalHours: number; amount: number; payment: 'pending' | 'paid'; paymentMethod?: string; paidAt?: string; createdAt: string; lessons: Lesson[] };
export type CoachingState = { coaches: Coach[]; enrollments: Enrollment[]; slots: CoachSlot[]; demo: boolean };
