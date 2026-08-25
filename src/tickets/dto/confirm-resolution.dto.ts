import { confirmResolutionSchema, ConfirmResolutionInput } from '@it-ticket/shared';

/** backend verify token กับ LINE เองแล้วเทียบกับเจ้าของตั๋วก่อนอนุญาตให้ปิดงาน
 *  กันคนที่เดา ticket_id ได้ปลอม line_user_id มากดปิดตั๋วคนอื่น */
export { confirmResolutionSchema };
export type ConfirmResolutionDto = ConfirmResolutionInput;
