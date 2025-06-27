# ZT_Scan_Azure

## Overview

**ZT_Scan_Azure** is a Node.js-based tool designed to perform Zero Trust (ZT) security assessments on Azure subscriptions. It checks various Azure resources for compliance with Zero Trust principles, such as ensuring no public IPs, enforcing private endpoints, verifying diagnostic settings, and more. The tool generates a detailed HTML report summarizing the findings, including a summary chart and downloadable results.

---

## Features

- **User-provided Azure credentials:** Scan any Azure subscription by providing your own Client ID and Secret.
- **Multiple security controls:** Checks for public IPs, diagnostic settings, storage account security, disk encryption, PaaS private access, and more.
- **HTML reporting:** Generates a visually rich, downloadable HTML report with summary charts and detailed findings.
- **No secrets stored:** Credentials are not persisted; they are used only for the current scan session.

---

## Folder Structure

```
ZT_Scan_Azure/
│
├── app.js                      # Main Express server
├── .env                        # Environment variables (Tenant ID, etc.)
├── public/
│   └── index.html              # Frontend UI for user input and scan results
├── routes/
│   └── assessment.js           # Main route for handling scan requests
├── services/
│   ├── ztScanner.js            # Orchestrates all ZT checks
│   └── controls/
│       ├── checkPublicIPs.js               # Checks for public IP addresses
│       ├── checkDiagnostics.js             # Checks diagnostic settings on resources
│       ├── checkStorageAccountSecurity.js  # Checks storage account security (public access, keys)
│       ├── checkDiskSecurity.js            # Checks disk encryption and public access
│       ├── checkPaaSPrivateAccess.js       # Checks PaaS resources for private endpoint and public access
│       └── ...                             # Other control modules
├── reports/                   # Generated HTML reports (auto-created)
└── utils/
    └── extractGroup.js        # Utility to extract resource group from Azure resource ID
```

---

## How to Run

### 1. Prerequisites

- Node.js v16+ and npm installed
- An Azure AD App Registration with appropriate permissions
- Your Azure Tenant ID (placed in `.env`)

### 2. Setup

1. **Clone the repository:**
   ```sh
   git clone <repo-url>
   cd ZT_Scan_Azure
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **Configure your `.env`:**
   ```
   AZURE_TENANT_ID=<your-tenant-id>
   PORT=3000
   # (Other settings as needed)
   ```

### 3. Start the Application

```sh
node app.js
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## Usage

1. **Open the web UI:**  
   Go to [http://localhost:3000](http://localhost:3000).

2. **Enter your Azure details:**
   - **Environment:** DEV or PROD
   - **Subscription ID:** The Azure subscription you want to scan
   - **Azure Client ID:** From your Azure AD App Registration
   - **Azure Client Secret:** From your Azure AD App Registration

3. **Click "Scan":**  
   The scan will run and display results in the browser.  
   Once complete, you can download the full HTML report using the "Download Report" button.

---

## What Each JS File Does

- **app.js:**  
  Sets up the Express server, serves static files, and wires up the `/assessment` route.

- **routes/assessment.js:**  
  Handles POST requests for running a scan. Receives user credentials, sets them as environment variables, invokes the scan, and returns results/report path.

- **services/ztScanner.js:**  
  Orchestrates all Zero Trust checks by calling each control module and collecting their results.

- **services/controls/checkPublicIPs.js:**  
  Checks for public IP addresses in the subscription and flags any that exist.

- **services/controls/checkDiagnostics.js:**  
  Verifies that diagnostic settings are enabled for supported Azure resources.

- **services/controls/checkStorageAccountSecurity.js:**  
  Ensures storage accounts do not have public blob containers and that access key-based access is disabled.

- **services/controls/checkDiskSecurity.js:**  
  Checks that managed disks are not publicly accessible and that customer-managed key (CMK/MMK) encryption is enabled.

- **services/controls/checkPaaSPrivateAccess.js:**  
  Checks PaaS resources (Web Apps, SQL, Key Vault, etc.) for public access and private endpoint configuration.

- **utils/extractGroup.js:**  
  Utility function to extract the resource group name from an Azure resource ID.

---

## Security & Best Practices

- **Credentials are never stored**—they are used only for the current scan session.
- **Reports are saved in the `/reports` folder** and can be downloaded from the UI.
- **No Azure secrets are hardcoded** except for the Tenant ID, which is read from `.env`.

---

## Extending

To add new controls, create a new file in `services/controls/`, export an async function that returns a result object, and add it to the `checks` array in `ztScanner.js`.

---

## License

MIT or as specified in your repository.

---

## Support

For issues or feature requests, please open an issue in