# Contributing

Thanks for helping keep this list useful. "Curated" only means something if every entry meets the same bar, so please read the criteria below before suggesting a company.

## Inclusion criteria

A company can be added when all of these are true:

1. **It is the direct employer.** The company hires and pays its developers itself. Recruiting agencies, staffing firms and talent marketplaces do not qualify.
2. **It posted a remote PHP role within the last 12 months.** Link the job post (or an archived copy, for example on the Wayback Machine) as evidence in your issue or pull request.
3. **The role is remote.** Fully remote, or remote within a broad region such as "Remote, EU", counts. Hybrid or office based roles do not.
4. **It has a working careers page.** The `url` should point to where open positions are listed, not just the homepage, whenever such a page exists.

## Suggest a company without writing code

Open a [Suggest a company](https://github.com/rasoulrahimii/PHP-Remote-Jobs/issues/new?template=suggest-company.yml) issue and fill in the form. A maintainer will add the entry.

## Add a company with a pull request

All company data lives in [`companies.yml`](companies.yml). The table in the README and the website are generated from it, so **do not edit the README table by hand**. It is regenerated automatically after your pull request is merged.

1. Add an entry anywhere in `companies.yml`. Order does not matter: the output is sorted automatically.

   ```yaml
   - name: Example Co
     url: https://example.com/careers/
     industries:
       - SaaS
       - E-commerce
     benefits:
       - Home office budget
       - 30 days of paid leave
     linkedin: https://www.linkedin.com/company/example-co/jobs/
     glassdoor: https://www.glassdoor.com/Overview/Working-at-Example-Co-EI_IE000000.11,21.htm
     last_verified: 2026-10-10
   ```

2. Check your entry locally (PHP 8.2 or newer and Composer are required):

   ```bash
   composer install
   php scripts/companies.php validate
   ```

3. Open a pull request and fill in the checklist, including the link to the job post that shows the company meets the criteria.

### Fields

| Field           | Required | Description                                                                      |
|-----------------|----------|----------------------------------------------------------------------------------|
| `name`          | Yes      | Company name as the company writes it.                                           |
| `url`           | Yes      | Careers or jobs page.                                                            |
| `status`        | No       | `hiring` when a remote PHP role is open right now, `no-active-openings` when nothing PHP related is open. Leave it out if you have not checked. |
| `industries`    | Yes      | One or more industries, as a list.                                               |
| `benefits`      | No       | Notable benefits, one per list item. Leave the field out if you do not know any. |
| `linkedin`      | Yes      | The company's LinkedIn jobs page.                                                |
| `glassdoor`     | No       | The company's Glassdoor overview page, using `glassdoor.com`.                     |
| `last_verified` | Yes      | The date you checked the criteria above, as `YYYY-MM-DD`.                        |

Validation rejects unknown fields, invalid URLs, dates in the future and duplicate companies.

## Re-verify an existing entry

Every entry has a `last_verified` date. To refresh one, check that the company still meets the criteria, then update `last_verified` to today's date in a pull request. Set `status` to `hiring` if a remote PHP role is open, or to `no-active-openings` if the company still qualifies but has nothing open at the moment. If the company no longer qualifies, remove the entry instead.

Once a week, a workflow opens (or updates) an issue labelled `stale-entries` that lists every company not verified in the last 6 months. Picking items from that issue is a great first contribution.

## Report a dead link or a stale company

Open a [Report a problem](https://github.com/rasoulrahimii/PHP-Remote-Jobs/issues/new?template=report-problem.yml) issue. A weekly link check also opens an issue labelled `broken-links` when a careers page stops responding.

The link check skips LinkedIn, Glassdoor, FlexJobs and Remote.co because they block automated requests. Problems with those links need to be reported by hand.

## What runs automatically

| Workflow           | When                                       | What it does                                                    |
|--------------------|--------------------------------------------|-----------------------------------------------------------------|
| Validate companies | Every pull request                         | Runs `php scripts/companies.php validate`.                      |
| Check links        | Pull requests that change `companies.yml`  | Checks only the links added in the pull request.                |
| Regenerate README  | Pushes to `main` that change the data      | Rebuilds the README table and commits it.                       |
| Deploy site        | Pushes to `main` that change data or site  | Publishes the GitHub Pages site.                                |
| Check links        | Every Monday                               | Checks every link and keeps the `broken-links` issue up to date. |
| Stale entries      | Every Monday                               | Keeps the `stale-entries` issue up to date.                     |
