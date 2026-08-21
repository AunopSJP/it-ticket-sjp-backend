export type Department = {
  department_id: number;
  department_code: string;
  department_name_th: string;
  department_name_en: string;
  department_status: number;
  department_is_custom: number;
  department_create_date: Date;
  department_update_date: Date;
  department_delete_date: Date | null;
};

type Schema<T> = {
  parse: (value: unknown) => T;
};

type NumberSchema = Schema<number> & {
  int: () => NumberSchema;
  positive: () => NumberSchema;
};

type StringSchema = Schema<string> & {
  min: (length: number) => StringSchema;
};

type DateSchema = Schema<Date> & {
  nullable: () => Schema<Date | null>; // คืนค่าเป็น Schema<Date | null> เสมอ
};

const z = {
  object: <T extends Record<string, Schema<any>>>(shape: T) => ({
    parse: (value: unknown) => {
      const input = (value ?? {}) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(shape).map(([key, schema]) => [
          key,
          schema.parse(input[key]),
        ]),
      ) as {
        [K in keyof T]: T[K] extends Schema<infer U> ? U : never;
      };
    },
  }),
  number: (): NumberSchema => {
    const schema: NumberSchema = {
      int: () => schema,
      positive: () => schema,
      parse: (value: unknown) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new Error('Expected a number');
        }
        return parsed;
      },
    };

    return schema;
  },
  string: (): StringSchema => {
    const schema: StringSchema = {
      min: (length: number) => {
        void length;
        return schema;
      },
      parse: (value: unknown) => {
        if (typeof value !== 'string') {
          throw new Error('Expected a string');
        }
        return value;
      },
    };

    return schema;
  },
  coerce: {
    date: (): DateSchema => {
      const schema: DateSchema = {
        parse: (value: unknown) => new Date(value as string | number | Date),
        nullable: (): Schema<Date | null> => ({
          parse: (value: unknown) =>
            value === null || value === undefined
              ? null
              : new Date(value as string | number | Date),
        }),
      };

      return schema;
    },
  },
};

/** รูปร่างข้อมูล Department ที่ใช้ร่วมกันระหว่าง backend และ frontend */
export const departmentSchema = z.object({
  department_id: z.number().int().positive(),
  department_code: z.string().min(1),
  department_name_th: z.string().min(1),
  department_name_en: z.string().min(1),
  department_status: z.number().int(),
  department_is_custom: z.number().int(),
  department_create_date: z.coerce.date(),
  department_update_date: z.coerce.date(),
  department_delete_date: z.coerce.date().nullable(),
});
