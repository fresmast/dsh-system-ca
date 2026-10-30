/**
 * Trust the operating system certificate store inside the DSH host process.
 *
 * Node ships its own compiled-in root CA list, so certificates that only exist
 * in the OS trust store (local proxies, MITM accelerators, corporate roots) are
 * rejected by fetch/undici with UNABLE_TO_GET_ISSUER_CERT_LOCALLY. Merging the
 * system list into the default list at boot makes every later TLS connection
 * trust both.
 *
 * Process-local and reversible: restart DSH without this plugin to return to
 * the bundled-only store.
 */
import tls from "node:tls";

export const name = "system-ca";

export function apply() {
	if (typeof tls.getCACertificates !== "function" || typeof tls.setDefaultCACertificates !== "function") {
		console.warn("[system-ca] this Node.js build has no system CA API; leaving TLS trust unchanged");
		return;
	}
	try {
		const defaults = tls.getCACertificates("default");
		const system = tls.getCACertificates("system");
		const seen = new Set(defaults);
		const merged = [...defaults];
		for (const certificate of system) {
			if (seen.has(certificate)) continue;
			seen.add(certificate);
			merged.push(certificate);
		}
		tls.setDefaultCACertificates(merged);
		console.log(`[system-ca] TLS trust now covers ${merged.length} roots (${defaults.length} bundled + ${merged.length - defaults.length} system)`);
	} catch (error) {
		console.warn(`[system-ca] failed to load the system certificate store: ${error instanceof Error ? error.message : String(error)}`);
	}
}
