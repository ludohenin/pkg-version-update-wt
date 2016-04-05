import {parallel, series, waterfall} from 'async';
import request from 'request';
import semver from 'semver';
import {sprintf} from 'sprintf';
import {
  GITHUB_API_URL_ROOT,
  GITHUB_USER,
  GITHUB_API_KEY,
  GITHUB_ORG_NAME,
  GITHUB_BRANCH_NAME,
  GITHUB_DEFAULT_BRANCH,
  GITHUB_PR_BASE,
  GITHUB_PR_TITLE,
  MSG_COMMIT_PKG_JSON,
} from './config';
import {ok} from './utils';


export function processReleaseUpdate(config, cb) {
  waterfall([
    gatherData(config),
    updateRepoFiles(config)
  ], formatPostEventResponseMsg(cb));
}

export function processDeletedTagUpdate() {
  /* NOT IMPLEMENTED YET */
}

export function formatPostEventResponseMsg(cb) {
  return (err, data) => {
    let msg = '- ';
    msg += data.filter(d => !!d).join('\n -');
    cb(err, msg);
  };
}



export function gatherData(config) {
  return cb => {
    waterfall([
      getOrgRepos(config),
      getReposData(config)
    ], cb);
  };
}

export function getOrgRepos(config) {
  return cb => {
    getFromGithub(`orgs/${config.GITHUB_ORG_NAME}/repos`, config, cb);
  };
}

export function getReposData(config) {
  return (repos, cb) => {
    parallel(repos.map(repo => cb => {
      let REPO_URL = `repos/${repo.owner.login}/${repo.name}`;
      let REPO_PKG_URL = `${REPO_URL}/contents/package.json`;
      // let REPO_NPM_SW_URL = `${REPO_URL}/contents/npm-shrinkwrap.json`;

      parallel([
        getRepo,
        getFile(REPO_PKG_URL),
        // getFile(REPO_NPM_SW_URL)
      ], formatResult);


      function formatResult(err, result) {
        if (err) return cb(err);
        cb(null, {
          repo: result[0],
          repo_url: REPO_URL,
          package_file: result[1],
          // 'npm-sw.json': result[2]
        });
      }

      function getRepo(cb) {
        getFromGithub(REPO_URL, config, cb);
      }

      function getFile(url) {
        return cb => {
          getFromGithub(url, config, (err, file) => {
            if (err) return cb(err);
            if (!file) return cb(null, null);

            cb(null, file);
          });
        };
      }
    }), cb);
  };
}



export function updateRepoFiles(config) {
  return (data, cb) => {
    parallel(data.map(d => {
      return cb => {
        let updatedPkgFile = updatePackageFile(d, config);
        // let updatedNpmSwFile = updateNpmSwFile(d, config);
        // TODO: Submit PR

        if (!updatedPkgFile) return cb(null, null);

        sendPullRequest(config)(d, cb);
      };
    }), cb);
  };
}

export function updatePackageFile(data, config) {
  let pkg_file = data.package_file;
  let pkg = JSON.parse(new Buffer(pkg_file.content, pkg_file.encoding).toString('utf8'));
  let releasedRepoName = config.GITHUB_EVENT_PAYLOAD.repository.name;
  let releasedRepoVersion = config.GITHUB_EVENT_PAYLOAD.release.tag_name;
  let depVersion = pkg.dependencies ? pkg.dependencies[releasedRepoName] : null;
  let devDepVersion = pkg.devDependencies ? pkg.devDependencies[releasedRepoName] : null;

  let re = /(\d\.\d\.\d)$/;
  let updated = false;

  if (depVersion) {
    let currentVersion = re.exec(depVersion)[0];
    if (semver.gt(releasedRepoVersion, currentVersion)) {
      pkg.dependencies[releasedRepoName] = depVersion.replace(re, releasedRepoVersion);
      pkg_file.content = new Buffer(JSON.stringify(pkg)).toString('base64');
      updated = true;
    }
  } else if (devDepVersion) {
    let currentVersion = re.exec(devDepVersion)[0];
    if (semver.gt(releasedRepoVersion, currentVersion)) {
      pkg.devDependencies[releasedRepoName] = devDepVersion.replace(re, releasedRepoVersion);
      pkg_file.content = new Buffer(JSON.stringify(pkg)).toString('base64');
      updated = true;
    }
  }

  return updated;
}

export function updateNpmSwFile(config) {}

export function sendPullRequest(config) {
  return (data, cb) => {
    waterfall([
      getBranches,
      createBranch,
      commit,
      sendPR
    ], (err, res) => {
      if (err) return cb(err);
      cb(null, `Updated package.json of ${data.repo.name}`);
    });


    function getBranches(cb) {
      getFromGithub(`${data.repo_url}/git/refs/heads`, config, cb);
    }
    function createBranch(branches, cb) {
      let branch = branches.filter(b => b.ref === `refs/heads/${GITHUB_BRANCH_NAME}`);
      if (branch) return cb(null, branch);
      let body = {
        ref: `refs/heads/${GITHUB_BRANCH_NAME}`,
        sha: branches[GITHUB_DEFAULT_BRANCH].commit.sha
      };
      postToGithub(`${data.repo_url}/git/refs`, body, config, cb);
    }
    function commit(branch, cb) {
      let body = {
        message: sprintf(MSG_COMMIT_PKG_JSON, config.GITHUB_EVENT_PAYLOAD.repository.name),
        branch: GITHUB_BRANCH_NAME,
        content: data.package_file.content,
        sha: data.package_file.sha
      };
      updateToGithub(`${data.repo_url}/contents/package.json`, body, config, cb);
    }
    function sendPR(file, cb) {
      let body = {
        title: GITHUB_PR_TITLE,
        head: `${config.GITHUB_ORG_NAME}:${GITHUB_BRANCH_NAME}`,
        base: GITHUB_PR_BASE
      };
      postToGithub(`${data.repo_url}/pulls`, body, config, cb);
    }
  };
}






export function getFromGithub(endpoint, config, cb) {
  request.get({
    url: `https://${config.GITHUB_USER}:${config.GITHUB_API_KEY}@${GITHUB_API_URL_ROOT}/${endpoint}`,
    headers: { 'User-Agent': 'webhook' }
  }, (err, response, body) => {
      if (err) return cb(err);
      let res = response.statusCode === 200 ? body : null;
      try { cb(null, JSON.parse(res)); }
      catch (e) { cb(e); }
    });
}

export function postToGithub(endpoint, body, config, cb) {
  request.post({
    url: `https://${config.GITHUB_USER}:${config.GITHUB_API_KEY}@${GITHUB_API_URL_ROOT}/${endpoint}`,
    headers: {
      'User-Agent': 'webhook',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, (err, response, body) => {
      if (err) return cb(err);
      let res = response.statusCode === 200 ? body : null;
      try { cb(null, JSON.parse(res)); }
      catch (e) { cb(e); }
    });
}

export function updateToGithub(endpoint, body, config, cb) {
  request.put({
    url: `https://${config.GITHUB_USER}:${config.GITHUB_API_KEY}@${GITHUB_API_URL_ROOT}/${endpoint}`,
    headers: {
      'User-Agent': 'webhook',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, (err, response, body) => {
      if (err) return cb(err);
      let res = response.statusCode === 200 ? body : null;
      try { cb(null, JSON.parse(res)); }
      catch (e) { cb(e); }
    });
}