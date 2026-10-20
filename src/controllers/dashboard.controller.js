import * as statsService from '../services/stats.service.js';
import { ok } from '../utils/response.js';

export async function student(req, res) {
  ok(res, await statsService.studentDashboard(req.user));
}

export async function tutor(req, res) {
  ok(res, await statsService.tutorDashboard(req.user));
}

export async function admin(req, res) {
  ok(res, await statsService.adminDashboard(req.valid.query));
}
