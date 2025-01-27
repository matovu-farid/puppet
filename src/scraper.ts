import puppeteer, { Page } from "puppeteer";
import { generateText } from "ai";

import { openai } from "@ai-sdk/openai";
import { loading } from "cli-loading-animation";
import { z } from "zod";

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

  await exploreUrls(url, new Set(), page, content);
  const data = Object.fromEntries(content);
  const textData = JSON.stringify(data);
  const { start: startGenerating, stop: stopGenerating } = loading(
    "Generating response..."
  );
  startGenerating();

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
  stopGenerating();

  await browser.close();
  return text;
};

async function exploreUrls(
  url: string,
  exporedUrls: Set<string>,
  page: Page,
  content: Map<string, string>
) {
  if (exporedUrls.has(url)) return;
  exporedUrls.add(url);
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

  content.set(url, textContent);
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a")).map((a) => a.href);
  });

  const filteredLinks = links.filter(
    (link) => new URL(link).host.replace("www.", "") === host
  );

  for (const link of filteredLinks) {
    await exploreUrls(link, exporedUrls, page, content);
  }
}
