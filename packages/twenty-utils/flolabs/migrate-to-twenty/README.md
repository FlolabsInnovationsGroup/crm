# Move People and their files from one Twenty CRM to another

`migrate.mjs` copies every person, with all their fields, from the FloLabs CRM into your Twenty CRM, and downloads every file attached to a person (CVs and the like). It only reads from the FloLabs CRM; it never changes anything there.

## What you need

- **Node.js 18 or newer.** Check with `node --version`. If it is missing, install the LTS version from nodejs.org.
- **The FloLabs key:** a read-only API key Mohamed sends you privately. It expires on 27 December 2026.
- **A key from your CRM:** in your CRM, Settings > APIs & Webhooks > Create API key, with the **Admin** role. Admin is needed to add the missing fields.

## Steps

1. Put `migrate.mjs` and `config.example.json` in a folder.
2. Copy `config.example.json` to `config.json` and fill in:
   - `target.url`: your CRM address, for example `https://crm.example.com`;
   - `target.apiKey`: the key from your CRM;
   - `source.apiKey`: the FloLabs key.

   Leave `source.url` as it is.
3. Open a terminal in that folder and run, one at a time:

   | Command | What it does | Changes your CRM? |
   | --- | --- | --- |
   | `node migrate.mjs check` | Reads both CRMs, shows how many people each has and which fields are missing in yours | No |
   | `node migrate.mjs fields` | Adds the FloLabs person fields yours is missing (Stage, Positions applied for, Application date, and so on), with the same options | Yes, new fields only |
   | `node migrate.mjs people` | Copies every person. Someone already in your CRM with the same email is updated, not duplicated | Yes |
   | `node migrate.mjs files` | Downloads every file attached to a person into `migration-output/files/<person id>/`, listed in `migration-output/files.csv` | No |

   `node migrate.mjs all` runs the four in order.
4. Expect about 30 minutes for 43,000 people. It can take up to a few hours if your CRM is an older Twenty version that has to update existing people one by one. Progress shows every 200 people.

## If something stops

- Run the same command again. It continues from where it stopped, using `migration-output/state.json`.
- To start a step from the beginning, delete `migration-output/state.json`.
- People that could not be copied are listed in `migration-output/people-failures.json` with the reason. Usually a value your CRM does not accept, such as a select option that differs.
- Files that could not be downloaded have the reason in the last column of `files.csv`.

## What is copied

- Every person field holding a value: name, emails, phones, links, text, numbers, dates, selects, currency, address and rich text.
- **Not copied:** links to other records (companies, payments, tasks), the created and updated dates, and who created the record.
- People keep the same id as in the FloLabs CRM when they are new to your CRM. So `files/<person id>/` matches the person in your CRM.

## Files

- Files are downloaded, not uploaded. Uploading files differs between Twenty versions.
- Each file sits in the folder named after its person's id, so you can attach them in your CRM or store them alongside.
- These are applicants' CVs and personal data. Keep them only where the data team stores such data, and delete local copies after the import.

## Security

- Do not share `config.json`; it holds both keys.
- Tell Mohamed when you are done, so the FloLabs key can be deleted before it expires.
