// --- START OF FILE src/services/interaction.ts ---

import { Context, Session } from 'koishi'
import { Config } from '../config'

/**
 * 一个用于管理用户交互会话的辅助类。
 * 它可以监听特定用户在特定上下文中的下一条消息，并处理超时。
 */
export class InteractionManager {
  private ctx: Context
  private config: Config
  private session: Session

  constructor(ctx: Context, config: Config, session: Session) {
    this.ctx = ctx
    this.config = config
    this.session = session
  }

  /**
   * 等待用户的下一条消息。
   * @returns {Promise<string | null>} 返回用户发送的消息内容，如果超时则返回 null。
   */
  public waitForMessage(): Promise<string | null> {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout;

      // 注册一个临时的、一次性的中间件
      const dispose = this.ctx.middleware(async (midSession, next) => {
        // 确保是同一个用户、同一个频道/私聊
        if (midSession.userId !== this.session.userId || midSession.channelId !== this.session.channelId) {
          return next();
        }

        // 成功获取到消息
        clearTimeout(timer); // 清除超时定时器
        dispose();           // 立即注销中间件
        resolve(midSession.content); // 用消息内容解析 Promise

      }, true); // `true` 表示将中间件前置，优先处理

      // 设置超时逻辑
      timer = setTimeout(() => {
        dispose();   // 超时后，同样注销中间件
        resolve(null); // 以 null 解析 Promise，表示超时
      }, this.config.interactionTimeout * 1000);
    });
  }
}