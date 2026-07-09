-- ============================================================================
-- v0.3 Phase B: presales can read opportunity audit_log
--
-- Currently audit_log is admin-only (see 0002_rls.sql). For the opportunity
-- detail page's "journal" timeline to work, presales need to see their own
-- opportunity changes (the trigger fires automatically on UPDATE; we just
-- need the read policy).
--
-- Simplification: presales can read ALL audit_log rows where entity =
-- 'opportunities' (mirrors the opportunities SELECT policy which is also
-- "all authenticated"). Tightening to "my own opportunities" can come later.
-- ============================================================================

create policy "audit_log_select_presales_opportunities"
  on public.audit_log for select
  to authenticated
  using (
    public.current_role() = 'presales'
    and entity = 'opportunities'
  );