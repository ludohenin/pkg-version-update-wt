import {parallel, series, waterfall} from 'async';
import request from 'request';
import semver from 'semver';
import {sprintf} from 'sprintf-js';
import {github} from './github';
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
  MSG_COMMIT_SWK_JSON
} from './config';
import {ok, readJSONFileContent, writeJSONFileContent} from './utils';

export function formatResponse(dataList) {

}

export function processReleaseUpdate(conf, cb) {
  waterfall([
    getInputs(conf),
    processUpdate(conf)
  ], cb);
}



// Loads required resources from the released repo.
function getInputs(conf) {
  const ORG = conf.GITHUB_ORG_NAME;
  const REPO_NAME = conf.GITHUB_EVENT_PAYLOAD.repository.name;
  const REPO_BASE = `repos/${ORG}/${REPO_NAME}`;

  return cb => {
    parallel({
      repos: cb => github.get(`orgs/${ORG}/repos`, sanit(cb)),
      package: cb => github.get(`${REPO_BASE}/contents/package.json`, sanit(cb)),
      shrinkwrap: cb => github.get(`${REPO_BASE}/contents/npm-shrinkwrap.json`, sanit(cb)),
      head_master: cb => github.get(`${REPO_BASE}/git/refs/heads/${GITHUB_DEFAULT_BRANCH}`, sanit(cb))
    }, cb);
  };
}

// Iterate the list of repos to update.
function processUpdate(conf) {
  return (inputs, cb) => {
    const REPO_NAME = conf.GITHUB_EVENT_PAYLOAD.repository.name;
    // let config = Object.assign({}, conf, {inputs});
    let asyncCalls = inputs.repos
      .filter(repo => repo.name !== REPO_NAME)
      .map(repo => cb => waterfall([cb => cb(null, repo),
                                    updateFiles(conf),
                                    updateRepo(conf)], cb)); // Catch errors here. Error model: {error, data}

    parallel(asyncCalls, cb);
  };
}

// Update a dependent repo if it needs to.
function updateFiles(conf) {
  return (repo, cb) => {
    const SHRINK = conf.shrinkwrap;
    const ORG = conf.GITHUB_ORG_NAME;
    const REPO_NAME = conf.GITHUB_EVENT_PAYLOAD.repository.name;
    const REPO_BASE = `repos/${ORG}/${repo.name}`;
    const RELEASE = conf.GITHUB_EVENT_PAYLOAD.release.tag_name;

    parallel({
      package: cb => github.get(`${REPO_BASE}/contents/package.json`, sanit(cb)),
      shrinkwrap: cb => github.get(`${REPO_BASE}/contents/npm-shrinkwrap.json`, sanit(cb))
    }, (err, res) => {
      if (err) return cb(null, err);
      // Assumes we always have both files all the way down.

      let pkg_update = updatePackageFileContent(res.package, REPO_NAME, RELEASE);
      let swk_update = updateShrinkwrapFileContent(res.shrinkwrap, REPO_NAME, RELEASE);

      let data = {
        repo,
        repo_url: REPO_BASE,
        package: pkg_update.updated ? pkg_update.package: res.package,
        shrinkwrap: swk_update.updated ? swk_update.shrinkwrap : res.shrinkwrap,
        updated_pkg: pkg_update.updated,
        message_pkg: pkg_update.message,
        updated_swk: swk_update.updated,
        message_swk: swk_update.message
      };

      cb(null, data);
    });
  };
}

// Commit updates and send Pull Request
function updateRepo(conf) {
  return (data, cb) => {
    waterfall([
      cb => github.get(`${data.repo_url}/git/refs`, sanit(cb)),
      createBranch,
      commit,
      sendPR
    ], (err, res) => {
      if (err) return cb(err);
      cb(null, data);
    });

    function createBranch(refs, cb) {
      let branch = refs.filter(ref => ref.ref === `refs/heads/${GITHUB_BRANCH_NAME}`)[0];
      let base_branch = refs.filter(ref => ref.ref === `refs/heads/${GITHUB_DEFAULT_BRANCH}`)[0];

      conf.refs = refs;

      if (branch) {
        // Get the commited version of package.json
        parallel({
          package: cb => github.get(`${data.repo_url}/contents/package.json?ref=${GITHUB_BRANCH_NAME}`, sanit(cb)),
          shrinkwrap: cb => github.get(`${data.repo_url}/contents/npm-shrinkwrap.json?ref=${GITHUB_BRANCH_NAME}`, sanit(cb))
        }, (err, pkgs) => {
          if (err) return cb(err);
          pkgs.package.content = data.package.content;
          pkgs.shrinkwrap.content = data.shrinkwrap.content;
          data.package = pkgs.package;
          data.shrinkwrap = pkgs.shrinkwrap;
          cb(null, branch);
        });
      } else {
        let body = {
          ref: `refs/heads/${GITHUB_BRANCH_NAME}`,
          sha: base_branch.object.sha };

        github.post(`${data.repo_url}/git/refs`, body, cb);
      }
    }
    function commit(branch, cb) {
      const REPO_NAME = conf.GITHUB_EVENT_PAYLOAD.repository.name;
      const RELEASE = conf.GITHUB_EVENT_PAYLOAD.release.tag_name;

      let pkg_body = {
        message: sprintf(MSG_COMMIT_PKG_JSON, REPO_NAME, RELEASE),
        branch: GITHUB_BRANCH_NAME,
        content: data.package.content,
        sha: data.package.sha
      };
      let swk_body = {
        message: sprintf(MSG_COMMIT_SWK_JSON, REPO_NAME, RELEASE),
        branch: GITHUB_BRANCH_NAME,
        content: data.shrinkwrap.content,
        sha: data.shrinkwrap.sha
      };

      parallel([
        cb => github.put(`${data.repo_url}/contents/package.json`, pkg_body, cb),
        cb => github.put(`${data.repo_url}/contents/npm-shrinkwrap.json`, swk_body, cb)
      ], cb);
    }
    function sendPR(file, cb) {
      let body = {
        title: GITHUB_PR_TITLE,
        head: `${conf.GITHUB_ORG_NAME}:${GITHUB_BRANCH_NAME}`,
        base: GITHUB_PR_BASE
      };

      github.post(`${data.repo_url}/pulls`, body, (err, res) => {
        if (err) return cb(err);
        // TODO: Check for status code when not cretated
        // 404 = already exist (which is fine)
        cb(null, data);
      });
    }
  };
}

// Update package.json file.
function updatePackageFileContent(file, depName, version) {
  let pkg = readJSONFileContent(file);
  let depVersion = pkg.dependencies ? pkg.dependencies[depName] : null;
  let devDepVersion = pkg.devDependencies ? pkg.devDependencies[depName] : null;
  let re = /(\d\.\d\.\d)$/;
  let updated = false;

  if (depVersion) {
    let currentVersion = re.exec(depVersion)[0];
    if (semver.gt(version, currentVersion)) {
      pkg.dependencies[depName] = depVersion.replace(re, version);
      writeJSONFileContent(file, pkg);
      updated = true;
    }
  } else if (devDepVersion) {
    let currentVersion = re.exec(devDepVersion)[0];
    if (semver.gt(version, currentVersion)) {
      pkg.devDependencies[depName] = devDepVersion.replace(re, version);
      writeJSONFileContent(file, pkg);
      updated = true;
    }
  }

  return {
    package: file,
    message: updated ? 'Updated package.json': null,
    updated
  };
}
// Update npm-shrinkwrap.json file.
function updateShrinkwrapFileContent(src, tar) {
  let updated = false;
  return {
    shrinkwrap: src,
    message: updated ? 'Updated package.json': null,
    updated
  };
}



// Utils.

function sanit(cb) {
  return (err, res) => {
    if (err) return cb(err);
    if ('response' in res && 'body' in res) return cb(null, null);
    cb(null, res);
  };
}
