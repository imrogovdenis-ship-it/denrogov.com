# Draft audience maintenance candidate — DO NOT MERGE YET

Job reckXzEm3k3UP9Udx. This branch preserves every file from remote main f697a006bc7d02f3e5cc48592588731bdc289b6e unchanged. It adds an isolated, explicit deployed-public/ root with the exact current immutable live filesystem plus the twelve approved audience UI files. Existing remote-only content is retained at its original paths, not silently deleted or newly published.

## Verified build

`docker build --pull=false -f Dockerfile.audience -t denrogov-audience-source:reckXzEm3k3UP9Udx .`

The image's 282 public files match the approved derivative byte-for-byte. Dockerfile.audience.dockerignore allows only deployed-public and the reviewed nginx config into the build context. Only that public root is copied into nginx. maintenance/ is BUILD-ONLY source; never serve it.

Reproduce audience generation:

```
cd maintenance/audience
python3 build.py --data public/audience-data/audience.json
node runtime-test.cjs
python3 test_contract.py
```

Generation starts from frozen, already-public baseline bytes, preserving all four locales and owner scale amendments. maintenance/i18n preserves prior translation dictionaries, templates and owner overrides as provenance; do not run the older generator over current owner-amended pages. Weekly JSON remains outside the image; the included maintenance snapshot is a dated real-data rendering input, not a live data source.

## Blocking deployment configuration mismatch

Coolify is currently build_pack=static, publish_directory=/, base_directory=/, custom_nginx_configuration=null, auto-deploy=true on main. It does NOT currently use this Dockerfile. Merging this branch under the current build configuration can expose build-only files, restore stale root pages and lose custom nginx routing. Do not merge, push main, or disable auto-deploy to work around this.

Parent/owner must approve and coordinate a deployment-configuration migration to Dockerfile.audience (or a separately proven explicit static publish root) and register the persistent read-only DIRECTORY mount in Coolify's durable application storage configuration. A compose-only mount survives manual container replacement but is NOT proof it survives Coolify regeneration.

Required mount: /root/work/audience-weekly-data/public -> /srv/denrogov-audience-public, read-only. Directory contains ONLY audience.json, 0755 directory and 0644 file. Nginx exposes only /audience-data/audience.json; other prefix paths return 404. Cache max-age=300, current security/CSP headers repeated because add_header inheritance resets. Never mount collector credentials/state.

## Unresolved remote differences

Remote main has 30 paths absent from live, live has 51 absent from remote, 29 common paths differ and 196 match. Source baseline includes existing remote-only encrypted /zdorovie/ content; this branch neither changes nor adds it to the deployed public root. Explicit owner review is needed for that existing source/live discrepancy, not an audience release side effect.

Do not claim source overwrite risk closed until the actual Coolify full-build configuration and persistent storage are aligned and independently verified. No production promotion was performed while this gate remained open.
