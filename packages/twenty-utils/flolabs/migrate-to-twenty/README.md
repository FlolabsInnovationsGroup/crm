# Move People and their files from one Twenty CRM to another

`migrate.mjs` copies every person, with their fields, from the FloLabs CRM into your Twenty CRM, and downloads every file attached to a person (CVs and the like). It only reads from the FloLabs CRM; it never changes anything there.

## Before you start

- **Permission:** these are applicants' personal data and CVs. Make sure the data team is cleared to hold them (John's OK) before you run it.
- **Node.js 18 or newer.** Check with `node --version`. If it is missing, install the LTS version from nodejs.org.
- **The FloLabs key:** a read-only API key Mohamed sends you privately. It expires on 27 December 2026.
- **A key from your CRM:** in your CRM, Settings > APIs & Webhooks > Create API key. Give it the Admin role, or on older versions any key, because adding fields needs admin rights.

## Set up

1. Put `migrate.mjs` and `config.example.json` in a new folder.
2. Copy `config.example.json` to `config.json` and fill it in:
   - `target.url`: your CRM address, for example `https://crm.example.com`.
   - `target.apiKey`: the key from your CRM.
   - `source.apiKey`: the FloLabs key. Leave `source.url` as it is.
   - `onExisting`: what to do with people who are **already in your CRM**, matched by email:
     - `fill-empty` (the default, and the safe choice): only their empty fields are filled. Nothing of yours is replaced. FloLabs' other email addresses are added as extra emails.
     - `overwrite`: FloLabs values replace yours, which is useful because the FloLabs data is newer than the HubSpot export. An empty FloLabs value never blanks one of yours.
3. Open a terminal in that folder:
   - **Windows:** open the folder in File Explorer, click the address bar, type `cmd` and press Enter.
   - **Mac:** right-click the folder in Finder and choose New Terminal at Folder. If it is not there, open Terminal, type `cd `, drag the folder in and press Enter.

## Run, in this order

| Command | What it does | Changes your CRM? |
| --- | --- | --- |
| `node migrate.mjs check` | Reads both CRMs and shows: how many people each has, which fields are missing in yours, which fields have a different type (those are not copied), and what happens to people you already have | No |
| `node migrate.mjs fields` | Adds the FloLabs person fields yours is missing (Stage, Positions applied for, Application date and so on), with the same options | Yes, new fields only |
| `node migrate.mjs people --limit 20` | A trial with the first 20 people. Open a few in your CRM and check they look right | Yes, 20 people |
| `node migrate.mjs people` | Copies every person. People already in your CRM are matched by email and are not duplicated | Yes |
| `node migrate.mjs files` | Downloads every file attached to a person | No |

People take about 30 minutes for 43,000. Progress shows every 200 people.

## What you get

All of this is in the `migration-output` folder:

- **`people-map.csv`:** each FloLabs person id next to their id in your CRM. New people keep the FloLabs id. People you already had keep yours.
- **`files/<FloLabs person id>/`:** the files of each person.
- **`files.csv`:** a list of every file, with the FloLabs person id. Use `people-map.csv` to find each file's person in your CRM.
- **`people-failures.csv`:** people that could not be copied, with the reason.

## If something stops

- Run the same command again. It continues from where it stopped.
- To start everything again from the beginning, delete `migration-output/state.json`. That resets both the people step and the files step. Nobody is duplicated when you rerun.
- If a select value (for example a Stage) does not exist in your CRM, the field is left empty and the run ends with a list of those values. Add the values in your CRM and run `people` again to fill them in.
- If a field shows as "different type", it is not copied. Rename or delete your field, then run `fields` and `people` again.

## What is not copied

- Links to other records: companies, payments, tasks.
- The created and updated dates, and who created the record.
- Files are downloaded, not uploaded into your CRM, because uploading works differently across Twenty versions.

## Keep it safe

- Do not share `config.json`; it holds both keys.
- Keep the downloaded files only where the data team stores personal data, and delete local copies after the import.
- Tell Mohamed when you are done, so the FloLabs key can be deleted.
