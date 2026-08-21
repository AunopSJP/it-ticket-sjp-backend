1. Department
department.entity.ts: property department_id (PK), department_code, department_name_th, department_name_en, department_is_active, department_deleted_at, department_created_at, department_updated_at — ไม่มี relation ออกไปไหนเพราะเป็นตารางฐาน
department.schema.ts: departmentSchema (รูปแบบเต็มตอนอ่าน), createDepartmentSchema (code+name_th+name_en จำเป็น), updateDepartmentSchema (ทุก field optional เพราะแก้ทีละอย่างได้)
departments.repository.ts: findAll(), findById(id), findByCode(code) (ใช้เช็คซ้ำตอนสร้าง), create(), save()
departments.service.ts: listAll(), create(dto) (เรียก findByCode เช็คซ้ำก่อน), update(id, dto), remove(id) (เช็คว่ามีตั๋วผูกอยู่ไหมก่อน ถ้ามีห้ามลบ หรือถ้าใช้ soft delete ก็ set deleted_at)
departments.controller.ts: GET / list, POST / สร้าง, PATCH /:id แก้ไข, DELETE /:id — ทุก endpoint ผ่าน ZodValidationPipe ด้วย schema จากข้อ 2
departments.module.ts: imports: [TypeOrmModule.forFeature([DepartmentTb])], providers: [DepartmentsService, DepartmentsRepository], controllers: [DepartmentsController], exports: [DepartmentsService]
2. Admin
admin.entity.ts: field ทั้งหมดตามที่คุยกัน + @ManyToOne(() => DepartmentTb, { nullable: true }) (nullable = super admin), admin_failed_login_attempts, admin_locked_until
shared schema: adminAccountSchema (ไม่รวม password), createAdminSchema, updateProfileSchema (full_name, email), setActiveSchema (is_active), resetPasswordSchema (new_password), updateDepartmentSchema (department_id)
admins.repository.ts: findByEmail(email) (ต้อง select password ด้วย เพราะปกติ entity ตั้ง select: false ไว้ ใช้เฉพาะตอน login), findById(), findAll(), create(), save()
admins.service.ts: createBySuperAdmin(dto) (hash password ด้วย bcrypt ก่อนเก็บ, เช็ค email ซ้ำ), updateProfile(), updateDepartment(), setActive() (ห้าม requestingUser ปิดบัญชีตัวเอง), resetPassword(), remove() (ห้ามลบตัวเอง), findAllForSuperAdmin() (เช็ค role ของ requestingUser ก่อนคืนข้อมูล)
admins.controller.ts: endpoint ทุกตัวรับ @CurrentUser() เป็น admin ที่ login อยู่ ผ่าน JwtAuthGuard
admins.module.ts + ลงทะเบียนใน app.module.ts
3. Auth
jwt.strategy.ts: constructor ตั้งค่า jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey จาก ConfigService, เมธอด validate(payload) ที่เอา payload.sub (admin_id) ไปหา admin ตัวจริงจาก DB แล้วคืนกลับ (ถ้าไม่เจอหรือ is_active = false ให้ throw Unauthorized)
auth.service.ts: validateAdmin(email, password) (เช็ค locked_until ก่อน, compare password ด้วย bcrypt, ถ้าผิด increment failed_login_attempts แล้วเช็คว่าเกิน limit ยัง ถ้าเกินตั้ง locked_until, ถ้าถูกให้ reset ค่าที่นับไว้ทั้งหมด), login(email, password) (เรียก validateAdmin แล้ว sign JWT ด้วย payload { sub: admin_id, role })
auth.controller.ts: POST /auth/login รับ email/password ผ่าน schema, เรียก service, คืน { access_token, user }
jwt-auth.guard.ts: export class JwtAuthGuard extends AuthGuard('jwt') {} แค่นี้พอ ไม่ต้องมี logic เพิ่ม
auth.module.ts: imports: [PassportModule, JwtModule.registerAsync(...), AdminsModule], providers: [AuthService, JwtStrategy], controllers: [AuthController]

จุดนี้ให้หยุดทดสอบ login ผ่าน Postman ให้ผ่านก่อนไปต่อ

4. User (ผู้แจ้ง)
user.entity.ts: user_id, user_line_user_id (unique), user_line_display_name, user_line_picture_url, user_last_login_at, user_created_at, user_updated_at
line-verify.service.ts: เมธอด verifyIdToken(idToken) — ยิง POST ไปที่ LINE verify endpoint พร้อม channel id, parse response เป็น payload, throw ถ้า token หมดอายุ/ไม่ถูกต้อง (ไฟล์นี้ไม่ควรมี logic อื่นเลยนอกจากคุยกับ LINE)
users.repository.ts: findByLineUserId(id), create(), save()
users.service.ts: loginWithLine(idToken) — เรียก line-verify ก่อน แล้ว upsert user จาก line_user_id ที่ได้ อัปเดต user_last_login_at
users.controller.ts: POST /users/login-line
users.module.ts + app.module.ts
5. Ticket
ticket.entity.ts: field ทั้งหมดตามตารางที่คุยกัน + relation ManyToOne ไป Department/User/Admin(assignee) + OneToMany ไป images/history
shared schema: แยกตามการใช้งานจริง (createTicketSchema, ticketListItemSchema, forwardTicketSchema, resolveTicketSchema, waitTicketSchema, confirmResolutionSchema)
ticket-access.policy.ts: เมธอดเดียวหลักๆ คือ buildVisibilityFilter(requestingAdmin) คืนเงื่อนไข query ที่กรองตามสิทธิ์ ให้ repository เอาไปต่อ query ได้เลย
sla.util.ts: ฟังก์ชัน calculateSlaDeadlines(priority, createdAt) คืน { assign_by, resolve_by } ตาม priority
tickets.repository.ts: findWithFilters(filters, visibilityFilter), findById(), searchPublicByTicketNo()
tickets.service.ts: createTicket() (เช็ค idempotency_key, คำนวณ SLA แล้วเขียนลง ticket_sla_tb, เรียก symptom service ให้เรียนรู้อาการ), assign(), changeStatus() (ตรวจว่าข้ามสถานะมั่วไม่ได้ + เขียน ticket_history_tb ทุกครั้ง), forward(), resolve(), confirmResolution() (ฝั่งผู้แจ้ง), listForAdmin(), searchPublic()
tickets.controller.ts: endpoint ครบตามเมธอด service ข้างบน
tickets.module.ts + app.module.ts
6. ตารางลูกของ Ticket
ticket-image.entity.ts: field ตามที่คุยกัน + relation ไป Ticket และ TicketHistory (nullable)
ticket-history.entity.ts: field + relation ไป Ticket, Department (x2 จาก/ไป), Admin (คนเปลี่ยน)
ticket-comment.entity.ts: field + relation ไป Ticket, Admin
storage.module.ts / local-storage.service.ts: เมธอด saveFile(buffer, originalName) (สุ่มชื่อไฟล์กันชนกัน, ตรวจ mime/ขนาดก่อนเซฟ, คืน path+size+mime กลับไปให้ tickets.service.ts เอาไปบันทึกลง ticket_image_tb)
7. Notification + Chat
notification.entity.ts (รวมเป็นตารางเดียว): field ตามที่คุยกัน (notification_recipient_type เป็นตัวแยกฝั่ง)
notifications.service.ts: createNotification(recipientType, recipientId, ticketId, message) (เมธอดเดียวใช้ได้ทั้ง 2 ฝั่งเพราะรวมตารางแล้ว), listUnread(recipientType, recipientId), markRead(), markAllRead()
notifications.controller.ts: GET unread, PATCH mark read (guard ต่างกันตามฝั่งที่เรียก)
ticket-message.entity.ts: field ตามที่คุยกัน + CHECK constraint ฝั่ง DB ตามที่แนะนำไว้
ticket-chat.service.ts: assertUserOwnsTicket(), assertAdminIsAssignee(), assertHasAssignee(), assertNotClosed() (helper เช็คสิทธิ์ทั้งหมด), sendFromUser(), sendFromAdmin(), markReadByUser(), markReadByAdmin(), getHistoryForUser(), getHistoryForAdmin(), getInbox() (list ตั๋วที่มีแชท), streamForTicket() (SSE ผ่าน RxJS Subject)
ticket-chat.controller.ts + ticket-inbox.controller.ts (แยก controller inbox ต่างหากเพราะ route ต่างกลุ่ม) + ticket-chat.module.ts
8. ฟีเจอร์เสริม
symptom-suggestion.entity.ts + symptoms.service.ts: suggest(department_id) (คืนอาการเรียงตาม hit_count), learn(department_id, label) (เรียกจาก tickets.service.ts ตอนสร้างตั๋วใหม่ — upsert แล้ว hit_count++), addManual() (is_manual = true)
symptoms.controller.ts: GET คำแนะนำตามแผนก, POST เพิ่มด้วยมือ
audit-log.entity.ts + audit-log.service.ts: เมธอดเดียวหลักคือ log(action, entityType, entityId, summary, adminId, metadata, ip, userAgent) — ไม่มี logic ซับซ้อน แค่เป็นจุดให้โมดูลอื่นเรียกใช้
audit-log.controller.ts: GET list (จำกัดเฉพาะ super admin)
sla-scheduler.service.ts: ใช้ @Cron() รันทุก 5 นาที ค้นหาตั๋วที่เกิน resolve_by แล้วยังไม่ปิดและยังไม่เคย notify → set sla_breached = true + ส่ง notification, และค้นหาตั๋วที่เกิน confirmation_deadline → auto-close ให้
dashboard.service.ts: เมธอด query ล้วนๆ ไม่มี write เลย: summary(), groupByDepartment(), groupByAssignee(), analytics() (เวลาเฉลี่ยแก้ปัญหา ฯลฯ)
dashboard.controller.ts: GET endpoint ตามแต่ละเมธอดของ service