// --- START OF FILE src/services/interaction.ts ---

import { Context, Session } from 'koishi'
import { Config } from '../config'

// 监听特定用户在特定上下文中的下一条消息，并处理超时。
export class InteractionManager {
  private ctx: Context
  private config: Config
  private session: Session

  constructor(ctx: Context, config: Config, session: Session) {
    this.ctx = ctx
    this.config = config
    this.session = session
  }

  // 等待用户的下一条消息，若超时则返回 null。
  public waitForMessage(): Promise<string | null> {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout;

      // 注册一个临时的、一次性的中间件来捕获用户的下一条消息。
      const dispose = this.ctx.middleware(async (midSession, next) => {
        // 确保是来自同一个用户和同一个频道的响应
        if (midSession.userId !== this.session.userId || midSession.channelId !== this.session.channelId) {
          return next();
        }

        // 成功获取到消息，清理定时器和中间件
        clearTimeout(timer);
        dispose();
        resolve(midSession.content);

      }, true); // `true` 表示将中间件前置，确保它能最先处理消息

      // 设置超时逻辑
      timer = setTimeout(() => {
        dispose(); // 超时后，同样注销中间件
        resolve(null); // 以 null 来表示超时
      }, this.config.interactionTimeout * 1000);
    });
  }
}
// --- END OF FILE src/services/interaction.ts ---