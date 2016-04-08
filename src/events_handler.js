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


// Format the response to send to github.com.
export function formatResponse(dataList) {
  let response = dataList
    .filter(data => data !== null)
    .map(data => {
      let pkg = data.updated_pkg ? 'package.json ' : '';
      let swk = data.updated_swk ? 'npm-shrinkwrap.json ' : '';
      let none = !pkg.length && !swk.length;
      return data.repo.name + ': ' + (none ? '!! Nothing updated' : pkg + swk + 'updated');
    });
  return '- ' + response.join('\n- ');
}

// Handle `release` envent entry point.
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
      repos: cb => github.get(`orgs/${ORG}/repos`, transform(cb)),
      package: cb => github.get(`${REPO_BASE}/contents/package.json`, transform(cb)),
      shrinkwrap: cb => github.get(`${REPO_BASE}/contents/npm-shrinkwrap.json`, transform(cb)),
      refs: cb => github.get(`${REPO_BASE}/git/refs`, transform(cb))
    }, cb);
  };
}

// Iterate the list of repos to update.
function processUpdate(config) {
  return (inputs, cb) => {
    let conf = Object.assign({}, config, {inputs});
    const REPO_NAME = conf.GITHUB_EVENT_PAYLOAD.repository.name;
    let asyncCalls = inputs.repos
      .filter(repo => repo.name !== REPO_NAME)
      .map(repo => cb => waterfall([cb => cb(null, repo),
                                    updateFiles(conf),
                                    updateRepo(conf)], cb)); // Catch errors here. Error model: {error, data}

    // Run all updates.
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
      package: cb => github.get(`${REPO_BASE}/contents/package.json`, transform(cb)),
      shrinkwrap: cb => github.get(`${REPO_BASE}/contents/npm-shrinkwrap.json`, transform(cb))
    }, (err, res) => {
      if (err) return cb(null, err);
      // Assumes we always have both files all the way down.

      let pkg_update = updatePackageFileContent(res.package, REPO_NAME, RELEASE);
      let swk_update = updateShrinkwrapFileContent(conf, res.shrinkwrap, REPO_NAME, RELEASE);

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

    // Skip if nothing updated.
    if (!data.updated_pkg && !data.updated_swk) return cb(null, null);

    waterfall([
      cb => github.get(`${data.repo_url}/git/refs`, transform(cb)),
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
        getFilesFromBranch(branch);
      } else {
        let body = {
          ref: `refs/heads/${GITHUB_BRANCH_NAME}`,
          sha: base_branch.object.sha };

        github.post(`${data.repo_url}/git/refs`, body, (err, res) => {
          if (err) return cb(err);
          getFilesFromBranch(res);
        });
      }

      function getFilesFromBranch(branch) {
        parallel({
          package: cb => github.get(`${data.repo_url}/contents/package.json?ref=${GITHUB_BRANCH_NAME}`, transform(cb)),
          shrinkwrap: cb => github.get(`${data.repo_url}/contents/npm-shrinkwrap.json?ref=${GITHUB_BRANCH_NAME}`, transform(cb))
        }, (err, pkgs) => {
          if (err) return cb(err);
          pkgs.package.content = data.package.content;
          pkgs.shrinkwrap.content = data.shrinkwrap.content;
          data.package = pkgs.package;
          data.shrinkwrap = pkgs.shrinkwrap;
          cb(null, branch);
        });
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

      waterfall([ // Seems to fix an issue when using parallel (wrong sha).
        cb => github.put(`${data.repo_url}/contents/package.json`, pkg_body, transform(cb)),
        (file, cb) => github.put(`${data.repo_url}/contents/npm-shrinkwrap.json`, swk_body, (err, res) => cb(err, [file, res]))
      ], cb);
    }
    function sendPR(files, cb) {
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
function updateShrinkwrapFileContent(conf, file, depName, version) {
  let updated = false;

  if (file) {
    const SHA = conf.inputs.refs.filter(ref => ref['ref'] === `refs/tags/${version}`)[0].object.sha;
    let swk = readJSONFileContent(file);
    let dep = swk.dependencies ? swk.dependencies[depName] : null;
    let dep_src = readJSONFileContent(conf.inputs.shrinkwrap).dependencies;
    let regexp_version = /(\d\.\d\.\d)$/;
    let regexp_sha = /#(.*)$/;

    if (dep && semver.gt(version, dep.version)) {
      let _sha = regexp_sha.exec(dep.resolved)[1];
      dep.version = version;
      dep.from = dep.from.replace(regexp_version, version);
      dep.resolved = dep.resolved.replace(_sha, SHA);
      dep.dependencies = dep_src;
      writeJSONFileContent(file, swk);
      updated = true;
    }
  }

  return {
    shrinkwrap: file,
    message: updated ? 'Updated npm-shrinkwrap.json': null,
    updated
  };
}



// Utils.

function transform(cb) {
  return (err, res) => {
    if (err) return cb(err);
    if ('response' in res && 'body' in res) return cb(res);
    cb(null, res);
  };
}
