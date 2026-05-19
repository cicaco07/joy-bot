import { Middleware } from 'grammy';

export function createLoggingMiddleware(): Middleware {
  return async (ctx, next) => {
    const text = ctx.message?.text?.slice(0, 80) ?? '(no text)';
    console.log(`[${new Date().toISOString()}] update=${ctx.update.update_id} chat=${ctx.chat?.id} text=${text}`);
    await next();
  };
}
