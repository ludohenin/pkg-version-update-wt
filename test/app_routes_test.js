import request from 'supertest';
import {expect} from 'chai';
import {sprintf} from 'sprintf-js';
import {app} from '../src/app';
import {GITHUB_EVENT_HEADER, MSG_NOT_FOUND, MSG_UNHANDLED_EVENT} from '../src/config';


describe('app routes', () => {
  it('should respond with 404 if not a POST request', done => {
    request(app)
      .get('/')
      .set({ 'Content-Type': 'application/json' })
      .end((err, res) => {
        if (err) return done(err);

        expect(res.statusCode).to.equal(404);
        expect(res.text).to.equal(MSG_NOT_FOUND);

        done();
      });
  });

  it('should respond with 400 if bad Content-Type', done => {
    request(app)
      .post('/')
      .send({})
      .end((err, res) => {
        if (err) return done(err);
        done();
      });
  });

  it('should respond with 202 if event not supported', done => {
    const EVENT_NAME = 'any_event';
    request(app)
      .post('/some-org')
      .set({ [GITHUB_EVENT_HEADER]: EVENT_NAME })
      .set({ 'Content-Type': 'application/json' })
      .end((err, res) => {
        if (err) return done(err);

        expect(res.statusCode).to.equal(202);
        expect(res.text).to.equal(sprintf(MSG_UNHANDLED_EVENT, EVENT_NAME));

        done();
      });
  });

});
