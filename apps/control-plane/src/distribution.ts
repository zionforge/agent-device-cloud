import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

export interface NodeDistribution {
  directory: string;
  publicUrl: string;
  downloadUrl?: string;
}

const ReleaseSummarySchema = z
  .object({
    version: z.string().min(1),
    runtimeVersion: z.string().min(1),
    buildId: z.string().regex(/^sha256:[a-f0-9]{64}$/)
  })
  .passthrough();
export type NodeReleaseSummary = z.infer<typeof ReleaseSummarySchema>;
const releaseCache = new Map<
  string,
  { expiresAt: number; value: NodeReleaseSummary | undefined }
>();

export function distributionInfo(distribution?: NodeDistribution) {
  if (!distribution) return { available: false };
  const controlPlaneUrl = new URL(distribution.publicUrl).origin;
  const downloadUrl = distribution.downloadUrl
    ? new URL(distribution.downloadUrl).href.replace(/\/$/, "")
    : `${controlPlaneUrl}/downloads/node`;
  const parsed = new URL(downloadUrl);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
      ))
  ) {
    throw new Error(
      "ADC_NODE_DOWNLOAD_URL must be HTTPS or loopback HTTP, without credentials/query/hash."
    );
  }
  return {
    available:
      !!distribution.downloadUrl ||
      (existsSync(resolve(distribution.directory, "install.sh")) &&
        existsSync(resolve(distribution.directory, "install.ps1"))),
    controlPlaneUrl,
    downloadUrl,
    installerUrl: `${downloadUrl}/install.sh`,
    windowsInstallerUrl: `${downloadUrl}/install.ps1`
  };
}

export async function latestNodeRelease(
  distribution?: NodeDistribution
): Promise<NodeReleaseSummary | undefined> {
  if (!distribution) return;
  const info = distributionInfo(distribution);
  const cacheKey = distribution.downloadUrl ?? resolve(distribution.directory);
  const cached = releaseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value: NodeReleaseSummary | undefined;
  try {
    if (distribution.downloadUrl) {
      for (const file of ["manifest-v2.json", "manifest.json"]) {
        const response = await fetch(`${info.downloadUrl}/${file}`, {
          signal: AbortSignal.timeout(3_000)
        });
        if (response.status === 404) continue;
        if (!response.ok) break;
        const body = await response.text();
        if (Buffer.byteLength(body) > 1024 * 1024) break;
        value = ReleaseSummarySchema.parse(JSON.parse(body));
        break;
      }
    } else {
      for (const file of ["manifest-v2.json", "manifest.json"]) {
        try {
          value = ReleaseSummarySchema.parse(
            JSON.parse(await readFile(resolve(distribution.directory, file), "utf8"))
          );
          break;
        } catch {
          // Try the compatible manifest name.
        }
      }
    }
  } catch {
    value = undefined;
  }
  releaseCache.set(cacheKey, { expiresAt: Date.now() + 60_000, value });
  return value;
}

export function registerDistributionRoutes(app: FastifyInstance, distribution?: NodeDistribution) {
  distributionInfo(distribution); // Validate configured URLs before accepting requests.
  async function serve(file: string, reply: FastifyReply) {
    const allowed =
      ["install.sh", "install.ps1", "manifest.json", "manifest-v2.json", "SHA256SUMS"].includes(
        file
      ) ||
      /^adc-[a-zA-Z0-9._-]+-(?:(?:darwin|linux)-(?:arm64|x64)|win32-x64)-[a-f0-9]{16}\.(?:tar\.gz|zip)$/.test(
        file
      );
    if (!distribution || !allowed)
      return reply.code(404).send({ error: "Release file not found." });
    const path = resolve(distribution.directory, file);
    try {
      if (!(await stat(path)).isFile())
        return reply.code(404).send({ error: "Release file not found." });
    } catch {
      return reply.code(404).send({
        error: "Release is not built. Run pnpm build:node or configure ADC_NODE_DOWNLOAD_URL."
      });
    }
    reply.header(
      "cache-control",
      file.endsWith(".tar.gz") || file.endsWith(".zip")
        ? "public, max-age=31536000, immutable"
        : "no-cache"
    );
    reply.type(
      file.endsWith(".tar.gz") || file.endsWith(".zip")
        ? file.endsWith(".zip")
          ? "application/zip"
          : "application/gzip"
        : file.endsWith(".json")
          ? "application/json"
          : "text/plain; charset=utf-8"
    );
    return reply.send(createReadStream(path));
  }
  app.get("/install.sh", async (_request, reply) => serve("install.sh", reply));
  app.get("/install.ps1", async (_request, reply) => serve("install.ps1", reply));
  app.get(
    "/downloads/node/:file",
    async (request: FastifyRequest<{ Params: { file: string } }>, reply) =>
      serve(request.params.file, reply)
  );
}
