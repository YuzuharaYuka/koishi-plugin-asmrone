import { Context } from 'koishi'
import { CommandHandler, orderKeys } from './handler'

export function registerSearchCommand(ctx: Context, handler: CommandHandler) {
  ctx.command('搜音声 <query...>', '搜索音声作品')
    .usage(
`搜音声 <关键词> [筛选条件] [排序方式] [页码]

关键词: 直接输入，多个词用空格分隔。
筛选条件: 使用 key:value 格式。
排序条件: 使用 order:排序值 格式。
页码: 指令末尾的单个数字。

筛选条件 (key:value):
  tag: 标签 (tag:舔耳)
  va: 声优 (va:藤田茜)
  circle: 社团 (circle:C-Lab.)
  rate: 评分 (rate:4.5, 表示>=4.5)
  sell: 销量 (sell:1000, 表示>=1000)
  price: 价格(日元) (price:1000, 表示>=1000)
  age: 年龄分级 (可选: general, r15, adult)
  lang: 语言 (可选: JPN, ENG, CHI_HANS 等)
排除筛选: 在 key 前加 - (减号)，如 -tag:男性向け

排序方式 (order:值)
可用排序值:
${orderKeys.join(', ')}`
    )
    .example('搜音声 藤田茜')
    .example('搜音声 山田 tag:舔耳 order:发售日 2')
    .action(async ({ session }, ...query) => {
      return handler.handleSearch(session, query.join(' '));
    });
}