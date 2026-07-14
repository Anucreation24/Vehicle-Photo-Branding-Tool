# Thennakoon Tours – Vehicle Photo Branding Tool

An internal image-editing web application built for **Thennakoon Tours**. This tool runs entirely locally inside the user's browser, allowing staff to upload a vehicle photo, cover the original license plate with a dark-red branded "THENNAKOON TOURS" name plate, overlay the company logo as a watermark, and export/download the final image in high quality.

No images are uploaded to any server. Your data remains 100% private.

---

## 🚀 Key Features Implemented

### 1. Local Image Upload & Validation
- Large drag-and-drop file upload zone.
- Supports `JPG`, `JPEG`, `PNG`, and `WEBP` formats up to **25 MB**.
- Client-side image integrity validation (prevents corrupted file loads).
- Interactive replacement or removal of uploaded images.
- Displays metadata: filename, original dimensions, and file size.

### 2. Fabric.js Canvas Editor
- Scales uploaded images to fit the screen viewport while preserving the original aspect ratio.
- Locks the vehicle photo as a non-interactive background to prevent accidental drag/resize.
- Smooth mouse zoom-in, zoom-out, and fit-to-screen controls.
- Full desktop keyboard accessibility:
  - `Delete` / `Backspace`: Remove selected branding objects.
  - `Ctrl + Z` / `Cmd + Z`: Undo.
  - `Ctrl + Shift + Z` / `Cmd + Shift + Z` / `Ctrl + Y`: Redo.
  - Arrow keys: Nudge selected objects by `1px` (or `10px` with `Shift`).
  *(Hotkeys are automatically disabled when typing in inputs/textareas)*

### 3. Branded Name Plates
- Click **"Add Name Plate"** to place a branded maroon number plate on the image.
- Customizable settings: Edit text, change background/text/border colors, border thickness, corner rounding, opacity, rotation angle, and shadow.
- Responsive stroke preservation (`strokeUniform`) so borders do not distort during resizing.
- Includes quick-style presets:
  - **Preset 1 (Default):** Maroon background, white text, white border.
  - **Preset 2:** Black background, white text, white border.
  - **Preset 3:** White background, black text, black border.
- Multiple plates can be added for photos showing multiple vehicles/plates.

### 4. Logo Watermarking
- Automatically attempts to load the company logo watermark from `/public/branding/thennakoon-tours-logo.png`.
- Gracefully handles missing files without crashing; displays a warning and fallback options.
- Support for uploading custom transparent PNG/JPG watermarks.
- Quick position presets: **Bottom Left** (default), **Bottom Right**, **Top Left**, and **Top Right**.
- Resize, drag, adjust scale percentage (relative to canvas width), and change opacity.

### 5. Before/After Preview
- A simple **"Before / After"** view toggle allowing staff to compare the branded preview with the original vehicle photo in real-time.

### 6. Undo/Redo & Resets
- Multi-step history management for all main editing actions (adding plates, moving, scaling, deleting, changing options).
- Reset editor returns the canvas to a clean state (removes overlays, resets zoom, keeps the background image).

### 7. High-Quality Multi-Preset Exporting
- **Resolution Preservation:** Renders overlays onto an offscreen canvas at the original image's native resolution, ensuring text and logo vectors are tack-sharp.
- **Export Options:** Original size, Facebook square (1080x1080), Instagram portrait (1080x1350), or Landscape HD (1920x1080).
- **Layout Modes (for social presets):**
  - **Fit:** Shrinks photo to fit frame and pads with a customizable background color.
  - **Fill:** Fills the preset bounds and center-crops excess parts.
- Export formats: **JPG** (with quality settings 75%, 90%, 100%) and **PNG** (lossless).
- Filenames automatically increment to avoid overwriting downloads during the session (`Thennakoon-Tours-Branded-001.jpg`, etc.).

---

## 🛠️ Technology Stack
- **Framework:** Next.js (App Router)
- **Language:** TypeScript (Strict typing)
- **Styling:** Tailwind CSS (v4)
- **Canvas Engine:** Fabric.js (v6 promise-based named imports)
- **Icons:** Lucide React

---

## ⚙️ Local Development Setup

### Prerequisites
Make sure you have **Node.js (v18+)** installed.

### 1. Install Dependencies
Navigate to the directory and run:
```bash
npm install
```

### 2. Configure Logo Branding Watermark
The application searches for a default logo at:
```
/public/branding/thennakoon-tours-logo.png
```
Replace this file with your actual transparent company logo to enable automatic watermarking upon image uploads.

### 3. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
To build the application for optimized production hosting:
```bash
npm run build
npm run start
```

---

## ☁️ Deployment to Vercel

The easiest way to deploy this Next.js project is on Vercel:

1. Push your code repository to GitHub, GitLab, or Bitbucket.
2. Visit [Vercel Dashboard](https://vercel.com) and click **"Add New"** → **"Project"**.
3. Import your repository.
4. Keep the default build configurations (Vercel automatically detects Next.js).
5. Click **"Deploy"**.

---

## 🔮 Intentionally Deferred Version 2 Features
- Automatic AI number plate detection and auto-snapping.
- Four-point perspective transformation (perspective tilting of plates).
- Multi-image batch processing and ZIP download.
- Saved templates and direct social media integrations.
- User accounts and history logs.
