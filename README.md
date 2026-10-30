# dsh-system-ca

Make [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) **trust the operating system certificate store** inside its host process.

> Designed and written by the coding agent inside DSH (DeepSeek Harness, `deepseek-flash`), commissioned and tested by [@fresmast](https://github.com/fresmast). Every design decision here — merging CA lists at boot instead of fiddling with `NODE_OPTIONS`, shipping as a runtime plugin, and avoiding `node_modules` for the source copy — came out of measured experiments on a Windows machine whose `hosts` file was hijacked by a local TLS-terminating accelerator.

## Why

Node.js ships its own compiled-in root CA list (~121 roots) and ignores the OS trust store. If your machine reaches the internet through something that terminates TLS locally — a proxy, a GitHub accelerator, Steam++ / Watt Toolkit, Clash, a corporate MITM gateway — DSH's `web_fetch` fails with:

```
Error: web fetch failed: TypeError: fetch failed
  cause: UNABLE_TO_GET_ISSUER_CERT_LOCALLY
```

`curl` works in the same shell, because it uses Schannel and reads the Windows store. Node does not. This plugin closes that gap: at boot it merges `tls.getCACertificates("system")` into the default list with `tls.setDefaultCACertificates()`, so every later TLS connection in the host process trusts both sets.

Typical boot log:

```
[system-ca] TLS trust now covers 226 roots (121 bundled + 105 system)
```

## Install

### Option A — from GitHub, via pnpm (no bundles entry needed if you also add the patch)

```powershell
# in the DSH app directory, or wherever dsh.cmd lives
dsh plugin --profile desktop add github:fresmast/dsh-system-ca
```

Then append the mount to `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`:

```yaml
- insert:
    - id: system-ca
      name: dsh-system-ca
```

and fully restart DSH.

### Option B — as a bundle (no manual patch edit)

This package declares `dsh.bundle.patch`, so once DSH records it in the profile's `dsh.profile.bundles` list, its `cordis.patch.yml` is activated automatically. Installing through the DSH plugin market does both steps for you.

### Option C — manual / offline

```powershell
$dir = Join-Path $HOME '.dsh\plugins\dsh-system-ca'
git clone https://github.com/fresmast/dsh-system-ca $dir
# or: copy this folder there
```

Add a `link:` dependency to `%USERPROFILE%\.dsh\profiles\desktop\package.json`:

```json
"dependencies": {
  "dsh-system-ca": "link:../../plugins/dsh-system-ca"
}
```

Then, in the profile directory:

```powershell
node "...\pnpm\bin\pnpm.cjs" install
```

Add the same three-line patch entry as in Option A, and restart DSH.

> Don't drop the plugin straight into `node_modules`: a later `pnpm install` prunes undeclared folders and the plugin silently disappears. That is exactly the failure mode this repo's install steps avoid.

## Verify

1. The host log shows `[system-ca] TLS trust now covers … roots`.
2. Ask DSH to `web_fetch https://github.com` — you should get HTTP 200 and real content.
3. Control test: a fresh Node process without the plugin still fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.

PowerShell one-liner to prove the plugin logic on its own:

```powershell
$env:ELECTRON_RUN_AS_NODE = 1
& "<DSH install dir>\DeepSeek Harness.exe" --input-type=module -e @'
const tls = await import("node:tls");
const mod = await import("file:///C:/Users/<you>/.dsh/plugins/dsh-system-ca/lib/index.js");
console.log("before:", tls.getCACertificates("default").length);
mod.apply();
console.log("after:", tls.getCACertificates("default").length);
'@
```

## Notes

- Requires Node **22.15+** (or 23+) for `tls.getCACertificates()` / `tls.setDefaultCACertificates()`. On older runtimes the plugin logs a warning and leaves TLS trust untouched.
- Process-local and reversible: restart DSH without the plugin to get the bundled-only store back.
- Going through a proxy also changes DSH's SSRF behaviour: `web_fetch` validates resolved IPs only on the direct path, and a proxied hop is deliberately exempt (the proxy resolves the origin). Certificate verification still happens, which is why this plugin is needed either way.
- DSH's `NODE_OPTIONS` route does not work in a packaged Electron app ("Most NODE_OPTIONs are not supported in packaged apps"), and `NODE_EXTRA_CA_CERTS` is blocked from `.env` files — hence a runtime plugin.

## Uninstall

Remove the patch entry (or set `disabled: true` on it), remove the `dsh-system-ca` dependency from the profile's `package.json`, run `pnpm install`, and restart DSH.

## License

MIT
