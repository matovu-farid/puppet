import { explore} from "../scraper";

export const handler = async (event: any, context: any, done: Function) => {
  try {
    const { url, prompt } = JSON.parse(event.body);
    const parsedURL = new URL(url);
    const host = parsedURL.host.replace("www.", "");
    const result = await explore(url, prompt, host);

    done(null, {
      statusCode: 200,
      body: JSON.stringify({
        result,
        url,
        prompt,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.log("An unknown error occurred");
    }
    console.log(error);
    done(error, null);
  }
};
