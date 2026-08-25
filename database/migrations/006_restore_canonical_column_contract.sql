-- Repair naming variants introduced by incomplete schema renames.
-- Safe to run repeatedly: a column is renamed only when the variant exists
-- and the canonical target does not. No rows or columns are deleted.

DO $$
BEGIN
  IF to_regclass('public.admin_notification_tb') IS NOT NULL
     AND to_regclass('public.notification_tb') IS NULL THEN
    ALTER TABLE "admin_notification_tb" RENAME TO "notification_tb";
  END IF;
  IF to_regclass('public.user_tb') IS NOT NULL
     AND to_regclass('public.reporter_tb') IS NULL THEN
    ALTER TABLE "user_tb" RENAME TO "reporter_tb";
  END IF;
  IF to_regclass('public.user_notification_tb') IS NOT NULL
     AND to_regclass('public.reporter_notification_tb') IS NULL THEN
    ALTER TABLE "user_notification_tb" RENAME TO "reporter_notification_tb";
  END IF;
END $$;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('admin_tb', 'admin_status', 'admin_is_active'),
      ('admin_tb', 'admin_created_date', 'admin_create_date'),
      ('admin_tb', 'admin_update_date', 'admin_updated_date'),
      ('department_tb', 'department_no', 'department_code'),
      ('department_tb', 'department_status', 'department_is_active'),
      ('department_tb', 'department_custom', 'department_is_custom'),
      ('department_tb', 'department_create_date', 'department_created_at'),
      ('department_tb', 'department_update_date', 'department_updated_at'),
      ('reporter_tb', 'user_id', 'reporter_id'),
      ('reporter_tb', 'user_line_user_id', 'reporter_line_user_id'),
      ('reporter_tb', 'user_line_display_name', 'reporter_line_display_name'),
      ('reporter_tb', 'user_line_picture_url', 'reporter_line_picture_url'),
      ('reporter_tb', 'user_create_date', 'reporter_created_at'),
      ('reporter_tb', 'user_update_date', 'reporter_updated_at'),
      ('reporter_tb', 'reporter_line_id', 'reporter_line_user_id'),
      ('reporter_tb', 'reporter_create_date', 'reporter_created_at'),
      ('reporter_tb', 'reporter_update_date', 'reporter_updated_at'),
      ('symptom_tb', 'issue_id', 'symptom_id'),
      ('symptom_tb', 'issue_label', 'symptom_label'),
      ('symptom_tb', 'issue_is_manual', 'symptom_is_manual'),
      ('symptom_tb', 'issue_hit_count', 'symptom_hit_count'),
      ('symptom_tb', 'issue_last_seen_date', 'symptom_last_seen_at'),
      ('symptom_tb', 'issue_create_date', 'symptom_created_at'),
      ('symptom_tb', 'issue_update_date', 'symptom_updated_at'),
      ('ticket_tb', 'ticket_selected_issue', 'ticket_selected_symptoms'),
      ('ticket_tb', 'ticket_assigne_admin_id', 'ticket_assignee_admin_id'),
      ('ticket_tb', 'ticket_assign_admin_id', 'ticket_assignee_admin_id'),
      ('ticket_tb', 'user_id', 'reporter_id'),
      ('ticket_tb', 'ticket_closed_date', 'ticket_closed_at'),
      ('ticket_tb', 'ticket_sla_warning_notified_date', 'ticket_sla_warning_notified_at'),
      ('ticket_tb', 'ticket_sla_breach_notified_date', 'ticket_sla_breach_notified_at'),
      ('ticket_tb', 'ticket_wait_started_date', 'ticket_wait_started_at'),
      ('ticket_tb', 'ticket_resolved_date', 'ticket_resolved_at'),
      ('ticket_tb', 'ticket_create_date', 'ticket_created_at'),
      ('ticket_tb', 'ticket_update_date', 'ticket_updated_at'),
      ('ticket_image_tb', 'ticket_image_create_date', 'ticket_image_created_at'),
      ('ticket_history_tb', 'ticket_history_create_date', 'ticket_history_created_at'),
      ('notification_tb', 'admin_notification_id', 'notification_id'),
      ('notification_tb', 'admin_notification_recipient_admin_id', 'notification_recipient_admin_id'),
      ('notification_tb', 'admin_notification_message', 'notification_message'),
      ('notification_tb', 'admin_notification_is_read', 'notification_is_read'),
      ('notification_tb', 'admin_notification_create_date', 'notification_created_at'),
      ('reporter_notification_tb', 'user_notification_id', 'reporter_notification_id'),
      ('reporter_notification_tb', 'user_id', 'reporter_id'),
      ('reporter_notification_tb', 'user_notification_message', 'reporter_notification_message'),
      ('reporter_notification_tb', 'user_notification_is_read', 'reporter_notification_is_read'),
      ('reporter_notification_tb', 'user_notification_create_date', 'reporter_notification_created_at'),
      ('reporter_notification_tb', 'reporter_notification_create_date', 'reporter_notification_created_at'),
      ('ticket_message_tb', 'sender_user_id', 'sender_reporter_id'),
      ('ticket_message_tb', 'ticket_message_sender_reporter_id', 'sender_reporter_id'),
      ('ticket_message_tb', 'ticket_message_sender_admin_id', 'sender_admin_id'),
      ('ticket_message_tb', 'ticket_message_create_date', 'ticket_message_created_at'),
      ('ticket_comment_tb', 'ticket_comment_admin_id', 'admin_id'),
      ('ticket_comment_tb', 'ticket_comment_create_date', 'ticket_comment_created_at'),
      ('audit_log_tb', 'audit_log_admin_id', 'admin_id'),
      ('audit_log_tb', 'audit_log_create_date', 'audit_log_created_at'),
      ('sheet_sync_queue_tb', 'sheet_sync_queue_next_retry_date', 'sheet_sync_queue_next_retry_at'),
      ('sheet_sync_queue_tb', 'sheet_sync_queue_synced_date', 'sheet_sync_queue_synced_at'),
      ('sheet_sync_queue_tb', 'sheet_sync_queue_create_date', 'sheet_sync_queue_created_at'),
      ('sheet_sync_queue_tb', 'sheet_sync_queue_update_date', 'sheet_sync_queue_updated_at'),
      ('image_sync_queue_tb', 'image_sync_queue_next_retry_date', 'image_sync_queue_next_retry_at'),
      ('image_sync_queue_tb', 'image_sync_queue_synced_date', 'image_sync_queue_synced_at'),
      ('image_sync_queue_tb', 'image_sync_queue_create_date', 'image_sync_queue_created_at'),
      ('image_sync_queue_tb', 'image_sync_queue_update_date', 'image_sync_queue_updated_at')
    ) AS variants(table_name, source_name, target_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = item.table_name
        AND column_name = item.source_name
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = item.table_name
        AND column_name = item.target_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME COLUMN %I TO %I',
        item.table_name,
        item.source_name,
        item.target_name
      );
    END IF;
  END LOOP;
END $$;

