import * as core from "@actions/core";
import { getInput } from "@actions/core";
import fs from "fs";
import axios, { isAxiosError } from "axios";
import { Discussion } from "./lib/discussion";
import { Repository } from "./lib/repository";

async function validateSubscription() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let repoPrivate: boolean | undefined;

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = eventData?.repository?.private;
  }

  const upstream = "abirismyname/create-discussion";
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

  core.info("");
  core.info("\u001b[1;36mStepSecurity Maintained Action\u001b[0m");
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info("\u001b[32m\u2713 Free for public repositories\u001b[0m");
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info("");

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const body: Record<string, string> = { action: action || "" };
  if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 },
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`,
      );
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`,
      );
      process.exit(1);
    }
    core.info("Timeout or API not reachable. Continuing to next step.");
  }
}

function getRepo(): Repository {
  const repository = getInput("repository-name", { required: true });
  return new Repository(repository);
}

async function getRepositoryId(): Promise<string> {
  const repositoryId = getInput("repository-id", { required: false });
  if (repositoryId !== "") {
    return repositoryId;
  }

  const repo = getRepo();
  return await repo.getId();
}

async function getCategoryId(): Promise<string> {
  const categoryId = getInput("category-id", { required: false });
  if (categoryId !== "") {
    return categoryId;
  }

  const categoryName = getInput("category-name", { required: false });
  if (categoryName === "") {
    throw new Error("Either category-id or category-name must be set");
  }

  const repo = getRepo();
  const categories = await repo.getCategories();
  return repo.getCategoryId(categoryName);
}

export default async function run(): Promise<void> {
  await validateSubscription();
  const repositoryId = await getRepositoryId();
  const categoryId = await getCategoryId();
  const title = getInput("title", { required: true });
  let body = getInput("body");
  const body_filepath = getInput("body-filepath");

  //if body-filepath is set, use it instead of body
  if (body_filepath) {
    try {
      body = fs.readFileSync(body_filepath, "utf8");
    } catch (e) {
      core.setFailed(`Failed to read body-filepath: ${e.message}`);
      return;
    }
  }

  if (body == "") {
    core.setFailed("Either body or body-filepath must be set");
    return;
  }

  // Load Discussion details
  const discussion = new Discussion(repositoryId, categoryId, title, body);
  await discussion.save();

  // Set discussion ID and URL output
  core.setOutput("discussion-id", discussion.id);
  core.setOutput("discussion-url", discussion.url);
}

try {
  run();
} catch (e) {
  core.debug(e.stack);
  core.setFailed(e);
}
