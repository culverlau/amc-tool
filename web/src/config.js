// UI-only gating for the admin screen — not itself security. The actual
// enforcement is RLS policies keyed on this same email, see
// supabase/migrations/0005_admin_rls.sql.
export const ADMIN_EMAIL = 'culverlau@gmail.com'
