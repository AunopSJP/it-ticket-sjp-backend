/** รหัสย่อที่ใช้ในเลขตั๋ว ต้องคงที่แม้ชื่อแผนกจะแสดงผลเปลี่ยนภาษา */
export const TICKET_DEPARTMENT_CODES: Readonly<Record<string, string>> = {
  pm: 'PM',
  sales: 'SALES',
  technician_support: 'TECH',
  network_support: 'NET',
  it_support: 'IT',
  accounting: 'ACC',
  post_sales: 'PS',
  developer: 'DEV',
  procurement_hr: 'PRH',
  other: 'OTHER',
};
