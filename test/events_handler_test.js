import {expect} from 'chai';
import clone from 'clone';
import nock from 'nock';
import {CONFIG} from './config';
import {processReleaseUpdate} from '../src/events_handler';
import {github} from '../src/github';
import {GITHUB_DEFAULT_BRANCH, GITHUB_BRANCH_NAME} from '../src/config';
import {readJSONFileContent} from '../src/utils';

import org_repos from './fixtures/org_repos';
import content_package_repo_1 from './fixtures/content_package_repo_1';
import content_package_repo_4 from './fixtures/content_package_repo_4';
import content_shrink_repo_1 from './fixtures/content_shrink_repo_1';
import content_shrink_repo_4 from './fixtures/content_shrink_repo_4';
import head_master_repo_1 from './fixtures/head_master_repo_1';
import refs_repo_4 from './fixtures/refs_repo_4';

import updated_pkg_repo_4 from './fixtures/expected/updated_pkg_repo_4';

const USER = CONFIG.GITHUB_USER;
const ORG = CONFIG.GITHUB_ORG_NAME;
const URL_BASE = `https://${USER}:${CONFIG.GITHUB_API_KEY}@api.github.com`;

describe('events handler', () => {
  describe('#processReleaseUpdate', () => {

    before(() => github.init(CONFIG));

    it('should work all together', done => {
      nock(URL_BASE)
        .get(`/orgs/${ORG}/repos`)
        .reply(200, org_repos)
        .get(`/repos/${ORG}/repo_1/contents/package.json`)
        .reply(200, clone(content_package_repo_1))
        .get(`/repos/${ORG}/repo_1/contents/npm-shrinkwrap.json`)
        .reply(200, clone(content_shrink_repo_1))
        .get(`/repos/${ORG}/repo_1/git/refs/heads/${GITHUB_DEFAULT_BRANCH}`)
        .reply(200, clone(head_master_repo_1))
        .get(`/repos/${ORG}/repo_4/contents/package.json`)
        .reply(200, clone(content_package_repo_4))
        .get(`/repos/${ORG}/repo_4/contents/npm-shrinkwrap.json`)
        .reply(200, clone(content_shrink_repo_4))
        .get(`/repos/${ORG}/repo_4/git/refs`)
        .reply(200, clone(refs_repo_4))

        .get(`/repos/${ORG}/repo_4/contents/package.json`)
        .query({ ref: GITHUB_BRANCH_NAME })
        .reply(200, clone(content_package_repo_4))
        .get(`/repos/${ORG}/repo_4/contents/npm-shrinkwrap.json`)
        .query({ ref: GITHUB_BRANCH_NAME })
        .reply(200, clone(content_shrink_repo_4))

        .put(`/repos/${ORG}/repo_4/contents/package.json`)
        .reply(200)
        .put(`/repos/${ORG}/repo_4/contents/npm-shrinkwrap.json`)
        .reply(200)
        .post(`/repos/${ORG}/repo_4/git/refs`)
        .reply(201)
        .post(`/repos/${ORG}/repo_4/pulls`)
        .reply(201);


      processReleaseUpdate(CONFIG, (err, result) => {
        console.log('////// ERROR');
        console.log(err);
        if (err) console.log(err.stack);

        console.log('////// RESULT');
        (result || []).forEach(data => {
          console.log(data.repo.name);
          console.log('updated_pkg', data.updated_pkg);
          console.log('updated_swk', data.updated_swk);

          let pkg = readJSONFileContent(data.package);
          let pkg_expected = readJSONFileContent(updated_pkg_repo_4);

          expect(pkg).to.deep.equal(pkg_expected);
        });
        done();
      });
    });
  });
});

function formatContent(pkg_file) {
  return JSON.parse(new Buffer(pkg_file.content, pkg_file.encoding).toString('utf8'));
}
