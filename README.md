# pkg-version-update-wt

Webtask/webhook to update internal modules dependencies when a new version of one of them is released.

## webtask configuration

* Add 2 secrets to your webtask `GITHUB_USER` and `GITHUB_API_KEY`.
* Add your `github organization name` parameter at the end of the webtask url https://webtask.it.auth0.com/api/run/<container_name>/<webtask_name>/:org_name

## Contribute

```bash
git clone https://github.com/ludohenin/pkg-version-update-wt.git
cd pkg-version-update-wt
npm run test -- -w
```
