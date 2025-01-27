import inquirer from "inquirer";
import chalk from "chalk";
import inquirerSearchList from "inquirer-search-list";
import inquirerSearchCheckbox from "inquirer-search-checkbox";
import { loading } from "cli-loading-animation";

inquirer.registerPrompt("search-list", inquirerSearchList);
inquirer.registerPrompt("search-checkbox", inquirerSearchCheckbox);

export async function getScrapeParams() {
  const { url, prompt } = await inquirer.prompt([
    {
      type: "input",
      name: "url",
      message: "Enter the URL to scrape",
    },
    {
      type: "input",
      name: "prompt",
      message: "Enter the prompt to use",
    },
  ]);

  return { url, prompt };
}
