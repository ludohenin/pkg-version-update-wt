import {expect} from 'chai';
import clone from 'clone';
import nock from 'nock';
import {CONFIG} from './config';
import {processReleaseUpdate, formatResponse} from '../src/events_handler';
import {github} from '../src/github';
import {GITHUB_DEFAULT_BRANCH, GITHUB_BRANCH_NAME} from '../src/config';
import {readJSONFileContent} from '../src/utils';

import org_repos from './fixtures/org_repos';
import content_package_repo_1 from './fixtures/content_package_repo_1';
import content_package_repo_3 from './fixtures/content_package_repo_3';
import content_package_repo_4 from './fixtures/content_package_repo_4';
import content_shrink_repo_1 from './fixtures/content_shrink_repo_1';
import content_shrink_repo_3 from './fixtures/content_shrink_repo_3';
import content_shrink_repo_4 from './fixtures/content_shrink_repo_4';
import refs_repo_1 from './fixtures/refs_repo_1';
import refs_repo_3 from './fixtures/refs_repo_3';
import refs_repo_4 from './fixtures/refs_repo_4';

import updated_pkg_repo_4 from './fixtures/expected/updated_pkg_repo_4';
import updated_swk_repo_4 from './fixtures/expected/updated_swk_repo_4';

const USER = CONFIG.GITHUB_USER;
const ORG = CONFIG.GITHUB_ORG_NAME;
const URL_BASE = `https://${USER}:${CONFIG.GITHUB_API_KEY}@api.github.com`;

describe('events handler', () => {
  describe('#processReleaseUpdate', () => {

    before(() => github.init(CONFIG));
    after(() => github.reset());

    it('should work all together', done => {
      nock(URL_BASE)
        .get(`/orgs/${ORG}/repos`)
        .reply(200, org_repos)
        .get(`/repos/${ORG}/repo_1/contents/package.json`)
        .reply(200, clone(content_package_repo_1))
        .get(`/repos/${ORG}/repo_1/contents/npm-shrinkwrap.json`)
        .reply(200, clone(content_shrink_repo_1))
        .get(`/repos/${ORG}/repo_1/git/refs`)
        .reply(200, clone(refs_repo_1))

        .get(`/repos/${ORG}/repo_3/contents/package.json`)
        .reply(200, clone(content_package_repo_3))
        .get(`/repos/${ORG}/repo_3/contents/npm-shrinkwrap.json`)
        .reply(200, clone(content_shrink_repo_3))
        .get(`/repos/${ORG}/repo_3/git/refs`)
        .reply(200, clone(refs_repo_3))

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
        (result || [])
          .filter(data => !!data)
          .forEach(data => {
            let pkg = readJSONFileContent(data.package);
            let pkg_expected = readJSONFileContent(updated_pkg_repo_4);
            let swk = readJSONFileContent(data.shrinkwrap);
            let swk_expected = readJSONFileContent(updated_swk_repo_4);

            expect(pkg).to.deep.equal(pkg_expected);
            expect(swk).to.deep.equal(swk_expected);
          });

        let response = formatResponse(result);

        expect(response).to.equal('- repo_4: package.json npm-shrinkwrap.json updated');

        done();
      });
    });
  });
});
