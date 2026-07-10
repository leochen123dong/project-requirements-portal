-- ============================================================================
-- v0.4 Phase C: presales_id + delivery_id columns on opportunities
--
-- Adds two explicit role-specific owner columns:
--   - presales_id: which sales engineer is responsible for the lead
--     (typically = the creator, but can be transferred)
--   - delivery_id: which delivery engineer is assigned (NULL until
--     handover; set in the handover modal or manually by presales)
--
-- `owner_id` is kept for backwards compat (= the creator / original owner).
-- New code should prefer presales_id / delivery_id for role-specific
-- display.
-- ============================================================================

alter table public.opportunities
  add column if not exists presales_id uuid references public.profiles(id),
  add column if not exists delivery_id  uuid references public.profiles(id);

create index if not exists opportunities_presales_id_idx
  on public.opportunities(presales_id);
create index if not exists opportunities_delivery_id_idx
  on public.opportunities(delivery_id);

-- No new RLS policies needed: existing opportunities UPDATE policy
-- (presales+admin) already covers both columns (it's a generic UPDATE,
-- not column-specific).
