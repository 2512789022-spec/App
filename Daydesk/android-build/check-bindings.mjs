// 审计：所有应有的事件绑定是否真的存在于 index.html
import { readFileSync } from 'node:fs';
const h = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const expected = [
  ['$focusRangeSeg 统计区间切换', "$('focusRangeSeg')"],
  ['tabbar 标签切换', ".tabbar .tab')"],
  ['添加任务按钮', "$('btnAdd')"],
  ['输入框回车', "$('newTask')"],
  ['全部顺延', "$('btnCarryAll')"],
  ['已完成折叠', "$('doneToggle')"],
  ['设置打开', "$('btnSettings')"],
  ['主题切换', "$('themeSeg')"],
  ['强调色选择', "$('accentSwatches')"],
  ['专注开始/结束', "$('btnFocusToggle')"],
  ['专注迷你条', "$('focusMini')"],
  ['长期编辑标题', "$('goalTitle')"],
  ['长期编辑备注', "$('goalNotes')"],
  ['长期开始日期', "$('goalStart')"],
  ['长期结束日期', "$('goalEnd')"],
  ['长期打卡开始网格', "$('goalTimeStartGrid')"],
  ['长期打卡结束网格', "$('goalTimeEndGrid')"],
  ['长期编辑完成', "$('btnGoalDone')"],
  ['长期编辑删除', "$('btnGoalDelete')"],
  ['每日提醒开关', "$('reminderSeg')"],
  ['提醒滚动选择器', "$('wheelH')"],
  ['测试通知', "$('btnTestNotify')"],
  ['编辑标题', "$('editTitle')"],
  ['编辑备注', "$('editNotes')"],
  ['编辑日期', "$('editDate')"],
  ['编辑优先级', "$('editPri')"],
  ['编辑完成', "$('btnEditDone')"],
  ['编辑删除', "$('btnDelete')"],
  ['导出', "$('btnExport')"],
  ['复制', "$('btnCopy')"],
  ['导入', "$('btnImport')"],
  ['清空', "$('btnClear')"],
  ['文件选择', "$('importFile')"],
];
let missing = 0;
for (const [name, sig] of expected) {
  const ok = h.includes(sig);
  if (!ok) { missing++; console.log('❌ 缺失:', name, '—', sig); }
}
console.log(missing === 0 ? '✅ 全部绑定齐全' : `共 ${missing} 个缺失`);
