import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { z } from "zod";
const client = new S3Client({ region: "af-south-1" });
export async function getData<T>(
  key: string,
  schema: z.ZodSchema<T>,
  prefix?: string
) {
  try {
    const data = await client.send(
      new GetObjectCommand({
        Bucket: "scrappy-scrapped",
        Key: `${prefix ? `${prefix}/` : ""}${key}`,
      })
    );
    const body = await data.Body?.transformToString("utf-8");
    if (!body) {
      return null;
    }

    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.log(error);
    return null;
  }
}

export async function setData(key: string, data: string, prefix?: string) {
  await client.send(
    new PutObjectCommand({
      Bucket: "scrappy-scrapped",
      Key: `${prefix ? `${prefix}/` : ""}${key}`,
      Body: data,
    })
  );
}
