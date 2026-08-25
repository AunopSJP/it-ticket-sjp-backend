import { Injectable } from '@nestjs/common';
import { AdminTb } from '../admin/admin.entity';
import { DashboardRepository } from './dashboard.repository';

export interface DashboardSummary {
  open: number;
  in_progress: number;
  waiting: number;
  forwarded: number;
  pending_confirmation: number;
  closed: number;
  total: number;
  sla_breached: number;
}

/** แจกแจงจำนวนตั๋วที่ยังไม่ปิดแยกตามสถานะย่อย - ใช้แสดงรายละเอียดเพิ่มเติมในแถวสรุปภาระงาน */
export interface GroupStatusBreakdown {
  open_count: number;
  in_progress_count: number;
  /** รวม waiting + forwarded เป็นก้อนเดียว (แสดงเป็น "รอแก้ไข/ส่งต่อ" เหมือนการ์ดสรุปด้านบน) */
  waiting_count: number;
  pending_confirmation_count: number;
}

export interface DepartmentGroupRow extends GroupStatusBreakdown {
  department_id: number;
  department_name_th: string;
  /** จำนวนตั๋วที่ยังไม่ปิดของแผนกนี้ (ไม่นับ closed) - ใช้ดูภาระงานปัจจุบัน */
  active_count: number;
  total_count: number;
}

export interface AssigneeGroupRow extends GroupStatusBreakdown {
  assignee_id: number | null;
  assignee_name: string;
  /** จำนวนตั๋วที่ยังไม่ปิดที่แอดมินคนนี้ถืออยู่ตอนนี้ (ไม่นับ closed) - ใช้ดูภาระงานปัจจุบันจริงๆ */
  active_count: number;
  total_count: number;
}

export interface DashboardAnalytics {
  /** เวลาเฉลี่ยตั้งแต่แจ้งตั๋วจนมีแอดมินกดรับเรื่องครั้งแรก (นาที) - null ถ้ายังไม่มีตั๋วไหนถูกรับเรื่องเลยในช่วงที่เลือก */
  avg_response_minutes: number | null;
  /** เวลาเฉลี่ยตั้งแต่แจ้งตั๋วจนแอดมินกด Resolve (นาที) - นับเฉพาะตั๋วที่ resolve แล้วในช่วงที่เลือก (ไม่รอ confirm) */
  avg_resolution_minutes: number | null;
  response_sample_size: number;
  resolution_sample_size: number;
}

export interface TrendPoint {
  /** วันที่ รูปแบบ YYYY-MM-DD (ตามเขตเวลาเซิร์ฟเวอร์ฐานข้อมูล) */
  date: string;
  count: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepo: DashboardRepository) {}

  async summary(admin: AdminTb): Promise<DashboardSummary> {
    const row = await this.dashboardRepo.summary(admin);

    return {
      open: Number(row?.open ?? 0),
      in_progress: Number(row?.in_progress ?? 0),
      waiting: Number(row?.waiting ?? 0),
      forwarded: Number(row?.forwarded ?? 0),
      pending_confirmation: Number(row?.pending_confirmation ?? 0),
      closed: Number(row?.closed ?? 0),
      total: Number(row?.total ?? 0),
      sla_breached: Number(row?.sla_breached ?? 0),
    };
  }

  /** active_count = ยังไม่ปิด (ภาระงานตอนนี้), total_count = รวม closed (สถิติสะสม) */
  async groupByDepartment(admin: AdminTb): Promise<DepartmentGroupRow[]> {
    const rows = await this.dashboardRepo.groupByDepartment(admin);
    return rows.map((row) => ({
      department_id: Number(row.department_id),
      department_name_th: row.department_name_th,
      active_count: Number(row.active_count),
      total_count: Number(row.total_count),
      open_count: Number(row.open_count),
      in_progress_count: Number(row.in_progress_count),
      waiting_count: Number(row.waiting_count),
      pending_confirmation_count: Number(row.pending_confirmation_count),
    }));
  }

  async groupByAssignee(admin: AdminTb): Promise<AssigneeGroupRow[]> {
    const rows = await this.dashboardRepo.groupByAssignee(admin);
    return rows.map((row) => ({
      assignee_id: row.assignee_id === null || row.assignee_id === undefined ? null : Number(row.assignee_id),
      assignee_name: row.assignee_id === null || row.assignee_id === undefined ? 'ยังไม่มอบหมาย' : row.assignee_name ?? '',
      active_count: Number(row.active_count),
      total_count: Number(row.total_count),
      open_count: Number(row.open_count),
      in_progress_count: Number(row.in_progress_count),
      waiting_count: Number(row.waiting_count),
      pending_confirmation_count: Number(row.pending_confirmation_count),
    }));
  }

  /**
   * ค่าเฉลี่ยเวลาตอบสนอง (response) และเวลาที่ใช้แก้ไข (resolution) กรองตามช่วง created_at (ไม่ส่ง from/to = ทั้งหมด)
   * - response time: created_at ถึงเวลากด "รับเคส" ครั้งแรก เฉพาะตั๋วที่เคยมีคนรับแล้วเท่านั้น
   * - resolution time: created_at ถึง resolved_at เฉพาะตั๋วที่ resolve แล้ว (ไม่รอผู้แจ้งกดยืนยันปิดเคส)
   */
  async analytics(admin: AdminTb, from?: Date, to?: Date): Promise<DashboardAnalytics> {
    const { response: responseRow, resolution: resolutionRow } = await this.dashboardRepo.analytics(admin, from, to);

    return {
      avg_response_minutes: responseRow?.avgMinutes ? Math.round(Number(responseRow.avgMinutes)) : null,
      avg_resolution_minutes: resolutionRow?.avgMinutes ? Math.round(Number(resolutionRow.avgMinutes)) : null,
      response_sample_size: Number(responseRow?.sampleSize ?? 0),
      resolution_sample_size: Number(resolutionRow?.sampleSize ?? 0),
    };
  }

  async trend(admin: AdminTb, from?: Date, to?: Date): Promise<TrendPoint[]> {
    const rows = await this.dashboardRepo.trend(admin, from, to);
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }
}
