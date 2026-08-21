1. Department (แผนก)
department.entity.ts — นิยามตาราง department_tb บอก field ต่างๆ (department_id, department_code, department_name_th, is_active, created_at, updated_at) และบอก TypeORM ว่าแต่ละ field ผูกกับคอลัมน์จริงชื่ออะไร
shared schema (department.schema.ts ใน package shared) — นิยามรูปร่างข้อมูลที่ backend/frontend ใช้ร่วมกันตอนส่ง-รับผ่าน API (validate + type)
departments.repository.ts — ฟังก์ชันคุยกับ DB ตรงๆ (หา list, หาตาม id, สร้าง, แก้ไข) ห่อ TypeORM repository อีกชั้น
departments.service.ts — กติกาทางธุรกิจ เช่น ห้ามลบแผนกที่ยังมีตั๋วค้าง, ตรวจ department_code ซ้ำไหมตอนสร้างใหม่
departments.controller.ts — เปิด endpoint (GET list, POST สร้าง, PATCH แก้ไข) รับ request แล้วเรียก service
departments.module.ts — รวม entity/repository/service/controller เข้าด้วยกันเป็นโมดูลเดียว
ไปเพิ่มใน app.module.ts — เอา entity เข้า array ของ TypeORM และเอา module เข้า imports

เสร็จ Department แล้วต่อด้วย → Admin (บัญชีแอดมิน) + Auth

2. Admin (บัญชีแอดมิน)
admin.entity.ts — นิยามตาราง admin (admin_id, full_name, email, password hash, role, is_active, department_id ที่ผูกกับ Department, created_at, updated_at)
shared schema — schema สำหรับสร้างแอดมิน, แก้โปรไฟล์, เปลี่ยนรหัสผ่าน, เปิด/ปิดบัญชี
admins.repository.ts — หา admin ตาม email (ใช้ตอน login), ตาม id, list ทั้งหมด
admins.service.ts — กติกา เช่น ห้ามปิดบัญชีตัวเอง, hash รหัสผ่านก่อนบันทึก, ตรวจ email ซ้ำ
admins.controller.ts — endpoint จัดการบัญชีแอดมิน (ต้อง login ก่อนถึงเรียกได้ — จุดนี้จะโยงกับ Auth module ข้อถัดไป)
admins.module.ts + เพิ่มใน app.module.ts

3. Auth (login ฝั่งแอดมิน)
jwt.strategy.ts — บอกวิธี Passport ตรวจ JWT token จาก request (ดึง token จากไหน, ใช้ secret อะไร, เมื่อ verify ผ่านแล้วไปหา admin ตัวจริงจาก DB ยังไง)
auth.service.ts — ตรวจ email/password ตอน login, ล็อกบัญชีถ้าใส่ผิดหลายครั้ง, ออก JWT token
auth.controller.ts — endpoint /auth/login
jwt-auth.guard.ts (ถ้ายังไม่มี) — guard ที่เอาไปติดหน้า controller อื่นๆ เพื่อบังคับต้อง login ก่อน
auth.module.ts + เพิ่มใน app.module.ts

จุดนี้แนะนำให้ลองรันจริง ล็อกอินผ่าน Postman ให้ได้ก่อน เพราะโมดูลถัดๆ ไปทุกตัวต้องใช้ auth นี้ทดสอบ

4. User (ผู้แจ้งปัญหา ฝั่ง LINE)
user.entity.ts — นิยามตาราง (user_id, line_user_id, line_display_name, line_picture_url, created_at, updated_at) — ไม่มีรหัสผ่านเพราะ login ผ่าน LINE
line-verify.service.ts — เรียก LINE server เพื่อตรวจว่า id token ที่ frontend ส่งมาของจริงไหม (แยกไฟล์นี้เพราะเป็นการคุยกับ external API ไม่ใช่ business logic ของเรา)
users.repository.ts — หา user จาก line_user_id, สร้าง user ใหม่ถ้ายังไม่เคยมี
users.service.ts — logic "login ผ่าน LINE" คือ verify token แล้วหา/สร้าง user แล้วคืนข้อมูล
users.controller.ts — endpoint ที่ frontend (LIFF) เรียกตอนเปิดแอป
users.module.ts + เพิ่มใน app.module.ts

เสร็จ 4 โมดูลนี้แล้ว → เริ่ม Ticket ซึ่งเป็นแกนกลางของระบบ

5. Ticket (ตั๋วแจ้งปัญหา)
ticket.entity.ts — ตัวใหญ่สุด มี field เยอะ (ข้อมูลผู้แจ้งตอนกรอกฟอร์ม, department_id, priority, status, assignee_id, SLA-related fields, resolve/close timestamps) และมี relation ไปหา Department, Admin (assignee), User (ผู้แจ้ง)
shared schema หลายตัว — แยกตามการใช้งาน เช่น schema ตอนสร้างตั๋ว (createTicketSchema), ตอน list (ticketListItemSchema), ตอน forward/resolve/wait ตั๋ว
ticket-access.policy.ts — ใครเห็นตั๋วไหนได้บ้าง (super admin เห็นหมด, แอดมินแผนกเห็นเฉพาะแผนกตัวเอง)
sla.util.ts — ฟังก์ชันคำนวณ deadline ตาม priority
tickets.repository.ts — query ที่ซับซ้อน (filter, search, join กับ department/assignee)
tickets.service.ts — business logic หลักของระบบทั้งหมด (สร้างตั๋ว, มอบหมาย, เปลี่ยนสถานะ, resolve, ยืนยันปิดงาน) ไฟล์นี้จะใหญ่สุดในระบบ
tickets.controller.ts — endpoint ทั้งหมดของตั๋ว
tickets.module.ts + เพิ่มใน app.module.ts

6. ตารางลูกของ Ticket

ทำ 3 อันนี้ต่อกันได้เลย แต่ละอันมี entity + ผูกเข้ากับ tickets.service.ts เดิม (ไม่ต้องมี controller/service แยกของตัวเองเสมอไป ถ้า logic ผูกกับ ticket โดยตรง):

ticket-image.entity.ts — รูปแนบของตั๋ว (ต้องมี Storage module สำหรับอัปโหลดไฟล์ก่อน — ทำคู่กัน)
ticket-history.entity.ts — log การเปลี่ยนสถานะ/โอนแผนกของตั๋ว
ticket-comment.entity.ts — บันทึกภายใน (แอดมินคุยกันเอง ไม่ให้ผู้แจ้งเห็น)

7. Notification + Chat
notification.entity.ts + notifications.service/controller/module — แจ้งเตือนฝั่งแอดมิน (กระดิ่ง)
user-notification.entity.ts + service/controller — แจ้งเตือนฝั่งผู้แจ้ง (ผ่าน line_id_token ไม่ต้อง login)
ticket-message.entity.ts — ข้อความแชทของตั๋ว
ticket-chat.service.ts — logic ส่ง/อ่านข้อความ + SSE stream แบบ real-time
ticket-chat.controller.ts + ticket-chat.module.ts

8. ฟีเจอร์เสริม (ทำท้ายสุด)
Symptom suggestion — คำแนะนำอาการที่พิมพ์บ่อยตอนกรอกฟอร์ม
Audit log — บันทึกว่าใครทำอะไรกับระบบเมื่อไหร่
SLA scheduler — background job เช็คตั๋วเกินเวลาเป็นระยะ
Dashboard/Analytics — query สรุปข้อมูลจากทุกตารางข้างบน ทำหลังสุดเพราะต้องมีข้อมูลให้สรุปก่อน

---------------------------------------------------------------------------------------------------------

1. department_tb

department_id (PK)
department_code (unique)
department_name_th
department_name_en
department_is_active
department_is_custom
department_deleted_at — ใหม่ (soft delete)
department_created_at, department_updated_at
FK: ไม่มี (เป็นตารางฐานสุด ไม่มีใครอ้างเข้ามาหาใคร)

2. admin_tb

admin_id (PK)
admin_full_name
admin_email (unique)
admin_password_hash
admin_role
admin_is_active
admin_department_id
admin_failed_login_attempts — ใหม่
admin_locked_until — ใหม่
admin_deleted_at — ใหม่ (soft delete)
admin_created_at, admin_updated_at
FK: admin_department_id → department_tb.department_id

3. user_tb (เดิมชื่อ reporter_tb)

user_id (PK)
user_line_user_id (unique)
user_line_display_name
user_line_picture_url
user_last_login_at — ใหม่
user_created_at, user_updated_at
FK: ไม่มี

4. symptom_tb

symptom_id (PK)
department_id
symptom_label
symptom_is_manual
symptom_hit_count
symptom_last_seen_at
symptom_created_at, symptom_updated_at
unique (department_id, symptom_label)
FK: department_id → department_tb.department_id
ไม่มีคอลัมน์ใหม่

5. ticket_tb

ticket_id (PK, uuid)
ticket_no (unique)
department_id
ticket_subject
ticket_description
ticket_location
ticket_reporter_name (ชื่อที่กรอกในฟอร์ม อาจต่างจาก user_tb.user_line_display_name)
ticket_reporter_contact
ticket_priority
ticket_urgent_detail
ticket_urgent_phone
ticket_impact_level
ticket_deadline_note
ticket_deadline_date
ticket_selected_symptoms (text[])
ticket_custom_department_note
user_id
ticket_status
ticket_assignee_admin_id
ticket_resolution_note
ticket_closed_at
ticket_idempotency_key (unique)
ticket_created_at, ticket_updated_at
FK: department_id → department_tb.department_id, user_id → user_tb.user_id, ticket_assignee_admin_id → admin_tb.admin_id
ย้ายออก: field กลุ่ม SLA ทั้งหมดย้ายไปตารางที่ 6 แทน (ไม่มีในตารางนี้แล้ว)

6. ticket_sla_tb — ตารางใหม่ทั้งตาราง

ticket_id (PK และ FK พร้อมกัน แบบ 1:1)
ticket_sla_assign_by
ticket_sla_resolve_by
ticket_sla_breached
ticket_sla_warning_notified_at
ticket_sla_breach_notified_at
ticket_sla_wait_started_at
ticket_sla_paused_ms
ticket_sla_resolved_at
ticket_sla_confirmation_deadline
FK: ticket_id → ticket_tb.ticket_id

7. ticket_image_tb

ticket_image_id (PK)
ticket_id
ticket_history_id (nullable)
ticket_image_file_name
ticket_image_original_name
ticket_image_file_path
ticket_image_file_size_bytes — ใหม่
ticket_image_mime_type — ใหม่
ticket_image_created_at
FK: ticket_id → ticket_tb.ticket_id, ticket_history_id → ticket_history_tb.ticket_history_id

8. ticket_history_tb

ticket_history_id (PK)
ticket_id
ticket_history_from_status
ticket_history_to_status
ticket_history_from_department_id (nullable)
ticket_history_to_department_id (nullable)
ticket_history_changed_by_admin_id (nullable)
ticket_history_note
ticket_history_created_at
FK: ticket_id → ticket_tb.ticket_id, ticket_history_from_department_id → department_tb.department_id, ticket_history_to_department_id → department_tb.department_id, ticket_history_changed_by_admin_id → admin_tb.admin_id
ไม่มีคอลัมน์ใหม่

9. ticket_comment_tb

ticket_comment_id (PK)
ticket_id
admin_id (nullable)
ticket_comment_note
ticket_comment_created_at
FK: ticket_id → ticket_tb.ticket_id, admin_id → admin_tb.admin_id
ตัดออก: ticket_comment_is_internal

10. ticket_message_tb

ticket_message_id (PK)
ticket_id
ticket_message_sender_type
sender_admin_id (nullable)
sender_user_id (nullable)
ticket_message_text
ticket_message_is_read
ticket_message_created_at
FK: ticket_id → ticket_tb.ticket_id, sender_admin_id → admin_tb.admin_id, sender_user_id → user_tb.user_id
ใหม่: CHECK constraint บังคับว่าต้องมี sender_admin_id หรือ sender_user_id ตั้งค่าแค่ฝั่งเดียวเท่านั้น ให้ตรงกับ ticket_message_sender_type

11. notification_tb — รวมจาก 2 ตารางเดิมเป็นตารางเดียว

notification_id (PK)
notification_recipient_type (admin/user) — ใหม่
recipient_admin_id (nullable)
recipient_user_id (nullable)
ticket_id (nullable)
notification_message
notification_is_read
notification_created_at
FK: recipient_admin_id → admin_tb.admin_id, recipient_user_id → user_tb.user_id, ticket_id → ticket_tb.ticket_id
ใหม่: CHECK constraint บังคับ recipient_id ตรงกับ recipient_type แค่ฝั่งเดียว (แพทเทิร์นเดียวกับข้อ 10)

12. audit_log_tb

audit_log_id (PK)
admin_id (nullable)
audit_log_action
audit_log_entity_type
audit_log_entity_id
audit_log_summary
audit_log_metadata (jsonb)
audit_log_ip_address — ใหม่
audit_log_user_agent — ใหม่
audit_log_created_at
FK: admin_id → admin_tb.admin_id

แผนที่ FK รวมทั้งระบบ (ใครอ้างถึงใครบ้าง): department_tb และ user_tb เป็นจุดฐานที่ไม่มีใครอ้างเข้าไปอีกที ส่วน ticket_tb เป็นจุดศูนย์กลางที่เกือบทุกตารางอ้างกลับมาหา (ticket_sla, ticket_image, ticket_history, ticket_comment, ticket_message, notification) และ admin_tb เป็นจุดที่ถูกอ้างถึงบ่อยรองลงมา (department ผ่าน admin_department_id ไม่นับ แต่ ticket/history/comment/message/notification/audit_log ล้วนอ้างถึง admin_id ในรูปแบบใดรูปแบบหนึ่ง)