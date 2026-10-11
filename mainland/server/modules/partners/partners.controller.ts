import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import worker from './worker';

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
      { PUBLIC_SITE_ORIGIN: origin, FEISHU_WEBHOOK_URL: process.env.FEISHU_WEBHOOK_URL,
        FEISHU_SIGN_SECRET: process.env.FEISHU_SIGN_SECRET },
      { waitUntil: (p: Promise<unknown>): void => { void p; } },
    );
    response.headers.forEach((value: string, key: string): void => { res.setHeader(key, value); });
    res.status(response.status).send(await response.text());
  }
}
