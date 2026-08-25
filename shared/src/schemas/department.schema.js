'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.departmentListSchema =
  exports.departmentSchema =
  exports.OTHER_DEPARTMENT_CODE =
    void 0;
const zod_1 = require('zod');
exports.OTHER_DEPARTMENT_CODE = 'other';
exports.departmentSchema = zod_1.z.object({
  department_id: zod_1.z.number().int(),
  department_code: zod_1.z.string(),
  department_name_en: zod_1.z.string(),
  department_name_th: zod_1.z.string(),
  is_active: zod_1.z.boolean(),
});
exports.departmentListSchema = zod_1.z.array(exports.departmentSchema);
//# sourceMappingURL=department.schema.js.map
