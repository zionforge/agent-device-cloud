# Direct transfer release — 2026-10-19

The hosted service now runs release `6fc4315` with the private OSS backend. Deployment and
production Agent-to-Node verification completed on 2026-10-20.

## Verified

- Real private OSS PUT/GET with 1,048,593 bytes: matching content and metadata.
- Incorrect Content-MD5: HTTP 400; overwrite: HTTP 409; anonymous GET: HTTP 403.
- Transfer-prefix cleanup: zero objects remaining.
- PostgreSQL: 12 tests, including concurrent admission of eight transfers, idempotent retries,
  released cancellation slots, Agent metadata and cleanup checkpoints.
- Agent upload requires one destination dispatch and retains its original deadline after approval.
- Concurrent identical submissions converge on one approval and transfer.
- Connector 0.1.4, Skill 0.4.0 and harness plugin 0.1.2 distributions are built.
- Final verification: 279 unit/API tests, 12 PostgreSQL tests and 24 E2E tests passed;
  one optional platform test was skipped. TypeScript, ESLint, Prettier, protocol schemas,
  console build/prerender and `git diff --check` passed.

## Hosted infrastructure

Private bucket `adc-zioon-transfers` exists in `oss-cn-shanghai`, with private ACL and ZRS.
The `transfers/` prefix has an enabled one-day expiration and multipart-abort rule.
The public download bucket remains separate.
Versioned Connector archives and prepared Skill/plugin distributions were uploaded and checked
against their size and SHA-256 metadata. Active hosted manifests now publish Connector 0.1.4,
Skill 0.4.0 and harness plugins 0.1.2. All five public Connector archive routes redirect to OSS.
Prepared manifests remain under `prepared/direct-transfer-0.1.4/` in the download bucket.

After the account administrator granted RAM management permission, the deployment created
`adc-transfer-runtime` with only the `ADCTransferRuntime` custom policy. Its credential was
encrypted to an ephemeral server key and installed in the root-owned mode-0600 service environment.
The deployment credential is not used by the storage adapter.

The runtime policy is [restricted to the private transfer prefix](../deploy/transfer-runtime-policy.json).
Real write attempts outside `transfers/` were denied with HTTP 403.

## Production evidence

- Backups of PostgreSQL, the environment, previous release link and Caddy configuration:
  `/var/lib/agent-device-cloud/backups/direct-6fc4315-20261019T171133Z`.
- Migration `0013_transfer_cleanup.sql` applied; public health returned `ok: true`.
- The existing macOS Node was updated to 0.1.4, restarted and advertised object-transfer support.
- Agent upload `xfr_0mvfilapb6f027315b134a40365d7` completed with a destination receipt.
  File size: 2,097,223 bytes; SHA-256:
  `72b792499dfb900b84e17a733c233d5ef829d43c8bf7c1d3c4ca105f6940b4c2`.
- The destination bytes matched the source. Object cleanup left zero chunks.
- Temporary verification credentials, authorization and source/destination files were removed.
- Five archive redirects, hosted Skill/plugin manifests and `adc update --check` were verified.

## Activation procedure used

1. Back up PostgreSQL, the service environment and the active release link.
2. Confirm no nonterminal local transfers remain.
3. Install the prepared release and its dependencies; publish the Connector distributions.
4. Set `ADC_TRANSFER_BACKEND=oss`, `ADC_TRANSFER_MAX_BYTES=1073741824`,
   `ADC_TRANSFER_OSS_REGION=oss-cn-shanghai`, `ADC_TRANSFER_OSS_BUCKET=adc-zioon-transfers`,
   and the dedicated runtime key in the mode-0600 service environment.
5. Restart ADC and update participating desktop Connectors to 0.1.4.
6. Execute a real Agent upload, verify its destination receipt and file SHA-256, then verify
   transfer-prefix cleanup. Check health, authentication, task execution and cleanup warnings.

Rollback restores the previous release and environment after draining object transfers.
Migration 0013 only adds a cleanup checkpoint and is compatible with the preceding release.
Temporary chunks are not a backup substitute; durable task receipts remain in PostgreSQL.
