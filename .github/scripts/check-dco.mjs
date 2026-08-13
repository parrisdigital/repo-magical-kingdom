import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { strict as assert } from "node:assert";

const commitShaPattern = /^[0-9a-f]{40}$/;
const signoffPattern = /^Signed-off-by:\s*(.+?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/gim;
const trustedAutomatedAuthors = new Map([
  ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
]);

function signoffEmails(message) {
  return [...message.matchAll(signoffPattern)].map((match) => match[2].toLowerCase());
}

function parsedTrailers(message) {
  return execFileSync("git", ["interpret-trailers", "--parse"], {
    encoding: "utf8",
    input: message,
    maxBuffer: 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function isTrustedAutomatedCommit(pullRequestAuthor, authorName, authorEmail) {
  return (
    pullRequestAuthor === authorName &&
    trustedAutomatedAuthors.get(authorName) === authorEmail.trim().toLowerCase()
  );
}

function runSelfTest() {
  assert.deepEqual(
    signoffEmails(
      parsedTrailers("Subject\n\nSigned-off-by: Example Person <Person@Example.com>\n"),
    ),
    ["person@example.com"],
  );
  assert.deepEqual(
    signoffEmails(parsedTrailers("Subject\n\nCo-authored-by: Person <person@example.com>\n")),
    [],
  );
  assert.deepEqual(signoffEmails(parsedTrailers("Subject\n\nSigned-off-by: missing-address")), []);
  assert.equal(
    isTrustedAutomatedCommit(
      "dependabot[bot]",
      "dependabot[bot]",
      "49699333+dependabot[bot]@users.noreply.github.com",
    ),
    true,
  );
  assert.equal(
    isTrustedAutomatedCommit(
      "untrusted-contributor",
      "dependabot[bot]",
      "49699333+dependabot[bot]@users.noreply.github.com",
    ),
    false,
  );
  assert.equal(
    isTrustedAutomatedCommit("dependabot[bot]", "dependabot[bot]", "attacker@example.com"),
    false,
  );
  console.log("DCO parser self-test passed.");
}

function pullRequestRange() {
  if (!process.env.GITHUB_EVENT_PATH) {
    throw new Error("GITHUB_EVENT_PATH is required outside --self-test mode");
  }

  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const baseSha = event.pull_request?.base?.sha;
  const headSha = event.pull_request?.head?.sha;
  const pullRequestAuthor = event.pull_request?.user?.login;
  if (!commitShaPattern.test(baseSha || "") || !commitShaPattern.test(headSha || "")) {
    throw new Error("the GitHub pull_request event does not contain valid base and head SHAs");
  }
  if (typeof pullRequestAuthor !== "string" || pullRequestAuthor.length === 0) {
    throw new Error("the GitHub pull_request event does not contain a valid author login");
  }
  return { baseSha, headSha, pullRequestAuthor };
}

function git(...arguments_) {
  return execFileSync("git", arguments_, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function validateCommit(commit, pullRequestAuthor) {
  const details = git("show", "--no-patch", "--format=%an%x00%ae%x00%B", commit);
  const [authorName, authorEmail, ...messageParts] = details.split("\0");
  const message = messageParts.join("\0");
  const emails = signoffEmails(parsedTrailers(message));
  const normalizedAuthorEmail = authorEmail.trim().toLowerCase();

  if (isTrustedAutomatedCommit(pullRequestAuthor, authorName, normalizedAuthorEmail)) {
    return null;
  }

  if (!emails.includes(normalizedAuthorEmail)) {
    return {
      commit,
      author: `${authorName} <${authorEmail}>`,
      reason:
        emails.length === 0
          ? "missing a valid Signed-off-by trailer"
          : "Signed-off-by trailer does not match the commit author email",
    };
  }
  return null;
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

try {
  const { baseSha, headSha, pullRequestAuthor } = pullRequestRange();
  const output = git("rev-list", "--no-merges", `${baseSha}..${headSha}`);
  const commits = output ? output.split("\n") : [];
  const failures = commits
    .map((commit) => validateCommit(commit, pullRequestAuthor))
    .filter(Boolean);

  if (failures.length > 0) {
    console.error("DCO validation failed:\n");
    for (const failure of failures) {
      console.error(`- ${failure.commit.slice(0, 12)} ${failure.author}: ${failure.reason}`);
    }
    console.error("\nAmend each commit with `git commit --amend -s` and update the pull request.");
    process.exit(1);
  }

  console.log(`DCO validation passed for ${commits.length} non-merge commit(s).`);
} catch (error) {
  console.error(`DCO validation could not run: ${error.message}`);
  process.exit(1);
}
