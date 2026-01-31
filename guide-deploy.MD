# UniHub Deployment Guide

This guide provides step-by-step instructions for deploying the UniHub application, with the frontend on Vercel and backend on Render.

## Table of Contents
1. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
2. [Backend Deployment (Render)](#backend-deployment-render)
3. [Post-Deployment Configuration](#post-deployment-configuration)
4. [Troubleshooting](#troubleshooting)

## Frontend Deployment (Vercel)

### Prerequisites
- Vercel account (sign up at [vercel.com](https://vercel.com))
- GitHub/GitLab/Bitbucket account with repository access

### Steps

1. **Prepare Your Repository**
   - Push your code to a Git repository (GitHub/GitLab/Bitbucket)
   - Ensure your `next.config.js` has the correct API URL pointing to your Render backend

2. **Deploy to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New" > "Project"
   - Import your Git repository
   - Configure project settings:
     - Framework: Next.js
     - Build Command: `npm run build` or `yarn build`
     - Output Directory: [.next](cci:7://file:///c:/Users/Lenovo/Desktop/unihub-deployment/unihub-deployment/.next:0:0-0:0)
     - Install Command: `npm install` or `yarn`
   - Add Environment Variables:
     ```
     NEXT_PUBLIC_API_URL=[https://your-render-app.onrender.com](https://your-render-app.onrender.com)
     # Add other frontend environment variables here
     ```
   - Click "Deploy"

3. **Configure Custom Domain (Optional)**
   - Go to your project in Vercel
   - Navigate to Settings > Domains
   - Add your custom domain and follow the verification steps

## Backend Deployment (Render)

### Prerequisites
- Render account (sign up at [render.com](https://render.com))
- MongoDB Atlas database (or your preferred database)

### Steps

1. **Prepare Your Backend**
   - Ensure your [package.json](cci:7://file:///c:/Users/Lenovo/Desktop/unihub-deployment/unihub-deployment/package.json:0:0-0:0) has these scripts:
     ```json
     "scripts": {
       "start": "node dist/server.js",
       "build": "tsc",
       "dev": "nodemon src/server.ts"
     }
     ```
   - Create a `render.yaml` file in your backend directory:
     ```yaml
     services:
       - type: web
         name: unihub-backend
         env: node
         buildCommand: npm install && npm run build
         startCommand: npm start
         envVars:
           - key: NODE_ENV
             value: production
           - key: MONGODB_URI
             value: your_mongodb_connection_string
           - key: PORT
             value: 10000
     ```

2. **Deploy to Render**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New" > "Web Service"
   - Connect your Git provider and select your repository
   - Configure the service:
     - Name: `unihub-backend`
     - Region: Choose the closest to your users
     - Branch: `main` (or your main branch)
     - Root Directory: [backend](cci:7://file:///c:/Users/Lenovo/Desktop/unihub-deployment/unihub-deployment/backend:0:0-0:0) (if your backend is in a subdirectory)
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`
   - Add environment variables:
     - `NODE_ENV=production`
     - `MONGODB_URI=your_mongodb_connection_string`
     - `PORT=10000`
     - Add other required environment variables
   - Click "Create Web Service"

## Post-Deployment Configuration

1. **Update Frontend API URL**
   - Go to your Vercel project settings
   - Update the `NEXT_PUBLIC_API_URL` to point to your Render backend URL
   - Redeploy the frontend

2. **Configure CORS**
   Ensure your backend's CORS settings allow requests from your Vercel domain:
   ```typescript
   // In your server.ts
   app.use(cors({
     origin: [
       '[https://your-vercel-app.vercel.app](https://your-vercel-app.vercel.app)',
       'http://localhost:3000'  // For local development
     ],
     credentials: true
   }));