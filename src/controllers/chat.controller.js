import * as chatService from '../services/chat.service.js';
import { created, ok } from '../utils/response.js';

const token = (req) => req.headers['x-chat-token'];

/* Visitor */
export async function start(req, res) {
  created(res, await chatService.start(req.body, req.user), 'Chat started');
}

export async function poll(req, res) {
  const session = await chatService.sessionForToken(token(req));
  ok(res, await chatService.snapshot(session, req.valid.query.after));
}

export async function send(req, res) {
  const session = await chatService.sessionForToken(token(req));
  created(res, await chatService.sendFromVisitor(session, req.body.body), 'Sent');
}

/* Admin */
export async function list(req, res) {
  const { items, meta } = await chatService.listSessions(req.valid.query);
  ok(res, items, { meta });
}

export async function thread(req, res) {
  ok(res, await chatService.adminThread(req.params.id));
}

export async function reply(req, res) {
  created(res, await chatService.adminReply(req.params.id, req.user, req.body.body), 'Sent');
}

export async function setStatus(req, res) {
  ok(res, await chatService.setStatus(req.params.id, req.body.status));
}
