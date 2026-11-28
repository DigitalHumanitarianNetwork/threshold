# Threshold admin — setup steps (the human clicks)

The admin area needs three things only the Google/GitHub account owner can do.
Each step says exactly where to click.

## 1. Allow the Threshold site to use "Sign in with Google" (Google Cloud console)

1. Open https://console.cloud.google.com/apis/credentials?project=workshop-auth
   (the "Workshop Auth" project used by the Members Board).
2. Under "OAuth 2.0 Client IDs", click the web client
   (410104533080-hf6usfgcbdcjaho8f70sbokssjcp0k90).
3. Under "Authorized JavaScript origins", click "Add URI" and enter:
   https://threshold.digitalhumanitarians.com
4. Save.

## 2. Create the go-between script (Google Apps Script)

1. Open the private spreadsheet "Threshold - Questions and answer keys (PRIVATE)".
2. Extensions > Apps Script. A new bound project opens.
3. Replace the default Code.gs content with this repo's apps-script/Code.gs.
4. Project Settings (gear icon) > check "Show appsscript.json manifest file",
   then in the editor open appsscript.json and replace it with this repo's
   apps-script/appsscript.json.
5. Rename the project "Threshold admin go-between" (top left).

## 3. Connect runs to GitHub (fine-grained token)

1. On GitHub: avatar > Settings > Developer settings > Personal access tokens >
   Fine-grained tokens > Generate new token.
2. Name: threshold-admin-runs. Expiration: 1 year (or custom).
3. Repository access: Only select repositories > DigitalHumanitarianNetwork/threshold.
4. Permissions: Repository permissions > Actions: Read and write. Nothing else.
5. Generate, copy the token.
6. In the Apps Script project: Project Settings > Script Properties > Add row:
   Property GITHUB_TOKEN, value = the token.
   (Optional second row: RUN_CAP, a number, default is 20 runs per day.)

## 4. Deploy the script

1. In Apps Script: Deploy > New deployment > type "Web app".
2. Execute as: Me. Who has access: Anyone.
   ("Anyone" only means the URL is reachable; every call is checked against
   the Allowlist tab before anything happens.)
3. Deploy, authorize access when asked, and copy the Web app URL (ends in /exec).
4. Send the URL to Instinct: it goes into admin.js as THR_API, one small commit.

After that, https://threshold.digitalhumanitarians.com/login.html works end to end.
Approving people never needs this page: change pending to editor or admin in the
Allowlist tab of the spreadsheet directly.
