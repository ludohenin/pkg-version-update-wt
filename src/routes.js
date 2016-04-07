import {sprintf} from 'sprintf-js';
import {GITHUB_EVENT_HEADER, MSG_UNHANDLED_EVENT, MSG_NOT_FOUND} from './config';
import {accepted, notFound, ok, internalServerError} from './utils';
import {processReleaseUpdate, handleDeleteEvent, formatResponse} from './events_handler';
import {github} from './github';

export function handleEvent(req, res, next) {
  const CONFIG = {
    GITHUB_EVENT_PAYLOAD: req.body,
    GITHUB_USER: req.webtaskContext ? req.webtaskContext.data.GITHUB_USER : '',
    GITHUB_API_KEY: req.webtaskContext ? req.webtaskContext.data.GITHUB_API_KEY : '',
    GITHUB_ORG_NAME: req.params.org
  };

  github.init(CONFIG);

  switch (req.get(GITHUB_EVENT_HEADER)) {
    case 'release':
      processReleaseUpdate(CONFIG, (err, result) => {
        if (err) return internalServerError(res, err);
        ok(res, formatResponse(result));
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
  accepted(res, sprintf(MSG_UNHANDLED_EVENT, req.get(GITHUB_EVENT_HEADER)));
}

export function anyRoutes(req, res, next) {
  notFound(res, MSG_NOT_FOUND);
}
