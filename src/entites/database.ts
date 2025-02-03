import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
const client = new S3Client({ region: "af-south-1" });
export async function getData(key: string) {
  try {
    const data = await client.send(
      new GetObjectCommand({
        Bucket: "scrappy-scrapped",
        Key: key,
      })
    );
    // process data.
  } catch (error) {
    console.log(error);
  }
}

export async function setData(key: string, data: string) {
  await client.send(
    new PutObjectCommand({
      Bucket: "scrappy-scrapped",
      Key: key,
      Body: data,
    })
  );
}
