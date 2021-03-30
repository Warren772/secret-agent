import Log from '@secret-agent/commons/Logger';
import IResourceHeaders from '@secret-agent/core-interfaces/IResourceHeaders';
import IMitmRequestContext from '../interfaces/IMitmRequestContext';
import ResourceState from '../interfaces/ResourceState';

const { log } = Log(module);

export default class CookieHandler {
  public static async setProxyToServerCookies(ctx: IMitmRequestContext): Promise<void> {
    ctx.setState(ResourceState.SetCookieHeader);
    const session = ctx.requestSession;
    if (!session || !session.networkInterceptorDelegate?.http.cookieHeader) return;
    // never send cookies to preflight requests
    if (ctx.method === 'OPTIONS') return;

    const cookieHeader = await session.networkInterceptorDelegate.http.cookieHeader(ctx);
    setCookies(ctx.requestHeaders, cookieHeader);
  }

  public static async readServerResponseCookies(ctx: IMitmRequestContext): Promise<void> {
    ctx.setState(ResourceState.ReadResponseCookies);
    const session = ctx.requestSession;
    if (!session || !session.networkInterceptorDelegate?.http.onSetCookie) return;

    if (ctx.resourceType === 'Document' && ctx.status === 200) {
      await session.networkInterceptorDelegate.http.onOriginHasFirstPartyInteraction(ctx.url.href);
    }

    let cookies = ctx.responseHeaders['set-cookie'] ?? ctx.responseHeaders['Set-Cookie'] ?? [];
    if (!Array.isArray(cookies)) cookies = [cookies];

    for (const setCookie of cookies) {
      try {
        await session.networkInterceptorDelegate.http.onSetCookie(setCookie, ctx, ctx.status);
      } catch (error) {
        log.warn('Could not set cookie', { sessionId: ctx.requestSession.sessionId, error });
      }
    }
  }
}

function setCookies(headers: IResourceHeaders, cookieHeader: string): void {
  const existingCookies = (headers.Cookie ?? headers.cookie) || '';
  if (existingCookies !== cookieHeader) {
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    } else {
      delete headers.Cookie;
    }
  }
}
