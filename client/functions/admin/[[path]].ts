/**
 * Cloudflare Pages Function for `/admin/*`.
 *
 * The admin dashboard was restructured into grouped, tab-based pages
 * (`/admin/content`, `/admin/users`, `/admin/communication`,
 * `/admin/settings`, `/admin/audit`). Legacy URLs are 308-redirected to the
 * matching tab so existing bookmarks and links keep working. Everything else
 * under `/admin` is passed straight through to the static assets server.
 */

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);

  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

  const target = REDIRECTS[path];
  if (target) {
    return Response.redirect(new URL(target, url.origin), 308);
  }

  return env.ASSETS.fetch(request);
};

const REDIRECTS: Record<string, string> = {
  "/admin/quotes": "/admin/content?tab=quotes",
  "/admin/categories": "/admin/content?tab=categories",
  "/admin/hashtags": "/admin/content?tab=hashtags",
  "/admin/trash": "/admin/content?tab=trash",
  "/admin/bans": "/admin/users?tab=bans",
  "/admin/announcements": "/admin/communication?tab=announcements",
  "/admin/feedback": "/admin/communication?tab=feedback",
  "/admin/seo": "/admin/settings?tab=seo",
  "/admin/logs": "/admin/audit?tab=logs",
  "/admin/activity": "/admin/audit?tab=activity",
};