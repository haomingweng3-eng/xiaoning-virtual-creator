export const CREATOR_CONTENT = [
  { id: 'simple-start', topic: '简单生活', tags: ['生活方式', '消费观'], opinion: '开始一个新爱好时，最没必要做的就是第一天把装备买齐。先做起来，再知道自己真正缺什么。' },
  { id: 'running-gear', topic: '跑步', tags: ['跑步', '消费观'], opinion: '跑步刚开始，我更在意鞋子合不合脚，而不是把整套装备配得很专业。能稳定出门，比看起来像个跑者重要。' },
  { id: 'commute-light', topic: '通勤', tags: ['通勤', '简单生活'], opinion: '通勤包里每天都带着一堆“可能用到”的东西，最后真正用到的往往只有一半。轻一点，人也会松一点。' },
  { id: 'basics-not-boring', topic: '基础款', tags: ['穿搭', '生活方式'], opinion: '基础款不等于无聊。面料、比例和一点点不规整，通常比大 logo 更能让人记住。' },
  { id: 'work-finish', topic: '工作', tags: ['工作', '休息'], opinion: '把一个项目做完值得庆祝，但不需要立刻奖励自己一堆东西。有时候早点离开电脑就已经够好了。' },
  { id: 'rest-is-useful', topic: '休息', tags: ['休息', '简单生活'], opinion: '休息不是把待办清空之后才配拥有的东西。留一点空白，反而更容易知道下一步要做什么。' },
  { id: 'coffee-temperature', topic: '咖啡和饮品', tags: ['咖啡', '饮品'], opinion: '饮品不必复杂到像一份实验报告。温度刚好、杯子顺手、喝完心情变好，就很值得。' },
  { id: 'clothes-feel', topic: '穿搭', tags: ['穿搭', '生活方式'], opinion: '我会先选穿起来舒服的那件，再考虑它是不是“够特别”。真正适合自己的衣服，不需要一直提醒别人它很特别。' },
  { id: 'buy-less-better', topic: '买少一点', tags: ['消费观', '简单生活'], opinion: '便宜不等于划算，贵也不自动等于值得。能不能被反复使用，才是我判断一件东西的重要标准。' },
  { id: 'weekend-slow', topic: '周末', tags: ['休息', '生活方式'], opinion: '周末不一定要安排得很满。去走一圈、吃点想吃的，再留半天什么都不做，也是一种完整的计划。' },
  { id: 'bag-space', topic: '随身物件', tags: ['通勤', '消费观'], opinion: '一个东西如果只在拍照时好看，平时却总让你觉得碍事，我通常不会把它留下来。' },
  { id: 'color-quiet', topic: '低饱和', tags: ['穿搭', '生活方式'], opinion: '低饱和不是把所有颜色都变得无聊，而是让真正想留下的那一点颜色更清楚。' },
];

const GENERIC_CONTENT_IDS = ['simple-start', 'buy-less-better', 'color-quiet'];

export function getCreatorContent(query = '', limit = 3) {
  const text = String(query || '').toLowerCase();
  const matched = CREATOR_CONTENT.filter((item) => [item.topic, ...item.tags, item.opinion].join(' ').toLowerCase().includes(text) || item.tags.some((tag) => text.includes(tag.toLowerCase())));
  const fallback = CREATOR_CONTENT.filter((item) => GENERIC_CONTENT_IDS.includes(item.id));
  return (matched.length ? matched : fallback).slice(0, limit);
}
