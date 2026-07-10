// routes/dashboard.js — KPI stats for admin dashboard
import { Router } from 'express';
import { db } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

/** GET /api/dashboard/stats — admin only */
router.get('/stats', requireRole('admin'), (req, res) => {
  const inFlight = db.prepare(`select count(*) c from projects where status = 'in_progress'`).get().c;
  const overdueTasks = db.prepare(`select count(*) c from tasks where done = 0 and due_date is not null and date(due_date) < date('now')`).get().c;
  const upcomingMilestones = db.prepare(`
    select count(*) c from milestones
    where date(due_date) between date('now') and date('now', '+7 days')
  `).get().c;
  const openTasks = db.prepare(`select count(*) c from tasks where done = 0`).get().c;
  const recentAudit = db.prepare(`
    select a.id, a.actor_id, a.action, a.entity, a.entity_id, a.payload, a.at, p.display_name as actor_name
    from audit_log a left join profiles p on p.id = a.actor_id
    order by a.at desc limit 10
  `).all();
  res.json({
    inFlight,
    overdueTasks,
    upcomingMilestones,
    openTasks,
    avgLoad: openTasks > 0 ? +(openTasks / Math.max(1, db.prepare('select count(distinct assignee_id) c from tasks where done = 0').get().c)).toFixed(1) : 0,
    recentAudit,
  });
});

/** GET /api/dashboard/ithub-sync — last sync (admin only) */
router.get('/ithub-sync', requireRole('admin'), (req, res) => {
  const last = db.prepare('select * from ithub_sync_log order by ran_at desc limit 1').get();
  res.json(last || null);
});

export default router;
