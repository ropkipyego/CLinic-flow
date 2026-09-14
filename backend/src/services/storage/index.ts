import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";

export interface StoredObject {
  key: string;
  url: string;
}

export interface ObjectStorage {
  put(key: string, bytes: Buffer, contentType?: string): Promise<StoredObject>;
  getUrl(key: string): Promise<string>;
}

class LocalStorage implements ObjectStorage {
  private root = path.resolve(env.storage.localDir);

  async put(key: string, bytes: Buffer): Promise<StoredObject> {
    const dest = path.join(this.root, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, bytes);
    return { key, url: await this.getUrl(key) };
  }

  async getUrl(key: string): Promise<string> {
    if (env.storage.publicUrl) return `${env.storage.publicUrl.replace(/\/$/, "")}/${key}`;
    return `/files/${key}`;
  }
}

class S3ReadyStorage implements ObjectStorage {
  async put(_key: string, _bytes: Buffer): Promise<StoredObject> {
    throw new Error("S3 storage adapter is prepared but not configured for this deployment.");
  }
  async getUrl(key: string): Promise<string> {
    if (!env.storage.bucket) throw new Error("STORAGE_BUCKET is not configured.");
    return `https://${env.storage.bucket}.s3.${env.storage.region || "eu-west-1"}.amazonaws.com/${key}`;
  }
}

export function getObjectStorage(): ObjectStorage {
  if (env.storage.provider === "s3") return new S3ReadyStorage();
  return new LocalStorage();
}
