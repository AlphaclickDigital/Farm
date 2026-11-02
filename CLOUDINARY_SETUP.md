# Cloudinary Setup Instructions

## Quick Setup (5 minutes)

### 1. Create a Free Cloudinary Account

- Go to https://cloudinary.com/users/register_free
- Sign up with your email
- Verify your email

### 2. Get Your Cloud Name

- After logging in, you'll see your **Dashboard**
- Copy your **Cloud Name** (it's at the top)

### 3. Create an Upload Preset

- Go to **Settings** → **Upload** tab
- Scroll down to **Upload presets**
- Click **Add upload preset**
- Set the following:
  - **Preset name**: `farm_marketplace`
  - **Signing mode**: `Unsigned` (important!)
  - **Folder**: `farm-products` (optional, for organization)
- Click **Save**

### 4. Update Your .env File

```bash
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="your_actual_cloud_name"
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET="farm_marketplace"
```

### 5. Restart Your Dev Server

```bash
# Stop the current server (Ctrl+C)
npm run dev
```

## That's it!

Your image uploads will now work. Images will be stored on Cloudinary's CDN and automatically optimized.

## Optional: Configure Upload Settings

In your upload preset, you can:

- Set max file size
- Enable auto-format (WebP for modern browsers)
- Add transformations (resize, crop, etc.)
- Set quality levels

## Troubleshooting

- **"Upload failed"**: Check that your cloud name is correct
- **"Invalid signature"**: Make sure signing mode is set to "Unsigned"
- **"Preset not found"**: Verify the preset name matches exactly
