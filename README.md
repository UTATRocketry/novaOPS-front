This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

Clone the repo with 
```bash
git clone [repo_url]
```

Then in the directory of the project run:
```bash
npm install 
``` 

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

**NOTE**: plots does not work at the moment. Currently in development.

Main Api route is "/front" for testing.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Troubleshooting
When attempting to run the server on Windows, you might encounter this error:
```
npm : File C:\Users\YourUser\AppData\Roaming\npm\npm.ps1 cannot be loaded because running scripts is disabled on this system
```
This typically happens due to PowerShell's execution policy, which restricts script execution for security reasons. To resolve this issue, you need to modify the execution policy in PowerShell. Follow these steps:

**Step 1: Open PowerShell as Administrator**
Search for PowerShell in the Start menu, right-click it, and select Run as Administrator.

**Step 2: Set Execution Policy**
Run the following command to allow locally created scripts to execute:

```
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
This command enables the execution of locally created scripts while still requiring remote scripts to be signed.

**Step 3: Confirm Changes**
Type Y and press Enter when prompted.

**Step 4: Restart Terminal**
Close all instances of your terminal (e.g., PowerShell, Command Prompt, or Visual Studio Code) and reopen them to apply the changes.

For more info: https://lazyadmin.nl/powershell/running-scripts-is-disabled-on-this-system/ 