import {expect} from 'chai';
import clone from 'clone';
import nock from 'nock';
import {CONFIG} from './config';
import {
  org_repos_payload,
  repo_payload_1,
  repo_payload_2,
  repo_payload_3
} from './fixtures/repo_payloads';
import {
  repo_1_pkg_file,
  repo_2_pkg_file,
  repo_3_pkg_file
} from './fixtures/content_payloads';
import {repo_1} from './fixtures/package_files';
import {refs} from './fixtures/refs_heads_payload';
import {
  getFromGithub,
  getOrgRepos,
  getReposData,
  processReleaseUpdate,
  updatePackageFile
} from '../src/events_handler';


describe('events handler', () => {
  describe('#getFromGithub', () => {
    it('should return an object if status code is 200', (done) => {
      nock('https://api.github.com')
        .get('/orgs/test_org/repos')
        .reply(200, org_repos_payload);

      getFromGithub('orgs/test_org/repos', CONFIG, (err, data) => {
        expect(err).to.be.null;
        expect(data).to.be.an('array');
        expect(data).to.have.length(3);

        done();
      });
    });

    it('should return null if status code is not 20x', (done) => {
      nock('https://api.github.com')
        .get('/orgs/test_org/repos')
        .reply(404, { message: 'Not found' });

      getFromGithub('orgs/test_org/repos', CONFIG, (err, data) => {
        expect(err).to.be.null;
        expect(data).to.be.null;

        done();
      });
    });

    it('should have an error if empty body and status code is 200', (done) => {
      nock('https://api.github.com')
        .get('/orgs/test_org/repos')
        .reply(200);

      getFromGithub('orgs/test_org/repos', CONFIG, (err, data) => {
        expect(err).to.be.not.null;
        expect(data).to.be.undefined;

        done();
      });
    });
  });

  describe('#getReposData', () => {
    it('should request repo and files and return an array of objects', (done) => {
      nock('https://api.github.com')
        .get('/repos/test_org/repo_1')
        .reply(200, repo_payload_1)
        .get('/repos/test_org/repo_1/contents/package.json')
        .reply(200, repo_1_pkg_file)

        .get('/repos/test_org/repo_2')
        .reply(200, repo_payload_2)
        .get('/repos/test_org/repo_2/contents/package.json')
        .reply(200, repo_2_pkg_file)

        .get('/repos/test_org/repo_3')
        .reply(200, repo_payload_3)
        .get('/repos/test_org/repo_3/contents/package.json')
        .reply(200, repo_3_pkg_file);

      getReposData(CONFIG)(org_repos_payload, (err, result) => {
        expect(err).to.be.null;
        expect(result).to.have.length(3);
        expect(result[0]).to.have.property('repo');
        expect(result[0]).to.have.property('package_file');

        expect(result[1]).to.have.property('repo');
        expect(result[1]).to.have.property('package_file');

        expect(result[2]).to.have.property('repo');
        expect(result[2]).to.have.property('package_file');

        done();
      });
    });
  });


  describe('#updatePackageFile', () => {
    it('should update package', () => {
      let pkg = clone(repo_1_pkg_file);
      let updated = updatePackageFile({
        'package_file': pkg
      }, {
        GITHUB_EVENT_PAYLOAD: {
          repository: { name: 'my-lib' },
          release: { tag_name: '4.0.0' }
        }
      });

      expect(formatContent(pkg).dependencies['my-lib']).to.equal('github:org/my-lib#4.0.0');
      expect(updated).to.be.true;
    });

    it('should not update package if earlier version', () => {
      let pkg = clone(repo_1_pkg_file);
      let updated = updatePackageFile({
        'package_file': pkg
      }, {
        GITHUB_EVENT_PAYLOAD: {
          repository: { name: 'my-lib' },
          release: { tag_name: '0.0.0' }
        }
      });

      expect(formatContent(pkg).dependencies['my-lib']).to.equal('github:org/my-lib#1.0.0');
      expect(updated).to.be.false;
    });

  });

  describe('#processReleaseUpdate', () => {
    it('should work all together', done => {
      nock('https://api.github.com')
        .get('/orgs/test_org/repos')
        .reply(200, org_repos_payload);

      nock('https://api.github.com')
        .get('/repos/test_org/repo_1')
        .reply(200, repo_payload_1)
        .get('/repos/test_org/repo_1/contents/package.json')
        .reply(200, repo_1_pkg_file)

        .get('/repos/test_org/repo_2')
        .reply(200, repo_payload_2)
        .get('/repos/test_org/repo_2/contents/package.json')
        .reply(200, repo_2_pkg_file)

        .get('/repos/test_org/repo_3')
        .reply(200, repo_payload_3)
        .get('/repos/test_org/repo_3/contents/package.json')
        .reply(200, repo_3_pkg_file)

        .get('/repos/test_org/repo_1/git/refs/heads')
        .reply(200, refs)
        .post('/repos/test_org/repo_1/git/refs')
        .reply(200, {})
        .put('/repos/test_org/repo_1/contents/package.json')
        .reply(200, {})
        .post('/repos/test_org/repo_1/pulls')
        .reply(200, {})
        ;

      processReleaseUpdate(CONFIG, (err, result) => {
        expect(result).to.equal('- Updated package.json of repo_1');

        done();
      });
    });
  });
});

function formatContent(pkg_file) {
  return JSON.parse(new Buffer(pkg_file.content, pkg_file.encoding).toString('utf8'));
}
