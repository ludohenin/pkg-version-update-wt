import {parallel, series, waterfall} from 'async';
import request from 'request';
import semver from 'semver';
import {GITHUB_API_URL_ROOT, GITHUB_USER, GITHUB_API_KEY, GITHUB_ORG_NAME} from './config';
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
      let REPO_NPM_SW_URL = `${REPO_URL}/contents/npm-shrinkwrap.json`;

      parallel([
        getRepo,
        getFile(REPO_PKG_URL),
        getFile(REPO_NPM_SW_URL)
      ], formatResult);


      function formatResult(err, result) {
        if (err) return cb(err);
        cb(null, {
          'repo': result[0],
          'package.json': result[1],
          'npm-sw.json': result[2]
        });
      }

      function getRepo(cb) {
        getFromGithub(REPO_URL, config, cb);
      }

      function getFile(url) {
        return cb => {
          getFromGithub(url, config, (err, file) => {
            if (err) return cb(err);
            if (!file.content && !file.encoding) return cb(null, null);

            let json = JSON.parse(new Buffer(file.content, file.encoding).toString('utf8'));
            cb(null, json);
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
        cb(null, `Updated repo ${d.repo.name}`);
      };
    }), cb);
  };
}

export function updatePackageFile(data, config) {
  let pkg = data['package.json'];
  let releasedRepoName = config.PAYLOAD.repository.name;
  let releasedRepoVersion = config.PAYLOAD.release.tag_name;
  let depVersion = pkg.dependencies[releasedRepoName];
  //let devDep = pkg.devDependencies[releasedRepoName];
  //let peerDep = pkg.peerDependencies[releasedRepoName];
  let re = /(\d\.\d\.\d)$/;

  if (depVersion) {
    pkg.dependencies[releasedRepoName] = replaceVersion(depVersion);
  }

  return pkg;

  function getCurrentVersion(version) {
    return re.exec(version)[0];
  }
  function replaceVersion(version) {
    let currentVersion = getCurrentVersion(depVersion);
    if (semver.lt(releasedRepoVersion, currentVersion)) return version;
    return version.replace(re, releasedRepoVersion);
  }
}

export function updateNpmSwFile(data, config) {}

export function sendPullRequest() {}





export function formatPullRequestMsg(err, data) {}

export function formatPostEventResponseMsg(cb) {
  return (err, data) => cb(err, data);
}



export function getFromGithub(endpoint, config, cb) {
  request.get({
    url: `https://${config.GITHUB_USER}:${config.GITHUB_API_KEY}@${config.GITHUB_API_URL_ROOT}/${endpoint}`,
    headers: { 'User-Agent': 'webhook' }
  }, (err, response, body) => {
      if (err) return cb(err);
      let res = response.statusCode === 200 ? body : null;
      try { cb(null, JSON.parse(body)); }
      catch (e) { cb(e); }
    });
}
