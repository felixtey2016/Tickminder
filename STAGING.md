# TickMinder staging

This branch starts from the production source snapshot `9944ad4`. Its deployment settings target the second Cloudflare account.

## Test URLs

- [TickMinder staging](https://tickminder-staging.tickminder-qa-ngedu.workers.dev/)
- [TickLearn marketing](https://ticklearn-marketing-staging.tickminder-qa-ngedu.workers.dev/)

TickLearn, TickQuiz, TickPlay and TickGame use the respective staging Workers. Stage D1 already has the application migrations and a copy of the Next Genn Edu roster and scheduling records. Use separate test credentials. Treat the roster as private.

## Develop and deploy

1. Branch from `staging` and open a pull request into `staging`. Keep feature commits independent of hosting changes.
2. Install dependencies with `npm ci`. Run `node scripts/deploy-staging.mjs --check` to build and validate the staging bindings.
3. Sign in to Wrangler with access scoped to the second Cloudflare account. Set `TICKMINDER_STAGING_OWNER_EMAIL` to the existing staging Google administrator address using your local environment. Run `node scripts/deploy-staging.mjs` to deploy the staging Workers. The existing Workers retain their staging secrets.
4. If a change requires a database migration, review and apply it against `tickminder-staging-db` with `npx wrangler d1 migrations apply tickminder-staging-db --config wrangler.recovery.json --remote` before deploying its code. This is the existing staging database.
5. Send Felix the staging link, exact commit and test results for acceptance. After acceptance, hand off the feature commits to Codex for a separate production release. The staging hosting and deployment commits are specific to staging.

## Release workflow for TickMinder staging

- Felix authorizes staging changes and staging deployments for assigned TickMinder work. Deploy each update to staging before asking Felix to accept it. Staging deploys for assigned work do not need individual approval.
- Commit every update and push it to GitHub. Keep feature work on GitHub and deploy only the exact commit available on `staging`. Include the GitHub commit, staging URL, test results and any migration details in the acceptance message.
- Use a Git revert or a previously verified commit to recover application code. Handle D1 migrations and data recovery separately.
- Production releases are approved by Felix after staging acceptance and deployed by Codex. Keep production deployment credentials out of the staging workflow.
