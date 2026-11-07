/**
 * extract-seed.mjs — 从 DayDesk（桌面日程平台）的 daydesk 备份数据中提取真实事项，
 * 转换为「每日计划」手机 App 的初始任务（seed-data.json）。
 *
 * 注意：本脚本对源文件夹【只读】，输出仅写入本目录。
 * 源数据：C:\Users\30820\Desktop\AI\dsh\桌面日程平台\.daydesk-verify\data\backups\auto\auto-20261022-224940.json
 *   （该备份含 305 条任务 + 512 条日程，绝大多数为「批量待办/批量日程」自检测试数据）
 *
 * 提取规则：
 *   1. 过滤掉标题以「批量」开头的测试数据与已删除数据；
 *   2. 真实任务直接继承（daydesk 的任务本身全是测试数据，故真实内容主要来自日程）；
 *   3. 日程 → 每日任务：取开始日期为计划日期，备注/优先级/标签继承；
 *   4. 「每日站会」是每日重复日程，改为落在"今天"；
 *   5. 过去的事项默认视为已完成（completedAt 取当天 18:00），
 *      但保留「团建活动」「夜间值班」为未完成，用于演示「未完成顺延」。
 *
 * 运行：node extract-seed.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC =
  'C:/Users/30820/Desktop/AI/dsh/桌面日程平台/.daydesk-verify/data/backups/auto/auto-20261022-224940.json';
const HERE = dirname(fileURLToPath(import.meta.url));

// 「今日」基准：提取时按运行当天计算
const today = new Date();
const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = fmt(today);

// 演示「未完成顺延」而特意保留的过去事项
const KEEP_UNDONE = new Set(['团建活动', '夜间值班']);

const bundle = JSON.parse(readFileSync(SRC, 'utf8'));
const tagName = new Map(bundle.tags.map((t) => [t.id, t.name]));
const out = [];

const push = (o) =>
  out.push({
    id: o.id,
    title: o.title,
    notes: o.notes || '',
    date: o.date,
    priority: o.priority ?? null, // low | medium | high | null
    tag: o.tag ?? null,
    done: !!o.done,
    completedAt: o.completedAt ?? null,
    createdAt: o.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

// 1) 备份中的真实任务（daydesk tasks 里全是批量测试数据，这里仍按规则过滤以防万一）
for (const t of bundle.tasks || []) {
  if (t.deletedAt) continue;
  if (/^批量/.test(t.title)) continue;
  push({
    id: t.id,
    title: t.title,
    notes: t.notes,
    date: t.dueDate || TODAY,
    priority: t.priority,
    tag: null,
    done: !!t.completedAt,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
  });
}

// 2) 真实日程 → 每日任务
for (const e of bundle.events || []) {
  if (e.deletedAt) continue;
  if (/^批量/.test(e.title)) continue;
  const recurring = e.recurrence && e.recurrence.freq && e.recurrence.freq !== 'none';
  // 每日重复的日程（如「每日站会」）落在今天
  const date = recurring && /每[日天]/.test(e.title) ? TODAY : e.startAt.slice(0, 10);
  const tags = (e.tagIds || []).map((id) => tagName.get(id)).filter(Boolean);
  const done = date < TODAY && !KEEP_UNDONE.has(e.title);
  push({
    id: e.id,
    title: e.title,
    notes: e.notes,
    date,
    priority: e.priority,
    tag: tags[0] || null,
    done,
    completedAt: done ? `${date}T18:00:00` : null,
    createdAt: e.createdAt,
  });
}

// 日期排序 + 去重（同一标题同一天只留一条）
const seen = new Set();
const tasks = out
  .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))
  .filter((t) => {
    const k = t.date + '|' + t.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

const seed = {
  schemaVersion: 1,
  app: '每日计划',
  source: 'DayDesk（桌面日程平台）daydesk 备份 auto-20261022-224940.json，仅提取非批量真实事项',
  seededAt: new Date().toISOString(),
  today: TODAY,
  tasks,
};

writeFileSync(join(HERE, 'seed-data.json'), JSON.stringify(seed, null, 2), 'utf8');

console.log(`提取完成：共 ${tasks.length} 条真实任务（基准今天 = ${TODAY}）`);
for (const t of tasks) {
  console.log(
    `  [${t.date}] ${t.done ? 'x' : ' '} ${t.title}${t.tag ? ' #' + t.tag : ''}${
      t.priority ? ' !' + t.priority : ''
    }${t.notes ? ' — ' + t.notes : ''}`
  );
}
