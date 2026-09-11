import type { Request, Response } from 'express';
import type { JooxVoteAccount } from '@cms/shared';

/**
 * Live updates for the JOOX checklist, as server-sent events. Each phone with the page open
 * holds one stream; every add, tap, done, missing and delete is written to all of them the
 * moment it lands, so a tap on one phone shows on the others without waiting for a poll.
 *
 * The streams live in this process's memory, so a change reaches the phones connected to
 * this process. That is every phone while pm2 runs a single instance (ecosystem.config.cjs);
 * with more, a phone would see the others' changes at its next poll instead.
 */

/** A ceiling on open streams, so a script opening them by the thousand can't eat the box. */
const MAX_STREAMS = 1000;
/** Well inside the 60s after which proxies commonly drop a connection that has gone quiet. */
const HEARTBEAT_MS = 25_000;

const streams = new Set<Response>();
let shuttingDown = false;

export type JooxVoteEvent =
  | { type: 'account'; account: JooxVoteAccount }
  | { type: 'removed'; id: number };

export function openJooxVoteStream(req: Request, res: Response): void {
  // Any answer but a stream would stop the browser retrying; a dropped connection has it try
  // again shortly — by which time the new process is up.
  if (shuttingDown) {
    req.socket.destroy();
    return;
  }
  // Past the ceiling the page keeps working on its poll; a non-200 also tells the browser's
  // EventSource not to keep reconnecting.
  if (streams.size >= MAX_STREAMS) {
    res.status(503).end();
    return;
  }

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    // `no-transform` keeps the compression middleware from buffering events to gzip them.
    'Cache-Control': 'no-cache, no-transform',
    // The connection ends with the stream. Kept alive, the browser reconnects over the same
    // socket, and a server shutting down still answers requests on sockets it already has.
    Connection: 'close',
    // nginx, if one is ever put in front, would otherwise hold events back in its buffer.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  // How long the browser waits before reconnecting after a drop.
  res.write('retry: 5000\n\n');

  streams.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    streams.delete(res);
  });
}

export function broadcastJooxVote(event: JooxVoteEvent): void {
  const frame =
    event.type === 'account'
      ? `event: account\ndata: ${JSON.stringify(event.account)}\n\n`
      : `event: removed\ndata: ${JSON.stringify({ id: event.id })}\n\n`;
  for (const res of streams) res.write(frame);
}

/** Streams never finish on their own, so a graceful shutdown ends them itself. */
export function closeJooxVoteStreams(): void {
  shuttingDown = true;
  for (const res of streams) res.end();
  streams.clear();
}
