import type { Coach } from '../src/coachingTypes';

export const coaches: Coach[] = [
  { id: 'bank', name: 'โค้ชแบงค์', initials: 'BK', specialty: 'เริ่มต้นอย่างมั่นใจ', bio: 'จับไม้ เสิร์ฟ รับลูก และกติกา เรียนทีละขั้นสำหรับคนที่เพิ่งเริ่มเล่น', venue: 'Chicken Court Club · ขอนแก่น', hourlyRate: 600, courses: [{ id: 'foundation', name: 'พื้นฐานแน่น พร้อมลงก๊วน', hours: 6, price: 3200 }, { id: 'starter', name: 'เริ่มเล่นเป็นใน 3 ชั่วโมง', hours: 3, price: 1700 }] },
  { id: 'ploy', name: 'โค้ชพลอย', initials: 'PL', specialty: 'Dink & คุมเกมหน้าเน็ต', bio: 'พัฒนาการวางลูก ดรอปช็อต และการตัดสินใจในเกมคู่ ด้วยแบบฝึกเฉพาะคุณ', venue: 'North Court Arena · ขอนแก่น', hourlyRate: 800, courses: [{ id: 'control', name: 'คุมหน้าเน็ต เพิ่มความแม่นยำ', hours: 8, price: 5800 }] },
  { id: 'ton', name: 'โค้ชต้น', initials: 'TN', specialty: 'เทคนิคเกมคู่', bio: 'ฝึกตำแหน่งยืน การเคลื่อนที่ และการสื่อสารกับคู่ เพื่อเล่นอย่างเป็นระบบ', venue: 'Smash Yard Pickleball · ขอนแก่น', hourlyRate: 700, courses: [{ id: 'doubles', name: 'ยกระดับเกมคู่', hours: 5, price: 3200 }] },
];
