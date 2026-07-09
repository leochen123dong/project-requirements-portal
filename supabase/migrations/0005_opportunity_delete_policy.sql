-- ============================================================================
-- v0.2 Phase E: Opportunity delete policy
--
-- Adds DELETE policy on opportunities for presales + admin.
-- (Owner + admin was already there; presales gets broader scope so any
-- presales can delete any opportunity during testing.)
-- ============================================================================

drop policy if exists "opportunities_delete_presales_admin" on public.opportunities;

create policy "opportunities_delete_presales_admin"
  on public.opportunities for delete
  to authenticated
  using (public.current_role() in ('presales','admin'));