import request from 'request';
import {GITHUB_API_URL_ROOT} from './config';

let initialized = false;
let GITHUB_USER;
let GITHUB_API_KEY;
let GITHUB_URL_ROOT;
let GITHUB_REQUEST_HEADERS;

export const github = {
  init,
  get,
  post,
  put,
  reset
};

function init(config) {
  GITHUB_USER = config.GITHUB_USER;
  GITHUB_API_KEY = config.GITHUB_API_KEY;
  GITHUB_URL_ROOT = `https://${GITHUB_USER}:${GITHUB_API_KEY}@${GITHUB_API_URL_ROOT}`;
  GITHUB_REQUEST_HEADERS = {
    headers: {
      'User-Agent': 'webhook',
      'Content-Type': 'application/json'
    }
  };

  initialized = true;
}

function reset() {
  initialized = false;
}

function get(endpoint, cb) {
  const METHOD = 'GET';
  makeRequest(METHOD, endpoint, requestCallback(METHOD, cb));
}

function post(endpoint, body, cb) {
  const METHOD = 'POST';
  makeRequest(METHOD, endpoint, JSON.stringify(body), requestCallback(METHOD, cb));
}

function put(endpoint, body, cb) {
  const METHOD = 'PUT';
  makeRequest(METHOD, endpoint, JSON.stringify(body), requestCallback(METHOD, cb));
}

function makeRequest(method, endpoint, body, cb) {
  isInit();
  if (cb === undefined) { cb = body; body = ''; }
  let req = Object.assign({}, GITHUB_REQUEST_HEADERS, {method, body, url: `${GITHUB_URL_ROOT}/${endpoint}`});
  request(req, cb);
}

function requestCallback(method, cb) {
  return (err, response, body) => {
    if (err) return cb(err);

    let code;
    switch (method) {
      case 'GET':  code = 200; break;
      case 'POST': code = 201; break;
      case 'PUT':  code = 200; break;
      default:     code = 200;
    }

    body = body || '{}';
    try { body = JSON.parse(body); }
    catch (e) { cb(e); }

    let res = response.statusCode === code ? body : {response, body};
    cb(null, res);
  };
}

function isInit() {
  if (!initialized) throw new Error('You must initialize github module first.');
}