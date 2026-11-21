# Bundled Question Folders (`src/questions/`)

Any `.json`, `.ts`, or `.js` question folder file placed inside this directory (including nested subfolders) is **automatically discovered and bundled** into TUGofWAR for both Google AI Studio and Vercel deployments—no manual registration is needed.

## How to Add Question Folders for GitHub & Vercel
1. In TUGofWAR → **Question Bank**, click **Export All Folders (.json)** (or **Export JSON** on an individual folder).
2. Save the downloaded `.json` file inside `src/questions/` (for example: `src/questions/majar-personifikasi.ropesum.json`).
3. Push your changes to GitHub. Vercel will automatically include every folder and question in the production build.
