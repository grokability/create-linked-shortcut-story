import * as core from "@actions/core";
import { context } from "@actions/github";
import { PullRequestLabeledEvent } from "@octokit/webhooks-types";
import { HttpClient } from "@actions/http-client";
import {
  getShortcutStoryIdFromPullRequest,
  getShortcutStoryById,
  updateShortcutStoryById,
  getShortcutIterationInfo,
  getLatestMatchingShortcutIteration,
  delay,
} from "./util";

export default async function labeled(): Promise<void> {
  const payload = context.payload as PullRequestLabeledEvent;

  // Do this up front because we want to return fast if the new label was not
  // configured for Iteration support
  const newLabel = payload.label?.name;
  if (!newLabel) {
    core.debug("missing label information from payload");
    return;
  }
  core.debug(`new label on GitHub: "${newLabel}"`);
  const clubhouseIterationInfo = getShortcutIterationInfo(newLabel);
  if (!clubhouseIterationInfo) {
    core.debug(`label "${newLabel}" is not configured for iteration matching`);
    return;
  }

  core.debug(`Waiting 10s to ensure Shortcut ticket has been created`);
  await delay(10000);
  const storyId = await getShortcutStoryIdFromPullRequest(payload);
  if (!storyId) {
    core.setFailed("Could not find Shortcut story ID");
    return;
  }
  core.debug(`Shortcut story ID: ${storyId}`);

  const http = new HttpClient();
  const story = await getShortcutStoryById(storyId, http);
  if (!story) {
    core.setFailed(`Could not get Shortcut story ${storyId}`);
    return;
  }

  const clubhouseIteration = await getLatestMatchingShortcutIteration(
    clubhouseIterationInfo,
    http
  );
  if (!clubhouseIteration) {
    core.setFailed(`Could not find Shortcut iteration for story ${storyId}`);
    return;
  }
  core.debug(
    `assigning Shortcut iteration: "${clubhouseIteration.name}", ID ${clubhouseIteration.id}`
  );
  await updateShortcutStoryById(storyId, http, {
    iteration_id: clubhouseIteration.id,
  });
  core.setOutput("iteration-url", clubhouseIteration.app_url);
  core.setOutput("iteration-name", clubhouseIteration.name);
}
