import { ElMessageBox } from 'element-plus';

/**
 * Destructive-action confirm, used everywhere so delete dialogs look and read the
 * same across the admin.
 *
 * Uses `confirmButtonType` rather than the older `confirmButtonClass: 'el-button--danger'`
 * trick. That trick left the button carrying BOTH `el-button--primary` (from the
 * component's default `type`) and `el-button--danger`, two type classes of equal
 * specificity whose winner depends on the order Element Plus happens to emit them in.
 * `confirmButtonType` sets the button's actual type, so exactly one class applies.
 *
 * Resolves true when confirmed, false when dismissed — callers never need try/catch.
 */
export async function confirmDelete(
  label: string,
  options: { title?: string; note?: string; confirmText?: string } = {},
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(
      options.note ?? `ต้องการลบ "${label}" ใช่หรือไม่?`,
      options.title ?? 'ยืนยันการลบ',
      {
        type: 'warning',
        confirmButtonText: options.confirmText ?? 'ลบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonType: 'danger',
      },
    );
    return true;
  } catch {
    // Element Plus rejects on cancel and on backdrop/Escape dismissal alike.
    return false;
  }
}
