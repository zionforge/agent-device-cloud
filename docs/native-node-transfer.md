# Native node-to-node file transfer

ADC can copy one regular file between two authorized desktop Nodes without TOS, S3 or another
external object-storage service. The Control Plane relays verified binary chunks through local
persistent storage; neither Node needs inbound network access or a direct route to the other Node.

## Contract

- Both Nodes must belong to the same account and be included in the Agent grant.
- Both roots must be included in the grant. The source root may be read-only; the destination root
  must be writable.
- Version 0.1 copies one regular file. Directories, symlinks, overwrite and cross-account transfer
  are rejected.
- Chunk size is 1-32 MiB and defaults to 8 MiB.
- The destination is committed only after every chunk and the complete SHA-256 digest verify.

Create and track a transfer with the scoped Agent connection:

```bash
adc transfer create \
  --source-node node_source --source-root root_source --source-path models/model.bin \
  --destination-node node_target --destination-root root_target \
  --destination-path cache/model.bin \
  --idempotency-key model-copy-1 --wait 4000 --json

adc transfer wait xfr_example --wait 4000 --json
adc transfer status xfr_example --json
adc transfer cancel xfr_example --json
```

`file.transfer`, the two Nodes, and both roots must be present in the grant. Status and waiting also
require the corresponding task tools; cancellation requires `task.cancel`. A policy that requires
write approval creates one owner approval before either child dispatch starts.

## Data path

1. The Control Plane creates one durable transfer record and two child dispatches.
2. The source Node opens the authorized regular file without following a final symlink, splits it
   into chunks and uploads each chunk with a SHA-256 digest.
3. The Control Plane stores each chunk atomically below `ADC_TRANSFER_DIR`.
4. The destination Node downloads and verifies chunks, fsyncs a private `.part` file and records
   durable progress beside it.
5. After the complete-file digest matches, the destination hard-links the partial file into the
   requested path. An existing destination therefore produces a conflict rather than an overwrite.
6. The destination receipt defines transfer success. Terminal transfer reconciliation removes the
   relay chunks.

The source and destination still communicate only with the authenticated Control Plane. Chunk
requests use the same signed Node request protocol as dispatch polling and receipts.

## Deployment

Configure:

| Variable                 | Default                  | Purpose                                             |
| ------------------------ | ------------------------ | --------------------------------------------------- |
| `ADC_TRANSFER_DIR`       | `./data/transfers`       | Persistent local relay storage for in-flight chunks |
| `ADC_TRANSFER_MAX_BYTES` | `107374182400` (100 GiB) | Maximum declared size of one transfer               |

Mount `ADC_TRANSFER_DIR` on persistent storage and keep it private to the Control Plane OS user. The
directory can temporarily consume approximately the full size of every concurrent in-flight
transfer, plus filesystem metadata. Monitor capacity and inode usage. Do not place it on an
ephemeral container layer.

Transfer records are in PostgreSQL, while in-flight chunks are in `ADC_TRANSFER_DIR`; back them up
at the same recovery point only when preserving resumable in-flight work is required. Completed
transfers do not need relay backup because chunks are deleted after terminal reconciliation. A
restore containing database records without matching chunks makes affected in-flight transfers
fail and requires a new transfer submission with a new idempotency key.

The relay is intentionally local and self-hostable in version 0.1. Multi-replica Control Plane
deployments must provide a filesystem visible at the same path to every replica or keep transfer
routes on one replica. Native shared-storage and peer-to-peer adapters are not implemented.

## Failure and recovery

Chunk upload is idempotent when the bytes and digest match. The destination keeps a transfer-specific
partial file and ledger, so an interrupted download can continue from the last fsynced chunk when
the same child dispatch resumes. Cancellation is cooperative: queued children stop immediately;
running Nodes observe the cancellation through lease renewal and return a terminal receipt.

Operators should alert on sustained transfer failures, a growing `ADC_TRANSFER_DIR`, and low disk
space. Control Plane logs and task results contain transfer IDs and state, but must not log file
contents, Node private keys or complete request bodies.
