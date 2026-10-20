import type { IconDefinition } from './types/studio'
// 对应 MAS 正式版可见的十个菜单，另保留通用默认图标。
export const iconSet: readonly IconDefinition[] = Object.freeze(
  [
    {
      key: 'default',
      label: '默认图标',
      purpose: '未单独指定图标时使用的通用标识',
      subject: '一个简洁的四角星或闪光符号，避免使用其他菜单的专属符号',
    },
    {
      key: 'home',
      label: '主页',
      purpose: '应用首页与总览入口',
      subject: '一座简洁的小房屋，突出屋顶与门，表达返回首页',
    },
    {
      key: 'scripts',
      label: '托管管理',
      purpose: '管理自动化脚本与托管任务',
      subject: '一张带播放三角的任务文档，表达自动执行脚本',
    },
    {
      key: 'plans',
      label: '计划管理',
      purpose: '安排自动运行计划与时间',
      subject: '一个带日期格和勾选记号的日历，表达计划安排',
    },
    {
      key: 'emulators',
      label: '模拟器管理',
      purpose: '管理安卓模拟器与设备',
      subject: '一台竖向手机或模拟器设备，屏幕中有简洁的游戏手柄符号',
    },
    {
      key: 'queue',
      label: '调度队列',
      purpose: '查看按顺序等待执行的任务',
      subject: '三条上下排列的任务列表与顺序指示箭头，表达有序排队',
    },
    {
      key: 'scheduler',
      label: '调度中心',
      purpose: '控制整体任务调度与运行',
      subject: '一个带控制节点或滑块的调度面板，表达统一调度，区别于列表和日历',
    },
    {
      key: 'gameSign',
      label: '游戏社区',
      purpose: '游戏社区与签到入口',
      subject: '一个带勾选标记的签到印章，表达社区签到',
    },
    {
      key: 'history',
      label: '历史记录',
      purpose: '回顾过去的任务执行记录',
      subject: '一只带逆时针回转箭头的时钟，表达历史记录',
    },
    {
      key: 'themeStore',
      label: '资源商店',
      purpose: '浏览和使用主题等外观资源',
      subject: '一个带画笔或色块的调色盘，表达主题与外观资源',
    },
    {
      key: 'settings',
      label: '设置',
      purpose: '调整软件的配置选项',
      subject: '一个轮廓清晰的齿轮，表达配置与设置',
    },
  ].map((item) => Object.freeze(item)),
)
