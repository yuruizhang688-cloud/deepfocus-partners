import { Body, Controller, Get, Options, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import worker from './worker';

const PAGES_ORIGIN: string = 'https://yuruizhang688-cloud.github.io';

@Controller()
export class PartnersController {
  @Get(['/', 'index.html', 'style.css', 'app.js', 'brand-assets/:filename'])
  async page(@Req() req: Request, @Res() res: Response): Promise<void> {
    const basePath: string = (process.env.CLIENT_BASE_PATH || '').replace(/\/$/, '');
    const path: string = req.path.slice(basePath.length) || '/';
    if (path === '/' && basePath && !req.path.endsWith('/')) {
      res.redirect(302, basePath + '/');
      return;
    }
    const response: globalThis.Response = await worker.fetch(
      new globalThis.Request('https://assets.local' + path, { method: req.method }),
      {}, { waitUntil: (p: Promise<unknown>): void => { void p; } },
    );
    response.headers.forEach((value: string, key: string): void => { res.setHeader(key, value); });
    res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  }

  // The user explicitly requires anonymous prospective partners to submit this form.
  // Platform CSRF and the reviewed Origin/field/quota checks remain active.
  @Post('api/consult')
  async consult(@Req() req: Request, @Res() res: Response, @Body() body: unknown): Promise<void> {
    await this.deliver(req, res, body);
  }

  // An anonymous, cookie-free endpoint for the public GitHub Pages form.
  // The existing /api/* routes retain the platform's double-submit CSRF checks.
  @Options('public/consult')
  preflight(@Req() req: Request, @Res() res: Response): void {
    if (!this.pagesOrigin(req, res)) return;
    const requestedHeaders: string[] = (req.get('access-control-request-headers') || '')
      .toLowerCase().split(',').map((key: string): string => key.trim()).filter(Boolean);
    if (req.get('access-control-request-method') !== 'POST' || requestedHeaders.some((key: string): boolean => key !== 'content-type')) {
      res.status(403).json({ ok: false, code: 'invalid_preflight', message: '请从合作页面提交咨询。' });
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
  }

  @Post('public/consult')
  async pagesConsult(@Req() req: Request, @Res() res: Response, @Body() body: unknown): Promise<void> {
    if (!this.pagesOrigin(req, res)) { req.body = undefined; return; }
    await this.deliver(req, res, body, PAGES_ORIGIN);
  }

  private pagesOrigin(req: Request, res: Response): boolean {
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.get('origin') !== PAGES_ORIGIN) {
      res.status(403).json({ ok: false, code: 'invalid_origin', message: '请从合作页面提交咨询。' });
      return false;
    }
    res.setHeader('Access-Control-Allow-Origin', PAGES_ORIGIN);
    return true;
  }

  private async deliver(req: Request, res: Response, body: unknown, crossSiteOrigin?: string): Promise<void> {
    const encodedBody: string | undefined = JSON.stringify(body);
    // The platform records req.body after the handler; keep personal data out of that trace.
    req.body = undefined;
    const origin: string = process.env.PUBLIC_SITE_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const headers: Headers = new Headers();
    for (const key of ['origin', 'content-type', 'sec-fetch-site', 'content-length']) {
      const value: string | undefined = req.get(key);
      if (value) headers.set(key, value);
    }
    headers.set('CF-Connecting-IP', req.ip || req.socket.remoteAddress || 'anonymous');
    const response: globalThis.Response = await worker.fetch(
      new globalThis.Request(origin + '/api/consult', {
        method: 'POST', headers, body: encodedBody,
      }),
      { PUBLIC_SITE_ORIGIN: origin, PUBLIC_CROSS_SITE_ORIGIN: crossSiteOrigin,
        FEISHU_WEBHOOK_URL: process.env.FEISHU_WEBHOOK_URL,
        FEISHU_SIGN_SECRET: process.env.FEISHU_SIGN_SECRET },
      { waitUntil: (p: Promise<unknown>): void => { void p; } },
    );
    response.headers.forEach((value: string, key: string): void => { res.setHeader(key, value); });
    res.status(response.status).send(await response.text());
  }
}
