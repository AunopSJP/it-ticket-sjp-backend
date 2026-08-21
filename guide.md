<----- NestJS ----->
*** จำ ***
-Module คือ ศูนย์กลางที่รวมกลุ่มของ Controller, Service และ Entity ของฟีเจอร์นั้นๆเข้าด้วยกัน เพื่อให้ NestJS รู้จักและนำไปใช้งาน
-Controller คือ ตัวรับคำสั่งจากภายนอก (เช่น GET, POST, PUT, DELETE) ตรวจสอบข้อมูลเบื้องต้น แล้วส่งต่อให้ Service ทำงาน
-Service คือ ที่เก็บโค้ดคำนวณ โค้ดจัดการข้อมูล และติดต่อกับ Database ผ่าน Entity ห้ามเขียน Logic ไว้ใน Controller
-Entity คือ คลาสที่กำหนดว่าตารางในฐานข้อมูล (Postgres) จะมีคอลัมน์อะไรบ้าง (เช่น user_id, user_name, user_email)

*** ลำดับการเขียน ***
1. Entity เพราะต้องกำหนด Schema หน้าตาของตารางข้อมูล เพราะจำเป็นต้องใช้โครงสร้างนี้
2. Module ต้องเอา Entity ไปใส่ใน TypeOrmModule.forFeature([user]) ข้างใน Module เพื่อให้ Service นำไปใช้ต่อได้
3. Service เขียนฟังก์ชั่น CRUD (Create, Read, Update, Delete) เพื่อเรียกใช้ข้อมูลจาก Entity
4. Controller ดึง Service เข้ามาผูกกับ Route (เช่น @Get(), @Post()) เพื่อเปิดช่องทางให้ Client เรียกใช้งาน 

/สร้างโปรเจ็ค
nest new ชื่อโปรเจกต์

/ลง packages (สำหรับต่อฐานข้อมูล Postgres + TypeORM)
npm i pg typeorm @nestjs/typeorm @nestjs/config

/สร้าง module (ใส่ --no-spec เพื่อไม่เอาไฟล์เทส โฟลเดอร์จะได้สะอาด)
nest g module name --no-spec

/สร้าง entity
ni src/name/name.entity.ts

/สร้าง service 
nest g service name --no-spec

/สร้าง controller
nest g controller name --no-spec

*** ห้ามลืม ***
ต้องไปที่ไฟล์ src/main.ts แล้วเพิ่ม app.enableCors(); ก่อนบรรทัด app.listen(); 
เพื่อให้ฝั่ง Angular ยิง API ข้ามมาหาได้ (ไม่งั้นจะติดบล็อก CORS Error)

<---------------------------------------------------------------------------------------------------->

<----- Angular ----->
*** จำ ***
-Module คือ ศูนย์กลางที่รวบรวม Component, Service และ Routing ของฟีเจอร์นั้นๆ เข้าด้วยกัน (หากเป็น Angular ยุคใหม่เวอร์ชัน 15+ จะใช้ระบบ Standalone Component แทนการสร้าง Module แล้ว)
-Component คือ ตัวจัดการหน้า UI (HTML/CSS) และมีไฟล์ TypeScript คอยควบคุมเหตุการณ์บนหน้าจอ (เช่น กดปุ่มแล้วให้ทำอะไร) 
-Service คือ สมองฝั่ง Frontend มีหน้าที่หลักคือการใช้ HttpClient ยิง API (GET, POST, PUT, DELETE) ไปหา NestJS เพื่อดึงหรือส่งข้อมูล และแชร์ข้อมูลระหว่างหน้าจอ
-Model คือ การกำหนดว่า ข้อมูลที่รับ-ส่งกับ NestJS ต้องมีหน้าตาอย่างไร (เช่น ต้องมี id: number, name: string) เพื่อไม่ให้เขียนโค้ดผิดพลาด

*** ลำดับการเขียน ***
1. Model เพราะต้องกำหนดหน้าตาข้อมูลที่คาดว่าจะได้รับจาก NestJS เพื่อให้โค้ดส่วนอื่นล็อกสเปกตัวแปรได้ถูกต้อง
2. Service เขียนฟังก์ชันยิง API ด้วย HttpClient (เช่น getUsers(), createUser()) เพื่อเตรียมท่อรับส่งข้อมูลกับ NestJS
3. Component (TypeScript) เรียกใช้งาน Service เพื่อดึงข้อมูลมาเก็บลงตัวแปร หรือส่งข้อมูลจากหน้าฟอร์มกลับไปหา Service
4. HTML / CSS เขียนหน้าตาเว็บ (UI) นำข้อมูลจากตัวแปรใน Component มาวนลูปแสดงผลในตาราง หรือทำฟอร์มกรอกข้อมูล

/ติดตั้ง angular ก่อน (ทำครั้งเดียวในเครื่อง)
npm install -g @angular/cli

Angular CRUD
/สร้างโปรเจ็ค
ng new ชื่อโปรเจกต์

/สร้าง interface (Model สำหรับล็อกสเปกข้อมูล)
ng g interface models/name

/สร้าง service (ท่อยิง API หา NestJS)
ng g service services/name

/สร้าง component (หน้าจอแสดงตารางรายการข้อมูล)
ng g component components/name-list

/สร้าง component (หน้าจอแบบฟอร์ม เพิ่ม/แก้ไข ข้อมูล)
ng g component components/name-form

*** ห้ามลืม ***
ต้องมั่นใจว่าในไฟล์ src/app/app.config.ts มีการใส่ provideHttpClient() ไว้ในอาร์เรย์ providers 
เพื่อให้ไฟล์ Service สามารถดึง HttpClient ไปใช้งานเพื่อยิง API ได้
