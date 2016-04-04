import {sprintf} from 'sprintf';
import {EVENT_HEADER, MSG_UNHANDLED_EVENT, MSG_NOT_FOUND} from './config';
import {accepted, notFound, ok, internalServerError} from './utils';
import {processReleaseUpdate, handleDeleteEvent} from './events_handler';

export function handleEvent(req, res, next) {
  const CONFIG = {
    EVENT_PAYLOAD: req.body,
    GITHUB_API_KEY: req.webtaskContext.data.GITHUB_API_KEY,
    GITHUB_ORG_NAME: req.params.org
  };

  switch (req.get(EVENT_HEADER)) {
    case 'release':
      processReleaseUpdate(CONFIG, (err, result) => {
        if (err) return internalServerError(res, err);
        ok(res, result);
      });
      break;
    case 'delete':
      // TODO(ludohenin): to implement.
      next();
      break;
    default:
      next();
  }
}

export function noEventFound(req, res, next) {
  accepted(res, sprintf(MSG_UNHANDLED_EVENT, req.get(EVENT_HEADER)));
}

export function anyRoutes(req, res, next) {
  notFound(res, MSG_NOT_FOUND);
}
