// seed.js — insert demo data on first run (if profiles table is empty)
import { db } from './db.js';
import { hashPassword } from './auth.js';

export function seedIfEmpty() {
  const count = db.prepare('select count(*) as c from profiles').get().c;
  if (count > 0) return;

  console.log('[seed] empty database — inserting demo data');

  const pwd = hashPassword('demo123456');
  const insertProfile = db.prepare(`
    insert into profiles (id, email, password_hash, display_name, role)
    values (?, ?, ?, ?, ?)
  `);
  const profiles = [
    ['11111111-1111-1111-1111-111111111111', 'presales@demo.local', pwd, '王售前', 'presales'],
    ['22222222-2222-2222-2222-222222222222', 'pm@demo.local', pwd, '李项目经理', 'pm'],
    ['33333333-3333-3333-3333-333333333333', 'delivery@demo.local', pwd, '张交付', 'delivery'],
    ['44444444-4444-4444-4444-444444444444', 'postsales@demo.local', pwd, '赵售后', 'postsales'],
    ['55555555-5555-5555-5555-555555555555', 'admin@demo.local', pwd, 'Leo (管理员)', 'admin'],
  ];
  for (const p of profiles) insertProfile.run(...p);

  // 2 opportunities
  const opp1Id = 'aaaaaaa1-0000-0000-0000-000000000001';
  const opp2Id = 'aaaaaaa1-0000-0000-0000-000000000002';
  db.prepare(`
    insert into opportunities (id, name, customer, amount, stage, owner_id, presales_id)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(opp1Id, '某制造业园区网络安全升级', '某科技公司', 850000, 'proposal', profiles[0][0], profiles[0][0]);
  db.prepare(`
    insert into opportunities (id, name, customer, amount, stage, owner_id, presales_id)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(opp2Id, '金融客户数据中心扩容', '某银行', 2300000, 'won', profiles[0][0], profiles[0][0]);

  // Project (handover of won opportunity)
  const projectId = 'bbbbbbb1-0000-0000-0000-000000000001';
  db.prepare(`
    insert into projects (id, opportunity_id, name, pm_id, status, required_artifacts)
    values (?, ?, ?, ?, ?, ?)
  `).run(projectId, opp2Id, '该银行数据中心扩容', profiles[1][0], 'in_progress', '[]');

  // 3 milestones
  db.prepare(`
    insert into milestones (id, project_id, name, phase, due_date, status, "order")
    values (?, ?, ?, ?, date('now', '+7 days'), ?, ?)
  `).run('ccccccc1-0000-0000-0000-000000000001', projectId, '项目启动会', 'kickoff', 'done', 1);
  db.prepare(`
    insert into milestones (id, project_id, name, phase, due_date, status, "order")
    values (?, ?, ?, ?, date('now', '+21 days'), ?, ?)
  `).run('ccccccc1-0000-0000-0000-000000000002', projectId, '方案设计', 'design', 'in_progress', 2);
  db.prepare(`
    insert into milestones (id, project_id, name, phase, due_date, status, "order")
    values (?, ?, ?, ?, date('now', '+45 days'), ?, ?)
  `).run('ccccccc1-0000-0000-0000-000000000003', projectId, '设备到货验收', 'delivery', 'pending', 3);

  // 5 tasks
  const tasks = [
    ['ddddddd1-0000-0000-0000-000000000001', 'ccccccc1-0000-0000-0000-000000000001', profiles[1][0], '准备启动会议程', 1, '+5 days'],
    ['ddddddd1-0000-0000-0000-000000000002', 'ccccccc1-0000-0000-0000-000000000001', profiles[2][0], '发送邀请邮件给干系人', 1, '+6 days'],
    ['ddddddd1-0000-0000-0000-000000000003', 'ccccccc1-0000-0000-0000-000000000002', profiles[2][0], '网络拓扑图初稿', 0, '+14 days'],
    ['ddddddd1-0000-0000-0000-000000000004', 'ccccccc1-0000-0000-0000-000000000002', profiles[3][0], '防火墙策略评审', 0, '+18 days'],
    ['ddddddd1-0000-0000-0000-000000000005', 'ccccccc1-0000-0000-0000-000000000003', profiles[2][0], '联系供应商确认到货时间', 0, '+40 days'],
  ];
  for (const t of tasks) {
    db.prepare(`
      insert into tasks (id, milestone_id, assignee_id, title, done, due_date)
      values (?, ?, ?, ?, ?, date('now', ?))
    `).run(t[0], t[1], t[2], t[3], t[4], t[5]);
  }

  console.log('[seed] done. 5 demo users (all with password "demo123456") + sample data inserted.');
}
