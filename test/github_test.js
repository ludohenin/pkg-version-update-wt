import {expect} from 'chai';
import clone from 'clone';
import nock from 'nock';
import {CONFIG} from './config';

import {github} from '../src/github';

const URL_BASE = `https://${CONFIG.GITHUB_USER}:${CONFIG.GITHUB_API_KEY}@api.github.com`;

let stringify = JSON.stringify;

describe('github - API request helpers', () => {
  describe('init', () => {
    before(() => github.reset());

    it ('should throw if not initialized', () => {
      expect(err).to.throw(Error, /You must initialize github module first./);
      function err() { github.get(); }
    });
  });

  describe('request methods', () => {
    before(() => github.init(CONFIG));
    after(() => github.reset());

    it('should should make a GET request', (done) => {
      nock(URL_BASE)
        .get('/').reply(200, stringify({a: 1}));

      github.get('', (err, res) => {
        expect(err).to.be.null;
        expect(res).to.deep.equal({a: 1});
        done();
      });
    });

    it('should get a special object if not expected status code', (done) => {
      nock(URL_BASE)
        .get('/').reply(404, stringify({message: 'Not found'}));

      github.get('', (err, res) => {
        expect(err).to.be.null;
        expect(res).to.have.property('response');
        expect(res).to.have.property('body');
        done();
      });
    });

    it('should should make a POST request', (done) => {
      nock(URL_BASE)
        .post('/').reply(201, stringify({a: 1}));

      github.post('', {}, (err, res) => {
        expect(err).to.be.null;
        expect(res).to.deep.equal({a: 1});
        done();
      });
    });

    it('should should make a PUT request', (done) => {
      nock(URL_BASE)
        .put('/').reply(200, stringify({a: 1}));

      github.put('', {}, (err, res) => {
        expect(err).to.be.null;
        expect(res).to.deep.equal({a: 1});
        done();
      });
    });
  });
});
