import puppeteer, { Page } from "puppeteer";
import { generateText } from "ai";

import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { Callback, Context, S3Event, SQSEvent } from "aws-lambda";
import { getCache, setCache } from "./entites/cache";
import { getData, setData } from "./entites/database";
import { push } from "./entites/queue";
import UserAgent from "user-agents";

const LinkMessageSchema = z.object({
  url: z.string().url(),
  prompt: z.string(),
  type: z.enum(["explore", "scrape"]),
  host: z.string(),
  links: z.array(z.string()),
});
export async function exploreUrl(
  event: SQSEvent,
  context: Context,
  callback: Callback
) {
  event.Records.forEach(async (record) => {
    const parsing = LinkMessageSchema.safeParse(JSON.parse(record.body));
    if (!parsing.success) {
      console.error("Invalid message");
      return;
    }
    let { url, prompt, type, host, links } = parsing.data;
    if (type === "explore") {
      await explore(url, prompt, host, links);
    } else if (type === "scrape") {
      await scrape(url, prompt);
    }
  });
}
export async function explore(
  url: string,
  prompt: string,
  host: string,
  links?: string[]
) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setUserAgent(new UserAgent().toString());

  const urlSchema = z.string().url();
  if (!urlSchema.safeParse(url).success) {
    url = `https://${url}`;
    if (!urlSchema.safeParse(url).success) {
      console.error("Invalid URL");
      return;
    }
  }
  await exploreUrlsAndQueue(url, page, host, prompt, links);
  browser.close();
}

const exploredSchema = z.object({
  count: z.number(),
  explored: z.number(),
  scraped: z.boolean(),
  links: z.array(
    z.object({
      url: z.string(),
      scraped: z.boolean(),
    })
  ),
});
type Explored = z.infer<typeof exploredSchema>;

const getLinks = async (page: Page) => {
  return Array.from(document.querySelectorAll("a")).map((a) => a.href);
};

async function exploreUrlsAndQueue(
  url: string,
  page: Page,
  host: string,
  prompt: string,
  passedLinks?: string[]
) {
  const parsedURL = new URL(url);

  // Navigate the page to a URL
  await page.goto(parsedURL.toString());
  const links = passedLinks || (await getLinks(page));

  const filteredLinks = links.filter(
    (link) => new URL(link).host.replace("www.", "") === host
  );
  const {
    count,
    explored,
    links: urls,
  } = (await getCache(host, exploredSchema)) || {
    count: filteredLinks.length + 1,
    explored: 0,
    links: [...filteredLinks, url].map((link) => ({
      url: link,
      scraped: false,
    })),
    scraped: false,
  };

  const link = urls.find((link) => link.url === url);
  if (!link || link.scraped) {
    return null;
  }

  type TextElement = HTMLHeadingElement | HTMLParagraphElement;
  const textContent = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        "h1,h2, h3, h4, h5, h6, p"
      ) as unknown as TextElement[]
    )
      .map((element) => element.innerText)
      .join("\n");
  });
  setData(`url-data/${url}`, textContent);

  for (const link of filteredLinks) {
    const url = urls.find((url) => url.url === link);
    if (!url || url.scraped) continue;
    await push({
      url: link,
      host,
      links: urls.map((url) => url.url),
      prompt,
      type: "explore",
    });
  }

  setCache<Explored>(host, {
    count: filteredLinks.length,
    explored: explored + 1,
    links: urls.map((link) => ({
      ...link,
      scraped: true,
    })),
    scraped: false,
  });

  if (explored + 1 === count) {
    await push({
      url: host,
      prompt,
      type: "scrape",
    });
  }
}

export async function getContent(host: string) {
  const hostData = await getCache(host, exploredSchema);
  if (!hostData) {
    return null;
  }

  const { links } = hostData;
  const content = new Map<string, string>();
  for (const link of links) {
    const data = await getData(link.url, z.string(), "url-data");
    if (data) {
      content.set(link.url, data);
    }
  }
  return content;
}
export const scrape = async (host: string, prompt: string) => {
  const content = await getContent(host);
  if (!content) {
    return null;
  }

  const data = Object.fromEntries(content);
  const textData = JSON.stringify(data);

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system:
      "You are provided with a list of urls and their content. You are to extract the key details from the content and reply to the prompt from the user in a clear meaningful way.",
    prompt: `<Prompt>
    ${prompt}
    </Prompt>
    <Details>
    ${textData}
    </Details>`,
  });
  setData(`scraped-data/${host}`, text);

  return text;
};

export const scrappedDataAdded = async (
  event: S3Event,
  context: Context,
  callback: Callback
) => {
  const { Records } = event;
  for (const record of Records) {
    const { s3 } = record;
    const { bucket, object } = s3;
    const { key } = object;
    if (!key.includes("scraped-data")) {
      return;
    }
    const host = key.split("/")[1];

    const data = await getCache(host, exploredSchema);
    if (!data) {
      return;
    }
    setCache<Explored>(host, {
      ...data,
      scraped: true,
    });
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        message: "Scraped data added",
      }),
    });
  }
};
