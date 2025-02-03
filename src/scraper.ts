import puppeteer, { Page } from "puppeteer";
import { generateText } from "ai";

import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { Callback, Context, SQSEvent } from "aws-lambda";
import { getCache, setCache } from "./entites/cache";
import { setData } from "./entites/database";
import { push } from "./entites/queue";

const LinkMessageSchema = z.object({
  url: z.string().url(),
  prompt: z.string(),
  type: z.enum(["explore"]),
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
    let { url, prompt, type } = parsing.data;
    if (type === "explore") {
      await explore(url, prompt);
    } else if (type === "scrape") {
      await scrape(url, prompt);
    }
  });
}
async function explore(url: string, prompt: string) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const urlSchema = z.string().url();
  if (!urlSchema.safeParse(url).success) {
    url = `https://${url}`;
    if (!urlSchema.safeParse(url).success) {
      console.error("Invalid URL");
      return;
    }
  }
  await exploreUrlsAndQueue(url, page);
}

const exploredSchema = z.object({
  count: z.number(),
  explored: z.number(),
  exploredLinks: z.array(z.string()),
  links: z.array(z.string()),
});
type Explored = z.infer<typeof exploredSchema>;

async function exploreUrlsAndQueue(url: string, page: Page) {
  if (await getCache(url)) return;
  setCache(url, "true");

  const parsedURL = new URL(url);
  const host = parsedURL.host.replace("www.", "");

  // Navigate the page to a URL
  await page.goto(parsedURL.toString());

  // const textContent = await page
  //   .locator("p, h1, h2, h3, h4, h5, h6")
  //   .map((elements) => elements.innerText)
  //   .wait();
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
  setData(url, textContent);

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a")).map((a) => a.href);
  });
  const defaultCache: Explored = {
    count: 0,
    explored: 0,
    exploredLinks: [],
    links: [],
  };

  const filteredLinks = links.filter(
    (link) => new URL(link).host.replace("www.", "") === host
  );

  for (const link of filteredLinks) {
    await push({
      url: link,
      prompt,
      type: "explore",
    });
  }
  const explored = exploredSchema.parse(JSON.parse(await getCache(host) || JSON.stringify(defaultCache)));
  


  setCache(host, JSON.stringify({
    count: filteredLinks.length,
    explored: explored.explored + 1,
    exploredLinks: [...explored.exploredLinks, url],
    links: filteredLinks,
  }));

  if (explored.explored + 1 === explored.count) {
    await push({
      url: host,
      prompt,
      type: "scrape",
    });
  }

}
export const scraper = async (url: string, prompt: string) => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const urlSchema = z.string().url();
  if (!urlSchema.safeParse(url).success) {
    url = `https://${url}`;
    if (!urlSchema.safeParse(url).success) {
      console.error("Invalid URL");
      return;
    }
  }
  const content = new Map<string, string>();

  await exploreUrls(url, page);
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

  browser.close();
  return text;
};

export async function getContent(host: string) {
  const data = await getCache(host)
  const parsed = exploredSchema.safeParse(data)
  if (!parsed.success) {
    return null
  }

  const { links} = parsed.data
  const content = new Map<string, string>();
  for (const link of links) {
    const data = await getCache(link)
    if (data) {
      content.set(link, data)
    }
  }
  return content;
 
}
export const scrape = async (host: string, prompt: string) => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

 
  const content = await getContent(host);
  if (!content) {
    return null;
  }

  await exploreUrls(host, page);
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

  browser.close();
  return text;
}
async function exploreUrls(url: string, page: Page) {
  if (await getCache(url)) return;
  setCache(url, "true");
  const parsedURL = new URL(url);
  const host = parsedURL.host.replace("www.", "");

  // Navigate the page to a URL
  await page.goto(parsedURL.toString());

  // const textContent = await page
  //   .locator("p, h1, h2, h3, h4, h5, h6")
  //   .map((elements) => elements.innerText)
  //   .wait();
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

  setData(url, textContent);
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a")).map((a) => a.href);
  });

  const filteredLinks = links.filter(
    (link) => new URL(link).host.replace("www.", "") === host
  );

  for (const link of filteredLinks) {
    await exploreUrls(link, page);
  }
}
