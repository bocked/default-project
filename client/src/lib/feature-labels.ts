/**
 * Fallback UI labels for the AdminFeature registry. The DB row's `label` is
 * preferred, but a hard-coded fallback keeps older panels rendering even if a
 * feature row is not yet registered (e.g. during first boot).
 */
export const FEATURE_FALLBACK_LABELS: Record<string, string> = {
  canViewUsers: "Foydalanuvchilar ro'yxati",
  canManageUsers: "Foydalanuvchilarni boshqarish",
  canManageQuotes: "Iqtiboslar moderatsiyasi",
  canManageCategories: "Kategoriya va teglar",
  canManageQuizzes: "Testlar moduli",
  canManageAnnouncements: "E'lonlar",
  canManageFeedback: "Fikr-mulohaza",
  canManageSettings: "Sayt sozlamalari",
  canViewAudit: "Audit jurnali",
};