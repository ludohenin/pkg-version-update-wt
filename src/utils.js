import request from 'request';
import {sprintf} from 'sprintf';
import {CONTENT_TYPE, MSG_UNSUPPORTED_CONTENT_TYPE} from './config';

export function verifyRequest(req, res, next) {
  const contentType = req.get(CONTENT_TYPE);
  if (contentType !== 'application/json')
    return badRequest(res, sprintf(MSG_UNSUPPORTED_CONTENT_TYPE, contentType));

  next();
}

export function internalServerError(res, responseMsg) {
  res.status(500).send(responseMsg);
}

export function badRequest(res, responseMsg) {
  res.status(400).send(responseMsg);
}

export function notFound(res, responseMsg) {
  res.status(404).send(responseMsg);
}

export function created(res, responseMsg) {
  res.status(201).send(responseMsg);
}

export function accepted(res, responseMsg) {
  res.status(202).send(responseMsg);
}

export function ok(res, responseMsg) {
  res.status(200).send(responseMsg);
}
